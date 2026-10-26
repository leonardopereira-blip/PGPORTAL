const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hoje = '2026-10-14';
const plan = 'Coleta/Internalização de estoque final (re) plan';
const tabelas = ['MarcaTiragem', 'MarcaPct', 'GraficaTiragem', 'GraficaPct'];
const row = (id, extra = {}) => ({
  _SOURCE: 'PCP', _ROW_ID: id, JOIN_KEY: id, SKU_REAL: id, SKU: id,
  MARCA_FINAL: 'SAS', UNIDADE: 'SAS', GRAFICA_FINAL: 'LOGPRINT', 'GRÁFICA': 'LOGPRINT',
  'SÉRIE': '1 ANO', ENVIO: 'V1', CD_MAPA: 'CD JDI', CD_FINAL: 'CD JDI',
  'CD DESTINO': 'CD JDI', TIRAGEM: 100, 'TIRAGEM COLETADA': 0, 'TIRAGEM AGENDADA': 100,
  Mapa_Agendado: '2026-10-15', Coleta_TP: '', [plan]: '2026-10-13', ...extra
});

// Executa os scripts completos e o renderizador real do Funil. Apenas o DOM,
// a pintura da curva e a comunicação de exportação são simulados.
function portal(rows, fases = ['col_mapa', 'col_tp'], recorte = {}) {
  const destino = recorte.destino || 'TODOS';
  const baseCanonica = recorte.baseCanonica || rows;
  const controles = new Map([
    ['filtroReferencia', { value: 'replan' }],
    ['pgFiltroOrigem', { value: 'TODOS' }],
    ['pgFiltroDestino', { value: destino }],
    ['containerFunilVisual', { innerHTML: '' }],
    ...tabelas.flatMap(s => [
      ['thFunil' + s, { innerHTML: '' }], ['tbFunil' + s, { innerHTML: '' }]
    ])
  ]);
  let fasesAtivas = fases;
  let exportados;
  const run = {
    withSuccessHandler() { return this; },
    withFailureHandler() { return this; },
    gerarPlanilhaGiroFiltrado(itens) { exportados = itens; }
  };
  const elemento = () => ({
    classList: { add() {}, remove() {} }, style: {}, appendChild() {}, addEventListener() {}
  });
  const c = {
    console: { info() {}, warn() {}, error() {} },
    MAPA_SAIDA_CACHE: {}, dadosGlobais: rows,
    arredondar: v => Math.round(Number(v) || 0), formatarBR: String,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    performance: { now: () => 0 }, addEventListener() {}, dispatchEvent() {}, Event: class {},
    open: () => ({ close() {} }), alert: mensagem => assert.fail(mensagem),
    google: { script: { run } }
  };
  c.document = {
    getElementById: id => controles.get(id) || null,
    querySelector: () => null,
    querySelectorAll: seletor => seletor === '.chk-fase-funil:checked'
      ? fasesAtivas.map(value => ({ value })) : [],
    addEventListener() {}, createElement: elemento, body: elemento(), head: elemento()
  };
  c.window = c;
  vm.createContext(c);
  for (const nome of ['Scripts_Eventos_TP.html', 'Scripts_Globais_2.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      vm.runInContext(script, c, { filename: nome });
    }
  }
  c.baseCanonicaTeste = baseCanonica;
  vm.runInContext(`dtHojeISO='${hoje}';dtHoje=new Date('${hoje}T12:00:00');dadosFiltrados=baseCanonicaTeste;`, c);
  c.pgOrigemAtivaPortal = 'TODOS';
  c.pgDestinoAtivoPortal = destino;
  c.dadosSemFiltroCD = rows;
  c.dadosDestinoCDFinal = baseCanonica;
  c.dadosDestinoCDOrigem = baseCanonica;
  c.dadosBaseTPPortal = baseCanonica;
  c.dadosBaseForecastColeta = baseCanonica;
  c.dadosTotalCanonico = baseCanonica;
  c.dadosTotalPCPBase = rows;
  c.dadosFasesEstaticas = rows;
  c.dadosAcabamentoOrigem = [];
  c.pgBaseGeralReportExecutiva = baseCanonica;
  c.renderColetaFinalFunil = () => c.pgObterResumoColeta();
  c.processarFunil();
  return {
    w: c, controles,
    get exportados() { return exportados; },
    selecionarFases(novas) { fasesAtivas = novas; c.processarFunil(); }
  };
}

function contagem(p) {
  const html = p.controles.get('containerFunilVisual').innerHTML;
  const camada = [...html.matchAll(/<div\b[^>]*>([^<]*)<\/div>/g)].at(-1)?.[1];
  const valores = camada?.match(/\((\d+)\/(\d+)\s*\|\s*([\d.]+)%\)/);
  assert.ok(valores, 'Funil renderiza contagem e percentual de séries');
  return [Number(valores[1]), Number(valores[2]), Number(valores[3])];
}

function linhaSeries(p, tabela) {
  const html = p.controles.get('tbFunil' + tabela).innerHTML;
  const linha = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .find(([, conteudo]) => /Séries\s+(?:100%\s+)?[Ff]inalizadas/.test(conteudo));
  assert.ok(linha, 'Tabela renderiza Séries finalizadas');
  return linha[1];
}

function linhaIndicador(p, tabela, nome) {
  const html = p.controles.get('tbFunil' + tabela).innerHTML;
  const linha = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .find(([, conteudo]) => conteudo.match(/<td\b[^>]*>([^<]*)<\/td>/)?.[1] === nome);
  assert.ok(linha, tabela + ' renderiza ' + nome);
  return [...linha[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
    .slice(1).map(([, conteudo]) => conteudo);
}

for (const variasMarcas of [false, true]) {
  test('total CD por marca e gráfica conserva o recorte e as fases iniciais: ' +
    (variasMarcas ? 'vários grupos' : 'COC da imagem'), () => {
    const inicial = { 'ENV ARQUIVO PLAN': '2026-10-13', 'ENV ARQUIVO REAL': '2026-10-13' };
    const coc = { MARCA_FINAL: 'COC', UNIDADE: 'COC' };
    const direto = row('coc-cd', { ...inicial, ...coc, TIRAGEM: 1833433 });
    const transferencia = row('coc-acabadora', {
      ...inicial, ...coc, TIRAGEM: 763799, CD_MAPA: 'HR', CD_FINAL: 'HR', 'CD DESTINO': 'HR'
    });
    const baseCanonica = [direto];
    const rows = [direto, transferencia];
    if (variasMarcas) {
      const outraGrafica = { GRAFICA_FINAL: 'LEOGRAF', 'GRÁFICA': 'LEOGRAF' };
      const outroCD = row('sas-cd', { ...inicial, ...outraGrafica, TIRAGEM: 500000 });
      baseCanonica.push(outroCD);
      rows.push(outroCD, row('sas-acabadora', {
        ...inicial, ...outraGrafica, TIRAGEM: 200000,
        CD_MAPA: 'HR', CD_FINAL: 'HR', 'CD DESTINO': 'HR'
      }));
    }
    const p = portal(rows, ['env', 'col_mapa'], { destino: 'CD', baseCanonica });
    const totais = variasMarcas ? ['1833433', '500000', '2333433'] : ['1833433', '1833433'];
    const iniciais = variasMarcas ? ['2597232', '700000', '3297232'] : ['2597232', '2597232'];
    const fasesAntes = new Map();
    for (const tabela of ['MarcaTiragem', 'GraficaTiragem']) {
      const valores = linhaIndicador(p, tabela, '00 - Tiragem Total');
      assert.deepEqual(valores, totais, tabela);
      assert.equal(valores.slice(0, -1).reduce((s, v) => s + Number(v), 0),
        Number(valores.at(-1)), 'soma dos grupos coincide com Total Geral');
      const faseInicial = linhaIndicador(p, tabela, '01 - Env. Arq');
      assert.deepEqual(faseInicial, iniciais, 'fase inicial preserva PCP destinado a acabadora');
      fasesAntes.set(tabela, faseInicial);
    }
    for (const tabela of ['MarcaPct', 'GraficaPct']) {
      const faseInicial = linhaIndicador(p, tabela, '01 - Env. Arq');
      assert.equal(faseInicial.length, totais.length);
      faseInicial.forEach(celula => assert.match(celula, />100%<\/span>/));
      fasesAntes.set(tabela, faseInicial);
    }
    p.selecionarFases(['col_mapa']);
    for (const tabela of ['MarcaTiragem', 'GraficaTiragem']) {
      assert.deepEqual(linhaIndicador(p, tabela, '00 - Tiragem Total'), totais,
        'desmarcar fase inicial conserva total CD');
    }
    p.selecionarFases(['env', 'col_mapa']);
    for (const tabela of tabelas) {
      assert.deepEqual(linhaIndicador(p, tabela, '01 - Env. Arq'), fasesAntes.get(tabela),
        'remarcar fase inicial conserva realizado e percentual');
    }
  });
}

test('mapa integral com volume agendado não finaliza série sem Coleta TP', () => {
  const l = row('agenda');
  const p = portal([l]);
  assert.equal(p.w.pgMapaSolicitadoAtual(l), 100);
  assert.equal(p.w.pgTiragemColetadaReal(l), 0);
  assert.deepEqual(contagem(p), [0, 1, 0]);
  assert.match(linhaSeries(p, 'MarcaTiragem'), />0<\/td>/);
  assert.match(linhaSeries(p, 'GraficaPct'), />0%<\/span>/);
});

test('coleta parcial permanece pendente e Coleta TP integral finaliza a série', () => {
  const parcial = row('parcial', { 'TIRAGEM COLETADA': 60, 'TIRAGEM AGENDADA': 40, Coleta_TP: hoje });
  const completa = row('completa', {
    'SÉRIE': '2 ANO', TIRAGEM: 10000, 'TIRAGEM COLETADA': 10000,
    'TIRAGEM AGENDADA': 0, Coleta_TP: hoje
  });
  const p = portal([parcial, completa]);
  assert.deepEqual(contagem(p), [1, 2, 50]);
  for (const tabela of ['MarcaPct', 'GraficaPct']) {
    assert.match(linhaSeries(p, tabela), />50%<\/span>/);
  }
  for (const tabela of ['MarcaTiragem', 'GraficaTiragem']) {
    assert.match(linhaSeries(p, tabela), />1<\/td>/);
  }
});

test('conclusão por marca e gráfica conserva seus próprios recortes da mesma série', () => {
  const p = portal([
    row('concluida', { 'TIRAGEM COLETADA': 100, 'TIRAGEM AGENDADA': 0, Coleta_TP: hoje }),
    row('outra-marca', { MARCA_FINAL: 'COC', UNIDADE: 'COC',
      GRAFICA_FINAL: 'LEOGRAF', 'GRÁFICA': 'LEOGRAF' })
  ]);
  assert.deepEqual(contagem(p), [0, 1, 0], 'uma chave pendente mantém a série geral aberta');
  for (const tabela of ['MarcaTiragem', 'GraficaTiragem']) {
    const valores = [...linhaSeries(p, tabela).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
      .slice(1).map(([, texto]) => texto.replace(/<[^>]*>/g, '').trim());
    assert.deepEqual(valores.slice(0, -1).sort(), ['0', '1'], tabela);
    assert.equal(valores.at(-1), '1', 'total da tabela conserva a soma das séries por grupo');
  }
  for (const tabela of ['MarcaPct', 'GraficaPct']) {
    assert.match(linhaSeries(p, tabela), />100%<\/span>/);
    assert.match(linhaSeries(p, tabela), />0%<\/span>/);
    assert.match(linhaSeries(p, tabela), />50%<\/span>/);
  }
});

test('Coleta TP posterior ao corte não finaliza a série', () => {
  const l = row('futura', {
    'TIRAGEM COLETADA': 100, 'TIRAGEM AGENDADA': 0, Coleta_TP: '2026-10-15'
  });
  const p = portal([l]);
  assert.equal(p.w.pgTiragemColetadaReal(l), 0);
  assert.deepEqual(contagem(p), [0, 1, 0]);
});

test('excedente de uma chave não compensa coleta incompleta de outra na mesma série', () => {
  const p = portal([
    row('sobra', { 'TIRAGEM COLETADA': 150, 'TIRAGEM AGENDADA': 0, Coleta_TP: hoje }),
    row('saldo', { 'TIRAGEM COLETADA': 50, 'TIRAGEM AGENDADA': 50, Coleta_TP: hoje })
  ]);
  assert.deepEqual(contagem(p), [0, 1, 0]);
});

test('Séries finalizadas mantém Coleta TP quando seu checkbox está desmarcado', () => {
  const p = portal([row('pendente')]);
  const marcada = contagem(p);
  p.selecionarFases(['col_mapa']);
  assert.deepEqual(contagem(p), marcada);
  assert.deepEqual(contagem(p), [0, 1, 0]);
});

test('título de Séries finalizadas fica simples no gráfico e nas quatro tabelas', () => {
  const p = portal([row('titulo')]);
  const grafico = p.controles.get('containerFunilVisual').innerHTML;
  assert.match(grafico, /Séries finalizadas \(/);
  assert.doesNotMatch(grafico, /Séries[^<]*(?:Mapa Solicitado|Coleta TP|100% Finalizadas)/);
  for (const tabela of tabelas) {
    const linha = linhaSeries(p, tabela);
    const titulo = linha.match(/<td\b[^>]*>([^<]*)<\/td>/)?.[1];
    assert.match(titulo, /^\d+ - Séries finalizadas$/);
  }
});

test('tooltip e extração de séries mostram saldo de Coleta TP mesmo com mapa integral', () => {
  const p = portal([row('detalhe', {
    'TIRAGEM COLETADA': 30, 'TIRAGEM AGENDADA': 70, Coleta_TP: hoje
  })]);
  const contexto = { fase: 'series', tipo: 'marca', grupo: 'SAS', atrasados: true };
  assert.match(p.w.pgTooltipAtrasosFunil(contexto), /^Em atraso: 70\n/);
  const itens = p.w.pgPendenciasCaixaFunil(contexto);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].tiragem, 70);
  const id = p.w.pgCaixasFunil.push(contexto) - 1;
  p.w.extrairCaixaFunil(id);
  assert.equal(p.exportados.length, 1);
  assert.equal(p.exportados[0].tiragem, 70);
});

test('prazo de coleta hoje ou amanhã não fica atrasado pelo prazo anterior do mapa', () => {
  for (const prazo of [hoje, '2026-10-15']) {
    const p = portal([row('prazo-' + prazo, {
      'TIRAGEM COLETADA': 30, 'TIRAGEM AGENDADA': 0, Coleta_TP: hoje, [plan]: prazo
    })]);
    const contexto = { fase: 'series', tipo: 'marca', grupo: 'SAS', atrasados: true };
    assert.match(p.w.pgTooltipAtrasosFunil(contexto), /^Em atraso: 0\n/, prazo);
    assert.equal(p.w.pgPendenciasCaixaFunil(contexto).length, 0, prazo);
    const abertas = p.w.pgPendenciasCaixaFunil({ ...contexto, atrasados: false });
    assert.equal(abertas.length, 1);
    assert.equal(abertas[0].tiragem, 70);
  }
});
