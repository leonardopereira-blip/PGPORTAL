const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('Tipo global usa a classificação do Armazém em todas as bases e preserva as demais categorias', () => {
  const aluno = {...pcp('aluno'), TIPO:'  aluno  '};
  const professor = {...pcp('professor'), TIPO:'Professor'};
  const apoio = {...pcp('apoio'), TIPO:'Material de Apoio'};
  const vazio = pcp('sem-tipo');
  const p = portal([aluno, professor, apoio, vazio], 'TODOS', 'CD');
  assert.deepEqual(p.checks.get('Tipo').map(cb => cb.value).sort(),
    ['(Vazio)', 'ALUNO', 'MATERIAL DE APOIO', 'PROFESSOR']);
  p.w.checkOnlyGeral('Tipo', 'PROFESSOR');
  for (const nome of ['pgBaseGeralReportExecutiva','dadosTotalCanonico','dadosBaseEntCDPortal',
    'dadosBaseTPPortal','dadosBaseForecastColeta','dadosFasesEstaticas']) {
    assert.deepEqual(Array.from(p.w[nome]), [professor], nome+' respeita o Tipo selecionado');
  }
  p.w.checkOnlyGeral('Tipo', '(Vazio)');
  assert.deepEqual(p.linhas, [vazio]);
  p.w.checkAllGeral('Tipo', true);
  assert.deepEqual(p.linhas, [aluno, professor, apoio, vazio]);
});

test('troca de fatia conserva a seleção global de Tipo sem perder aluno ou categorias adicionais', () => {
  const aluno = {...pcp('aluno'), TIPO:'ALUNO'};
  const professor = {...pcp('professor'), TIPO:'PROFESSOR'};
  const p = portal([aluno, professor]);
  p.w.checkOnlyGeral('Tipo','PROFESSOR');
  const outroAluno = {...pcp('aluno-2'), TIPO:'aluno'};
  const outroProfessor = {...pcp('professor-2'), TIPO:' professor '};
  p.anexar([outroAluno,outroProfessor]);
  assert.deepEqual(p.linhas, [professor,outroProfessor]);
  p.w.limparFiltros();
  assert.deepEqual(p.linhas, [aluno,professor,outroAluno,outroProfessor]);
});

function trecho(inicio, fim) {
  const a = source.indexOf(inicio);
  const b = source.indexOf(fim, a);
  assert.ok(a >= 0 && b > a, `Trecho real indisponivel: ${inicio}`);
  return source.slice(a, b);
}

// Apenas o DOM e os motores de renderizacao sao simulados. As opcoes, os
// checkboxes, o roteamento e a aplicacao dos filtros executam o codigo do portal.
function portal(linhas, origem = 'TODOS', destino = 'TODOS') {
  const checks = new Map();
  const controles = new Map([
    ['filtroReferencia', { value: 'replan' }],
    ['pgFiltroOrigem', { value: origem }],
    ['pgFiltroDestino', { value: destino, disabled: false }]
  ]);
  let markup = '';
  controles.set('containerFiltrosMultiProducao', {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      checks.clear();
      for (const [, input] of value.matchAll(/<input\b([^>]*)>/g)) {
        const classe = input.match(/class="([^"]*)"/)?.[1];
        const categoria = classe?.match(/\bchk-geral-([^\s]+)/)?.[1];
        if (!categoria) continue;
        const checkbox = {
          value: input.match(/value="([^"]*)"/)?.[1] || '',
          checked: /\schecked(?:\s|$)/.test(input)
        };
        if (!checks.has(categoria)) checks.set(categoria, []);
        checks.get(categoria).push(checkbox);
      }
    }
  });
  const document = {
    getElementById(id) {
      if (id.startsWith('btn-filtro-geral-')) {
        return { classList: { add() {}, remove() {} } };
      }
      return controles.get(id) || null;
    },
    querySelectorAll(selector) {
      const filtro = selector.match(/^\.chk-geral-([^:]+)(:checked|:not\(:checked\))?$/);
      if (filtro) {
        const list = checks.get(filtro[1]) || [];
        if (filtro[2] === ':checked') return list.filter(cb => cb.checked);
        if (filtro[2] === ':not(:checked)') return list.filter(cb => !cb.checked);
        return list;
      }
      if (selector === 'input[class*="chk-geral-"]') return [...checks.values()].flat();
      return [];
    },
    addEventListener() {}
  };
  const context = vm.createContext({
    window: { dadosGlobais: linhas, pgAtualizarAbaProducao() {} },
    document,
    console: { info() {} },
    performance: { now: () => 0 },
    FASES: [],
    injetarDatasMapa() {}
  });
  const executar = codigo => vm.runInContext(codigo, context);
  executar(trecho('    const pgChavesLinhas =', '    // As visões por fase'));
  executar(trecho('window.pgCampoColeta =', 'window.pgBaseForecastFiltrada ='));
  executar(trecho('    window.pgSolicitacaoCancelada =', '    function iniciarDashboard('));
  executar(trecho("    const PG_ACABADORAS = ['HR'", '    function pgFmtCompacto('));
  executar(trecho('    window.listasMultiProducao =', '    function injetarDatasMapa()'));
  executar(trecho('function aplicarFiltros() {', '    function atualizarOpcoesFiltroMatriz()'));
  executar(trecho('    function iniciarDashboard(', '    // MOTOR DE FILTROS GLOBAIS'));
  context.window.aplicarFiltros = context.aplicarFiltros;
  // Os seletores de Origem/Destino ja estao representados pelos controles acima.
  context.window.pgMontarFiltrosExtras = () => {};
  context.iniciarDashboard(linhas);
  return {
    w: context.window,
    get linhas() { return Array.from(context.dadosFiltrados); },
    checks,
    anexar(fatia) { return context.window.pgAnexarDadosDashboard(fatia); },
    selecionar(o, d) {
      controles.get('pgFiltroOrigem').value = o;
      controles.get('pgFiltroDestino').value = d;
      context.aplicarFiltros();
    }
  };
}

function pcp(id, grafica = 'LOGPRINT', cdMapa = 'CD JDI') {
  return {
    _SOURCE: 'PCP', _ROW_ID: id, Chave: id,
    'GRÁFICA': grafica, GRAFICA_FINAL: grafica,
    UNIDADE: 'SAS', MARCA_FINAL: 'SAS',
    CD_MAPA: cdMapa, 'CD DESTINO': 'CD ORIGINAL',
    CICLO: '2026', ENVIO: 'V1', Congelado: 'Sim', TIRAGEM: 100
  };
}

function acabadora(id, grafica) {
  const linha = pcp(id, grafica);
  delete linha.CD_MAPA;
  return { ...linha, _SOURCE: 'ACABADORA', 'CD DESTINO': 'CD JDI', CD_FINAL: 'CD JDI' };
}

test('CD_MAPA vazio aparece marcado, sobrevive Marcar Todos e segue para Acabadora', () => {
  const vazio = pcp('vazio', 'LOGPRINT', '');
  const direto = pcp('direto');
  const p = portal([vazio, direto], 'TODOS', 'ACAB');
  assert.deepEqual(p.checks.get('CDDestino').map(cb => [cb.value, cb.checked]), [
    ['(Vazio)', true], ['CD JDI', true]
  ]);
  p.w.checkAllGeral('CDDestino', true);
  assert.deepEqual(p.linhas, [vazio]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [vazio]);
  assert.equal(p.w.pgEhDestinoAcabadora(vazio), true);
  assert.equal(p.w.pgEhDestinoCD(vazio), false);
  p.selecionar('TODOS', 'TODOS');
  assert.deepEqual(p.linhas, [vazio, direto]);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [direto]);
});

test('CD especifico exclui vazio desmarcado; Marcar Todos o restaura', () => {
  const vazio = pcp('vazio', 'LOGPRINT', '');
  const jdi = pcp('jdi');
  const forCD = pcp('for', 'LEOGRAF', 'CD FOR');
  const p = portal([vazio, jdi, forCD]);
  p.w.checkOnlyGeral('CDDestino', 'CD JDI');
  assert.deepEqual(p.linhas, [jdi]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [jdi]);
  assert.equal(p.checks.get('CDDestino').find(cb => cb.value === '(Vazio)').checked, false);
  p.w.checkAllGeral('CDDestino', true);
  assert.deepEqual(p.linhas, [vazio, jdi, forCD]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [vazio, jdi, forCD]);
});

test('grafica WALPRINT e REPROSET conserva destino CD quando CD_MAPA e um CD', () => {
  const walprint = pcp('walprint', 'WALPRINT');
  const reproset = pcp('reproset', 'REPROSET', 'CD FOR');
  const direto = pcp('direto');
  const p = portal([walprint, reproset, direto], 'TODOS', 'ACAB');
  assert.deepEqual(p.linhas, []);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [walprint, reproset, direto]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [walprint, reproset, direto]);
  assert.deepEqual(Array.from(p.w.dadosBaseTPPortal), [walprint, reproset, direto]);
  p.w.checkOnlyGeral('Gráfica', 'WALPRINT');
  assert.deepEqual(p.linhas, [walprint]);
  p.w.checkAllGeral('Gráfica', true);
  p.selecionar('GRAFICA', 'CD');
  assert.deepEqual(p.linhas, [walprint, reproset, direto]);
});

test('somente destino WALPRINT REPROSET ou vazio encaminha a excecao para Acabadora', () => {
  const destinoWalprint = pcp('dest-walprint', 'LOGPRINT', 'WALPRINT');
  const destinoReproset = pcp('dest-reproset', 'LEOGRAF', 'REPROSET');
  const vazio = pcp('vazio', 'WALPRINT', '');
  const direto = pcp('direto', 'REPROSET');
  direto['CD DESTINO'] = 'WALPRINT'; // O destino original nao substitui CD_MAPA.
  const p = portal([destinoWalprint, destinoReproset, vazio, direto], 'TODOS', 'ACAB');
  assert.deepEqual(p.linhas, [destinoWalprint, destinoReproset, vazio]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [destinoWalprint, destinoReproset, vazio]);
  for (const linha of [destinoWalprint, destinoReproset, vazio]) {
    assert.equal(p.w.pgEhDestinoAcabadoraGraficaFiltro(linha), true);
  }
  assert.equal(p.w.pgEhDestinoAcabadoraGraficaFiltro(direto), false);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [direto]);
  p.selecionar('TODOS', 'TODOS');
  assert.deepEqual(p.linhas, [destinoWalprint, destinoReproset, vazio, direto]);
});

test('soma CD inclui os volumes WALPRINT e REPROSET da conferencia de 24,7 mi', () => {
  const outrasGraficas = { ...pcp('outras'), TIRAGEM: 20755938.2 };
  const walprint = { ...pcp('walprint', 'WALPRINT'), TIRAGEM: 972994 };
  const reproset = { ...pcp('reproset', 'REPROSET'), TIRAGEM: 750521 };
  const hr = { ...acabadora('acabadoras', 'HR'), TIRAGEM: 2268095 };
  const p = portal([outrasGraficas, walprint, reproset, hr], 'TODOS', 'CD');
  assert.equal(p.w.dadosTotalCanonico.reduce((s, l) => s + l.TIRAGEM, 0), 24747548.2);
  assert.equal(p.w.pgBaseGeralReportExecutiva.filter(l =>
    p.w.pgLinhaDoDestino(l, 'CD', 'TODOS')).reduce((s, l) => s + l.TIRAGEM, 0), 24747548.2);
});

test('Origem Todas exclui KN Raizes e Athos da PCP_ACABADORAS em qualquer destino', () => {
  const excluidas = ['KN', ' Raízes ', 'ATHOS'].map((nome, i) => acabadora(`excluir-${i}`, nome));
  const oficial = acabadora('hr', 'HR');
  const graficaKN = pcp('pcp-kn', 'KN');
  const graficaAthos = pcp('pcp-athos', 'ATHOS');
  const p = portal([...excluidas, oficial, graficaKN, graficaAthos]);
  for (const destino of ['TODOS', 'CD', 'ACAB']) {
    p.selecionar('TODOS', destino);
    for (const l of excluidas) {
      assert.equal(p.linhas.includes(l), false, `${l.GRAFICA_FINAL} em ${destino}`);
      assert.equal(p.w.dadosTotalCanonico.includes(l), false, `Total ${l.GRAFICA_FINAL} em ${destino}`);
      assert.equal(p.w.dadosBaseTPPortal.includes(l), false, `TP ${l.GRAFICA_FINAL} em ${destino}`);
      assert.equal(p.w.pgLinhaDaOrigem(l, 'TODOS'), false);
      assert.equal(p.w.pgLinhaDoDestino(l, destino, 'TODOS'), false);
    }
  }
  p.selecionar('TODOS', 'TODOS');
  assert.deepEqual(p.linhas, [oficial, graficaKN, graficaAthos]);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [oficial, graficaKN, graficaAthos]);
});

test('Origem Acabadora inclui KN Raizes Athos e conserva o CD proprio da fonte', () => {
  const acabadoras = ['KN', 'Raízes', 'ATHOS', 'HR'].map((nome, i) => acabadora(`acab-${i}`, nome));
  const grafica = pcp('grafica');
  const p = portal([...acabadoras, grafica], 'ACABADORA', 'TODOS');
  assert.deepEqual(p.linhas, acabadoras);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), acabadoras);
  assert.deepEqual(Array.from(p.w.dadosBaseTPPortal), acabadoras);
  for (const l of acabadoras) {
    assert.equal(p.w.pgLinhaDaOrigem(l, 'ACABADORA'), true);
    assert.equal(p.w.pgValorFiltroProducao(l, 'CD Destino'), 'CD JDI');
  }
});

test('nova fatia do cache entra no Total Base com os mesmos filtros', () => {
  const primeira = pcp('primeira');
  const segunda = pcp('segunda', 'LEOGRAF');
  const hr = acabadora('hr', 'HR');
  const p = portal([primeira], 'TODOS', 'CD');
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [primeira]);
  assert.equal(p.anexar([segunda, hr]), 3);
  assert.deepEqual(p.linhas, [primeira, segunda, hr]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [primeira, segunda, hr]);
  assert.deepEqual(Array.from(p.w.DADOS_PCP_CACHE), [primeira, segunda, hr]);
  assert.equal(p.w.dadosTotalCanonico.reduce((s, l) => s + l.TIRAGEM, 0), 300);
});

test('CD_MAPA vazio numa nova fatia entra marcado e chega ao fluxo Acabadora', () => {
  const primeira = pcp('primeira');
  const novoVazio = pcp('novo-vazio', 'LEOGRAF', '');
  const p = portal([primeira], 'TODOS', 'ACAB');
  assert.deepEqual(p.linhas, []);
  p.anexar([novoVazio]);
  assert.equal(p.checks.get('CDDestino').find(cb => cb.value === '(Vazio)').checked, true);
  assert.deepEqual(p.linhas, [novoVazio]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [novoVazio]);
});

test('nova fatia conserva vazio desmarcado e respeita selecao de CD especifico', () => {
  const primeira = pcp('primeira');
  const vazio = pcp('vazio', 'LEOGRAF', '');
  const novoVazio = pcp('novo-vazio', 'LEOGRAF', '');
  const segunda = pcp('segunda');
  const p = portal([primeira, vazio]);
  p.w.checkOnlyGeral('CDDestino', 'CD JDI');
  p.anexar([novoVazio, segunda]);
  assert.equal(p.checks.get('CDDestino').find(cb => cb.value === '(Vazio)').checked, false);
  assert.deepEqual(p.linhas, [primeira, segunda]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [primeira, segunda]);
});

test('destino OCEANO segue para Acabadora sem alterar a grafica OCEANO nem a lista oficial', () => {
  const destinoOceano = { ...pcp('destino-oceano', 'LOGPRINT', ' Oceano '), TIRAGEM: 123 };
  const graficaOceano = { ...pcp('grafica-oceano', 'OCEANO'), TIRAGEM: 321 };
  const hr = { ...acabadora('hr-oficial', 'HR'), 'TIRAGEM A ENTREGAR (total por CD)': 80 };
  const todas = [destinoOceano, graficaOceano, hr];
  const p = portal(todas, 'TODOS', 'CD');

  assert.deepEqual(p.linhas, [graficaOceano, hr]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [graficaOceano, hr]);
  assert.deepEqual(Array.from(p.w.dadosBaseTPPortal), [graficaOceano, hr]);
  assert.equal(p.w.pgEhDestinoAcabadora(destinoOceano), true);
  assert.equal(p.w.pgEhDestinoAcabadoraGraficaFiltro(destinoOceano), true);
  assert.equal(p.w.pgEhDestinoCD(graficaOceano), true);
  p.selecionar('TODOS', 'ACAB');
  assert.deepEqual(p.linhas, [destinoOceano]);
  p.selecionar('GRAFICA', 'ACAB');
  assert.deepEqual(p.linhas, [destinoOceano]);
  assert.deepEqual(Array.from(p.w.dadosBaseTPPortal), [destinoOceano]);
  p.selecionar('GRAFICA', 'CD');
  assert.deepEqual(p.linhas, [graficaOceano]);
  p.selecionar('TODOS', 'TODOS');
  assert.deepEqual(p.linhas, todas);
  assert.equal(p.w.dadosTotalCanonico.reduce((s, l) => s + l.TIRAGEM, 0), 544);
  assert.equal(p.w.pgAcabadoraDaLista(acabadora('oceano-fonte', 'OCEANO')), false);
  assert.equal(p.w.pgAcabadoraDaLista(hr), true);
  p.w.arredondar = Number;
  assert.deepEqual(Array.from(p.w.pgUnirTotalSemDuplicidade(todas), l => l._ROW_ID),
    ['grafica-oceano', 'hr-oficial:total-todas']);
  assert.equal(p.w.pgUnirTotalSemDuplicidade(todas).reduce((s, l) => s + l.TIRAGEM, 0), 401);
});

test('filtro visual usa KN e Raizes Acabadora originais mesmo com mapa diferente ou vazio', () => {
  const linhas = [
    { ...pcp('kn-cd', 'LOGPRINT', 'CD JDI'), CD_DESTINO: 'KN', TIRAGEM:101 },
    { ...pcp('raizes-cd', 'LOGPRINT', 'CD JDI'), CD_DESTINO: 'RAIZES ACABADORA', TIRAGEM:102 },
    { ...pcp('kn-vazio', 'LOGPRINT', ''), CD_DESTINO: 'KN', TIRAGEM:103 },
    { ...pcp('raizes-vazio', 'LOGPRINT', ''), CD_DESTINO: 'Raízes Acabadora', TIRAGEM:104 },
    { ...pcp('kn-outra-familia', 'LOGPRINT', 'RAIZES'), CD_DESTINO: 'KN', TIRAGEM:105 },
    { ...pcp('raizes-outra-familia', 'LOGPRINT', 'KN'), CD_DESTINO: 'RAIZES ACABADORA', TIRAGEM:106 },
    { ...pcp('kn-alias-original', 'LOGPRINT', 'KN ACABADORA'), CD_DESTINO_PCP_ORIGINAL: 'KN', TIRAGEM:107 },
    { ...pcp('raizes-alias-espaco', 'LOGPRINT', 'CD RP'), 'CD DESTINO':'RAIZES ACABADORA', TIRAGEM:108 },
    { ...acabadora('acabadora-cd-proprio', 'HR'), CD_DESTINO:'KN', TIRAGEM:109,
      'TIRAGEM A ENTREGAR (total por CD)':109 }
  ];
  const p = portal(linhas);
  assert.deepEqual(p.checks.get('CDDestino').map(cb => cb.value),
    ['CD JDI', 'KN', 'RAÍZES ACABADORA']);
  assert.equal(p.checks.has('CD_DESTINO'), false);
  assert.equal(Object.hasOwn(p.w.mapCamposProducao, 'CD_DESTINO'), false);
  p.w.checkOnlyGeral('CDDestino', 'KN');
  assert.deepEqual(p.linhas, [linhas[0],linhas[2],linhas[4],linhas[6]]);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),416);
  p.w.checkOnlyGeral('CDDestino', 'RAÍZES ACABADORA');
  assert.deepEqual(p.linhas, [linhas[1],linhas[3],linhas[5],linhas[7]]);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),420);
  p.w.checkOnlyGeral('CDDestino', 'CD JDI');
  assert.deepEqual(p.linhas, [linhas[8]], 'Acabadora conserva o CD proprio, sem aplicar a excecao PCP');
  p.w.checkAllGeral('CDDestino', true);
  assert.deepEqual(p.linhas,linhas);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),945);
  const semOriginais=linhas.map(l=>{
    const copia={...l};
    if(copia._SOURCE==='PCP'){
      delete copia.CD_DESTINO;
      delete copia.CD_DESTINO_PCP_ORIGINAL;
      delete copia['CD DESTINO'];
    }
    return copia;
  });
  const referencia=portal(semOriginais);
  linhas.forEach((l,i)=>{
    const semOriginal=semOriginais[i];
    assert.equal(p.w.pgEhDestinoAcabadora(l), p.w.pgEhDestinoAcabadora(semOriginal));
    assert.equal(p.w.pgEhDestinoAcabadoraGraficaFiltro(l),
      p.w.pgEhDestinoAcabadoraGraficaFiltro(semOriginal));
    assert.equal(p.w.pgDestinoAcabadoraCongelado(l),p.w.pgDestinoAcabadoraCongelado(semOriginal));
  });
  assert.equal(p.w.pgEhDestinoAcabadora(linhas[2]),true,'Mapa vazio segue para Acabadora apesar do filtro visual KN');
  assert.equal(p.w.pgEhDestinoAcabadora(linhas[3]),true);
  const ids=base=>Array.from(base,l=>l._ROW_ID);
  for(const origem of ['TODOS','GRAFICA','ACABADORA']){
    for(const destino of ['TODOS','CD','ACAB']){
      p.selecionar(origem,destino);
      referencia.selecionar(origem,destino);
      assert.deepEqual(ids(p.linhas),ids(referencia.linhas),'Origem/Destino preserva as mesmas linhas');
      assert.deepEqual(ids(p.w.dadosBaseTPPortal),ids(referencia.w.dadosBaseTPPortal));
      assert.deepEqual(ids(p.w.dadosBaseForecastColeta),ids(referencia.w.dadosBaseForecastColeta));
      assert.deepEqual(ids(p.w.dadosBaseColetaFunil),ids(referencia.w.dadosBaseColetaFunil));
      assert.equal(Array.from(p.w.dadosTotalCanonico).reduce((s,l)=>s+l.TIRAGEM,0),
        Array.from(referencia.w.dadosTotalCanonico).reduce((s,l)=>s+l.TIRAGEM,0));
    }
  }
  p.selecionar('GRAFICA', 'ACAB');
  assert.deepEqual(p.linhas, [linhas[2],linhas[3],linhas[6]],'Rota continua seguindo CD_MAPA');
});

test('filtro normaliza as duas excecoes e usa CD_MAPA para KN Acabadora, Raizes simples e demais originais', () => {
  const raizes = [' raízes ', 'RAIZES', 'Raízes'].map((nome, i) =>
    ({ ...pcp(`raizes-${i}`, 'LOGPRINT', nome), CD_DESTINO: 'OUTRO DESTINO' }));
  const cdJdi = [' cd jdi ', 'CD JDI', 'Cd  Jdi'].map((nome, i) =>
    ({ ...pcp(`jdi-${i}`, 'LOGPRINT', nome), CD_DESTINO: 'KN ACABADORA' }));
  const knOriginais=[' kn ','KN','Kn'].map((nome,i)=>
    ({...pcp(`kn-original-${i}`,'LOGPRINT','CD RP'),CD_DESTINO:nome}));
  const raizesOriginais=[' raízes  acabadora ','RAIZES ACABADORA','Raízes Acabadora'].map((nome,i)=>
    ({...pcp(`raizes-original-${i}`,'LOGPRINT','CD RP'),CD_DESTINO:nome}));
  const raizesSimples = { ...pcp('raizes-original-simples', 'LOGPRINT', 'KN ACABADORA'), CD_DESTINO:'Raízes' };
  const originalVazio = { ...pcp('original-vazio', 'LOGPRINT', 'CD JDI'), CD_DESTINO:'' };
  const vazio = { ...pcp('vazio-original-preenchido', 'LOGPRINT', ''), CD_DESTINO: 'CD JDI' };
  const oceano = { ...pcp('oceano-original-cd', 'LOGPRINT', 'OCEANO'), CD_DESTINO: 'CD JDI' };
  const linhas=[...raizes,...cdJdi,...knOriginais,...raizesOriginais,raizesSimples,originalVazio,vazio,oceano];
  const p = portal(linhas);

  assert.deepEqual(p.checks.get('CDDestino').map(cb => cb.value),
    ['(Vazio)','CD JDI','KN','KN ACABADORA','OCEANO','RAÍZES','RAÍZES ACABADORA']);
  p.w.checkOnlyGeral('CDDestino', 'RAÍZES');
  assert.deepEqual(p.linhas,raizes);
  p.w.checkOnlyGeral('CDDestino', 'CD JDI');
  assert.deepEqual(p.linhas,[...cdJdi,originalVazio]);
  p.w.checkOnlyGeral('CDDestino', 'KN');
  assert.deepEqual(p.linhas,knOriginais);
  p.w.checkOnlyGeral('CDDestino', 'RAÍZES ACABADORA');
  assert.deepEqual(p.linhas,raizesOriginais);
  p.w.checkOnlyGeral('CDDestino', 'KN ACABADORA');
  assert.deepEqual(p.linhas,[raizesSimples]);
  p.w.checkOnlyGeral('CDDestino', '(Vazio)');
  assert.deepEqual(p.linhas, [vazio]);
  assert.equal(p.w.pgEhDestinoAcabadora(vazio), true);
  assert.equal(p.w.pgEhDestinoAcabadora(oceano), true);
  p.w.checkAllGeral('CDDestino',true);
  assert.deepEqual(p.linhas,linhas);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),1600);
});

test('nova fatia preserva selecao do destino visual normalizado e Marcar Todos restaura o volume', () => {
  const kn = { ...pcp('kn-inicial', 'LOGPRINT', 'CD JDI'), CD_DESTINO: 'KN',TIRAGEM:90 };
  const raizes = { ...pcp('raizes-inicial', 'LOGPRINT', 'CD RP'),CD_DESTINO:'Raízes Acabadora',TIRAGEM:110 };
  const mapaExistente = { ...pcp('kn-acab-inicial', 'LOGPRINT', 'KN ACABADORA'),CD_DESTINO:'KN ACABADORA',TIRAGEM:20 };
  const novaRaizes = { ...pcp('raizes-nova', 'LOGPRINT', ''),CD_DESTINO:'  RAIZES  ACABADORA ',TIRAGEM:40 };
  const novoKn = { ...pcp('kn-novo', 'LOGPRINT', 'RAIZES'), CD_DESTINO: ' kn ',TIRAGEM:60 };
  const novoMapa = { ...pcp('kn-acab-novo', 'LOGPRINT', 'KN ACABADORA'),CD_DESTINO:'KN ACABADORA',TIRAGEM:30 };
  const p = portal([kn, raizes,mapaExistente]);
  p.w.checkOnlyGeral('CDDestino', 'KN');
  p.anexar([novaRaizes, novoKn,novoMapa]);

  assert.deepEqual(p.checks.get('CDDestino').map(cb => [cb.value, cb.checked]),
    [['KN',true],['KN ACABADORA',false],['RAÍZES ACABADORA',false]]);
  assert.deepEqual(p.linhas, [kn, novoKn]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [kn, novoKn]);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),150);
  p.w.checkOnlyGeral('CDDestino','RAÍZES ACABADORA');
  assert.deepEqual(p.linhas,[raizes,novaRaizes]);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),150);
  p.w.checkAllGeral('CDDestino', true);
  assert.deepEqual(p.linhas, [kn,raizes,mapaExistente,novaRaizes,novoKn,novoMapa]);
  assert.equal(p.linhas.reduce((s,l)=>s+l.TIRAGEM,0),350);
});
