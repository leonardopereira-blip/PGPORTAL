#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

JS = Path('Scripts_Globais_2.html')
MARKER_PREVIO = 'PG_TOTAL_CANONICO_ACAB_DESTINO_V5'
MARKER_PATCH = 'PG_TOTAL_POR_ORIGEM_INDEPENDENTE_DESTINO_V6'


def abort(msg):
    print('\nERRO:', msg)
    print('Nenhum arquivo foi alterado.')
    sys.exit(1)


def replace_once(texto, antigo, novo, nome):
    qtd = texto.count(antigo)
    if qtd != 1:
        abort(f'{nome}: esperado 1 trecho, encontrado(s) {qtd}.')
    return texto.replace(antigo, novo, 1)


INIT_ANTIGO = '''    window.dadosTotalCanonico = [];        // Total final: PCP direto ao CD + PCP_ACABADORAS, respeitando Origem.'''

INIT_NOVO = '''    window.dadosTotalCanonico = [];        // Tiragem canônica: depende da Origem, nunca do seletor Destino.'''


TOTAL_ANTIGO = '''        // TOTAL BASE CANÔNICO:
        // - respeita Origem e filtros gerais;
        // - PCP: remove tudo que tem CD Destino classificado como acabadora;
        // - PCP_ACABADORAS: entra normalmente;
        // Assim o total NÃO empilha PCP + PCP_ACABADORAS para o mesmo caminho.
        if (passaCategoriasAtuais && daOrigem) {
            const ehFonteAcabadoraTotal = origemLinha === 'ACABADORA';
            const pcpVaiParaAcabadoraTotal = !ehFonteAcabadoraTotal &&
                typeof window.pgEhDestinoAcabadora === 'function' && window.pgEhDestinoAcabadora(l);
            if (ehFonteAcabadoraTotal || !pcpVaiParaAcabadoraTotal) {
                window.dadosTotalCanonico.push(l);
            }
        }
'''

TOTAL_NOVO = '''        // TIRAGEM / TOTAL BASE CANÔNICO — REGRA DEFINITIVA:
        // O seletor extra Destino (Todos / CD Destino / Acabadora) NÃO altera a tiragem.
        // A tiragem reage à Origem e aos filtros gerais:
        //   Origem = Gráfica    -> PCP completo.
        //   Origem = Acabadora  -> PCP_ACABADORAS completo.
        //   Origem = Todas      -> PCP_ACABADORAS + PCP, retirando do PCP o que tem
        //                          CD Destino classificado como acabadora.
        // Em Todas, a retirada do PCP evita empilhar o mesmo caminho antes e depois da acabadora.
        if (passaCategoriasAtuais) {
            const ehFonteAcabadoraTotal = origemLinha === 'ACABADORA';
            const pcpVaiParaAcabadoraTotal = !ehFonteAcabadoraTotal &&
                typeof window.pgEhDestinoAcabadora === 'function' && window.pgEhDestinoAcabadora(l);

            let entraTotalCanonico = false;
            if (origem === 'GRAFICA') {
                entraTotalCanonico = !ehFonteAcabadoraTotal; // PCP completo, inclusive PCP -> acabadora.
            } else if (origem === 'ACABADORA') {
                entraTotalCanonico = ehFonteAcabadoraTotal;  // somente PCP_ACABADORAS.
            } else { // TODOS
                entraTotalCanonico = ehFonteAcabadoraTotal || !pcpVaiParaAcabadoraTotal;
            }

            if (entraTotalCanonico) window.dadosTotalCanonico.push(l);
        }
'''


BASE_ANTIGA = '''    // BASE CANÔNICA DO TOTAL / TABELAS
    // Em Todos e CD, o Total parte SEMPRE da mesma regra final:
    // PCP sem destinos de acabadora + PCP_ACABADORAS, respeitando a Origem.
    // Isso impede que Destino = CD fique maior que Destino = Todos.
    // Destino = Acabadora mantém a base filtrada específica desse destino.
    const destinoAtualCanon = document.getElementById('pgFiltroDestino')?.value || 'TODOS';
    const usaBaseFinalCanonica = destinoAtualCanon === 'TODOS' || destinoAtualCanon === 'CD';
    const linhasBaseCanonica = usaBaseFinalCanonica
        ? (window.dadosTotalCanonico || [])
        : (dadosPadrao || []);'''

BASE_NOVA = '''    // BASE CANÔNICA DO TOTAL / TABELAS
    // A tiragem NÃO reage ao seletor extra Destino.
    // Ela já foi montada em aplicarFiltros() exclusivamente pela Origem:
    // Gráfica = PCP | Acabadora = PCP_ACABADORAS | Todas = PCP direto + PCP_ACABADORAS.
    const linhasBaseCanonica = window.dadosTotalCanonico || [];'''


GRID_ANTIGO = '''    // IMPORTANTE: não altera a lógica/volumes das fases do Funil.
    // Apenas faz as tabelas usarem o mesmo denominador/base do Total do Funil.
    Object.keys(mGrid).forEach(m => { mGrid[m].total = baseMarcaCanonica[m] || 0; });
    Object.keys(gGrid).forEach(g => { gGrid[g].total = baseGraficaCanonica[g] || 0; });

    let tGeral = Object.values(baseTotalCanonica).reduce((a,b)=>a+b, 0);'''

GRID_NOVO = '''    // IMPORTANTE: não altera a lógica/volumes das fases do Funil.
    // Apenas faz Funil e tabelas compartilharem exatamente a mesma tiragem canônica.
    // Cria também linhas de Marca/Gráfica que existam na tiragem, mesmo que o Destino
    // atualmente selecionado não tenha volume em alguma fase.
    Object.keys(baseMarcaCanonica).forEach(m => {
        if (!mGrid[m]) {
            mGrid[m] = { total: 0, pcp: {total:0}, acab: {total:0}, series: {} };
            fasesAtivas.forEach(f => mGrid[m][f.id] = initFase());
        }
    });
    Object.keys(baseGraficaCanonica).forEach(g => {
        if (!gGrid[g]) {
            gGrid[g] = { total: 0, pcp: {total:0}, acab: {total:0}, series: {} };
            fasesAtivas.forEach(f => gGrid[g][f.id] = initFase());
        }
    });
    Object.keys(mGrid).forEach(m => { mGrid[m].total = baseMarcaCanonica[m] || 0; });
    Object.keys(gGrid).forEach(g => { gGrid[g].total = baseGraficaCanonica[g] || 0; });

    let tGeral = Object.values(baseTotalCanonica).reduce((a,b)=>a+b, 0);'''


def main():
    if not JS.exists():
        abort(f'Arquivo não encontrado: {JS}')

    texto = JS.read_text(encoding='utf-8')

    if MARKER_PATCH in texto:
        abort('Este ajuste já está aplicado. Não vou aplicar duas vezes.')
    if MARKER_PREVIO not in texto:
        abort('A versão anterior esperada do Funil não foi identificada.')

    obrigatorios = [
        "const PG_ACABADORAS = ['ANTILHAS', 'ANTIHAS', 'FELK', 'TRATTO', 'EMBALARTE', 'HR'];",
        "const origem = document.getElementById('pgFiltroOrigem')?.value || 'GRAFICA';",
        "const destinoExtra = document.getElementById('pgFiltroDestino')?.value || 'TODOS';",
        "if (destinoExtra !== 'ACAB') {",
        "else if (pcpVaiParaAcabadoraAcab) entraAcabamento = congeladoSim;",
        "const linhasBaseCanonica = usaBaseFinalCanonica",
    ]
    for trecho in obrigatorios:
        if trecho not in texto:
            abort('Scripts_Globais_2.html não corresponde à versão esperada. Faltou: ' + trecho)

    novo = replace_once(texto, INIT_ANTIGO, INIT_NOVO, 'Comentário da tiragem canônica')
    novo = replace_once(novo, TOTAL_ANTIGO, TOTAL_NOVO, 'Regra definitiva do Total por Origem')
    novo = replace_once(novo, BASE_ANTIGA, BASE_NOVA, 'Total/Tabelas independentes do Destino')
    novo = replace_once(novo, GRID_ANTIGO, GRID_NOVO, 'Sincronização das tabelas com a tiragem do Funil')

    pos = novo.rfind('</script>')
    if pos < 0:
        abort('Fim de Scripts_Globais_2.html não encontrado.')
    novo = novo[:pos] + f'\n<!-- {MARKER_PATCH} -->\n' + novo[pos:]

    checks = [
        ("if (origem === 'GRAFICA')", 'Origem Gráfica usa PCP'),
        ("entraTotalCanonico = !ehFonteAcabadoraTotal", 'PCP completo em Origem Gráfica'),
        ("else if (origem === 'ACABADORA')", 'Origem Acabadora usa PCP_ACABADORAS'),
        ("entraTotalCanonico = ehFonteAcabadoraTotal || !pcpVaiParaAcabadoraTotal", 'Origem Todas sem duplicidade PCP -> acabadora'),
        ('const linhasBaseCanonica = window.dadosTotalCanonico || [];', 'Total independente do Destino'),
        ("if (destinoExtra !== 'ACAB')", 'regra soberana do Acabamento preservada'),
        ('baseMarcaCanonica', 'base de Marca canônica'),
        ('baseGraficaCanonica', 'base de Gráfica canônica'),
        (MARKER_PATCH, 'marker do patch'),
    ]
    for trecho, nome in checks:
        if trecho not in novo:
            abort('Validação final falhou: ' + nome)

    # Garante que o seletor Destino não voltou a decidir a tiragem canônica.
    trecho_base = novo[novo.index('// BASE CANÔNICA DO TOTAL / TABELAS'):novo.index('const baseTotalCanonica', novo.index('// BASE CANÔNICA DO TOTAL / TABELAS'))]
    if 'pgFiltroDestino' in trecho_base or 'dadosPadrao' in trecho_base:
        abort('Validação final falhou: a base canônica ainda depende do seletor Destino.')

    bak = Path(str(JS) + '.bak')
    shutil.copy2(JS, bak)
    print('Backup criado:', bak)

    JS.write_text(novo, encoding='utf-8')

    print('\nOK: correção definitiva aplicada.')
    print('- O seletor DESTINO não altera mais a Tiragem / Total Base.')
    print('- ORIGEM = Gráfica: Tiragem = PCP completo.')
    print('- ORIGEM = Acabadora: Tiragem = PCP_ACABADORAS completo.')
    print('- ORIGEM = Todas: Tiragem = PCP_ACABADORAS + PCP sem os destinos de acabadora.')
    print('- Lista de acabadoras: ANTILHAS, ANTIHAS, FELK, TRATTO, EMBALARTE, HR.')
    print('- Funil e tabelas usam exatamente a mesma tiragem canônica.')
    print('- A regra soberana do Acabamento foi preservada e continua separada da Tiragem.')
    print('Próximo passo: clasp push')


if __name__ == '__main__':
    main()
