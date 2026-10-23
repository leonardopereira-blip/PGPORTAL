const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Historico_PCP2026.html'), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const globais = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const inicioCurva = globais.indexOf('window.renderReportExecutivaCurvaSemanal = function()');
const fimCurva = globais.indexOf('// REPORT EXECUTIVA — EXTRAÇÕES CLICÁVEIS', inicioCurva);
const curva = globais.slice(inicioCurva, fimCurva);
const linha = (extra = {}) => ({grafica: 'POSIGRAF', unidade: 'SAS', envio: 'V1', serie: '3O ANO', cd: 'Jundiaí - SP', tiragem: 100, dataReal: '2025-10-01', ...extra});
const serial = valor => JSON.parse(JSON.stringify(valor));

function portal(checks = {}) {
  const elementos = {
    reHistorico2026Status: {textContent: ''}, reHistorico2026Retry: {hidden: true},
    reCurvaEntregas: {style: {}}
  };
  const chamadas = [], configs = [], exportacoes = [];
  const ctx = vm.createContext({
    window: {pgREPercentualExibido: Math.round, pgEventosFechamentoSetembroV60: () => [],
      reExtrairCurvaPonto: (...args) => exportacoes.push(args)},
    document: {getElementById: id => elementos[id] || null,
      querySelectorAll: seletor => checks[seletor.slice('.chk-geral-'.length)] || []},
    console: {warn() {}},
    google: {script: {run: {
      withSuccessHandler(sucesso) {
        const chamada = {sucesso};
        return {withFailureHandler(falha) {chamada.falha = falha; return {
          getDadosHistoricoPCP2026() {chamadas.push(chamada);}
        };}};
      }
    }}},
    Chart: function(canvas, config) {configs.push(config); this.data = config.data; this.canvas = canvas; this.destroy = () => {};}
  });
  vm.runInContext(source, ctx);
  vm.runInContext(curva, ctx);
  return {w: ctx.window, api: ctx.window.pgREHistorico2026, elementos, chamadas, checks, configs, exportacoes};
}

test('séries equivalentes normalizam sem confundir ano, série e modalidade', () => {
  const {api} = portal();
  for (const conjunto of [
    ['3O ANO', '3º Ano', '3° ANO', '30 ANO'],
    ['3A SERIE', '3ª Série', '3a serie'],
    ['INF II', 'Infantil2', 'INF 2 ANOS'],
    ['INF I', 'INF 1º ANO', 'Infantil 1'],
    ['VÁRIOS', 'VARIOS', 'VÁRIAS', '1º ANO;2º ANO'],
    ['EXT', 'EXTENSIVO'], ['PRE-VEST', 'PRE VESTIBULAR', 'PV']
  ]) {
    for (const valor of conjunto) assert.equal(api.serie(valor), api.serie(conjunto[0]), valor);
  }
  assert.notEqual(api.serie('3O ANO'), api.serie('3A SERIE'));
  assert.notEqual(api.serie('EXT'), api.serie('PRE-VEST'));
  assert.equal(api.serie('(Vazio)'), api.serie('-'));
});

test('CDs equivalentes preservam destinos diferentes e vazios', () => {
  const {api} = portal();
  for (const conjunto of [
    ['CD JDI', 'Jundiaí - SP', 'CD Jundiaí - JDI'],
    ['CD FOR', 'Fortaleza - CE', 'CD Fortaleza - FOR'],
    ['CD RP', 'RP', 'Ribeirão Preto', 'Ribeirão'],
    ['Raízes', 'RAIZES'], ['São José do Rio Preto - SP', 'SÃO JOSÉ DO RIO PRETO'],
    ['', '(Vazio)', 'Não informado']
  ]) for (const valor of conjunto) assert.equal(api.cd(valor), api.cd(conjunto[0]), valor);
  assert.notEqual(api.cd('São José do Rio Preto - SP'), api.cd('CD RP'));
  assert.notEqual(api.cd('Raízes'), api.cd('RAÍZES ACABADORA'));
  assert.notEqual(api.cd('KN'), api.cd('KN ACABADORA'));
});

test('base AL inclui BH vazio e mantém volumes decimais e período anterior completo', () => {
  const {api} = portal();
  const rows = [linha({tiragem: 60.5}), linha({tiragem: 20, dataReal: '2025-11-01'}), linha({tiragem: 19.5, dataReal: ''})];
  const [ds] = api.calcular(rows, [{fim: '2026-10-24', corteReal: '2026-10-23'}, {fim: '2026-11-07'}], {Envio: new Set(['V1'])});
  assert.equal(ds.label, 'V1-26');
  assert.equal(ds.pgHistorico2026.total, 100);
  assert.deepEqual(serial(ds.pgHistorico2026.volumes), [60.5, 80.5]);
  assert.deepEqual(serial(ds.data), [60.5, 80.5]);
  assert.equal(ds.fill, false);
});

test('virada do ciclo preserva 2026 nas datas originais e trata fevereiro bissexto', () => {
  const {api} = portal();
  const [ds] = api.calcular([linha({dataReal: '2026-03-05'})], [{fim: '2026-12-31'}, {fim: '2027-03-05'}], {Envio: new Set(['V1'])});
  assert.deepEqual(serial(ds.pgHistorico2026.cortes), ['2025-12-31', '2026-03-05']);
  assert.deepEqual(serial(ds.data), [0, 100]);
  assert.equal(api.corteAnterior('2028-02-29'), '2027-02-28');
  assert.equal(api.corteAnterior('2026-10-23'), '2025-10-23');
});

test('seleções restritas de gráfica, unidade, série e CD aplicam equivalência nos dois lados', () => {
  const p = portal({
    Gráfica: [{value: 'posigraf', checked: true}, {value: 'OUTRA', checked: false}],
    Marca: [{value: 'sas', checked: true}, {value: 'SPE', checked: false}],
    Série: [{value: '3º Ano', checked: true}, {value: '2º Ano', checked: false}],
    CDDestino: [{value: 'CD JDI', checked: true}, {value: 'CD FOR', checked: false}],
    Envio: [{value: 'V1', checked: true}, {value: 'V2', checked: false}]
  });
  const rows = [linha(), linha({grafica: 'OUTRA'}), linha({unidade: 'SPE'}), linha({serie: '2O ANO'}), linha({cd: 'Fortaleza - CE'}), linha({envio: 'V2'})];
  const [ds] = p.api.calcular(rows, [{fim: '2026-10-23'}], p.api.selecoes());
  assert.equal(ds.pgHistorico2026.total, 100);
  p.checks.Série.forEach(c => c.checked = false);
  assert.equal(p.api.calcular(rows, [{fim: '2026-10-23'}], p.api.selecoes()).length, 0);
});

test('menus completos não eliminam categorias históricas; envio só aceita o que está marcado no portal', () => {
  const p = portal({Gráfica: [{value: 'OUTRA', checked: true}], Envio: [{value: 'V1', checked: true}]});
  const rows = [linha(), linha({envio: 'V2'}), linha({envio: 'V3'}), linha({envio: 'V4'})];
  assert.deepEqual(serial(p.api.calcular(rows, [{fim: '2026-10-23'}], p.api.selecoes()).map(ds => ds.label)), ['V1-26']);
  p.checks.Envio.push({value: 'V2', checked: true});
  assert.deepEqual(serial(p.api.calcular(rows, [{fim: '2026-10-23'}], p.api.selecoes()).map(ds => ds.label)), ['V1-26', 'V2-26']);
  p.checks.Envio.forEach(c => c.checked = false);
  assert.equal(p.api.calcular(rows, [{fim: '2026-10-23'}], p.api.selecoes()).length, 0);
  assert.equal(p.api.envio('V1-26'), 'V1');
  assert.equal(p.api.envio('V1-27'), 'V1');
  assert.equal(p.api.envio('V1-2027'), 'V1');
  assert.equal(p.api.envio('V126'), 'V126');
});

test('gráfica STAR7 histórica corresponde ao filtro STAR 7 do portal', () => {
  const p = portal({Gráfica: [{value: 'STAR 7', checked: true}, {value: 'OUTRA', checked: false}]});
  const [ds] = p.api.calcular([linha({grafica: 'STAR7'}), linha({grafica: 'OUTRA'})], [{fim: '2026-10-23'}], p.api.selecoes());
  assert.equal(ds.pgHistorico2026.total, 100);
});

function fonteAtual(p) {
  p.w.reCurvaFonteCDV43 = {hoje: '2026-10-23', total: 10, planejadoHoje: 5, realizadoHoje: 2,
    registros: [{dtPlan: '2026-10-23', tiragem: 5}, {dtReal: '2026-10-23', coletada: 2}],
    eventosPlanoHistorico: [{dtPlan: '2026-10-23', tiragem: 5}], eventosReal: []};
}

test('carga é lazy e única, mantém as duas curvas e usa seleções atuais ao concluir', () => {
  const p = portal({Gráfica: [{value: 'POSIGRAF', checked: true}, {value: 'OUTRA', checked: true}]});
  fonteAtual(p);
  p.w.renderReportExecutivaCurvaSemanal();
  p.w.renderReportExecutivaCurvaSemanal();
  assert.equal(p.chamadas.length, 1);
  assert.equal(p.api.estado.status, 'carregando');
  assert.equal(p.configs.at(-1).data.datasets.length, 2);
  assert.match(p.elementos.reHistorico2026Status.textContent, /Carregando/);
  p.checks.Gráfica[1].checked = false;
  p.chamadas[0].sucesso({ciclo: 2026, rows: [linha({tiragem: 60}), linha({tiragem: 40, dataReal: ''}), linha({grafica: 'OUTRA', tiragem: 900})]});
  const config = p.configs.at(-1);
  const [previsto, real, historico] = config.data.datasets;
  assert.equal(previsto.label, 'Forecast'); assert.equal(real.label, 'Realizado');
  assert.equal(historico.label, 'V1-26');
  assert.equal(historico.pgHistorico2026.total, 100);
  assert.equal(real.data[0], 20);
  assert.equal(historico.data[0], 60);
  assert.equal(p.w.reCurvaFonteCDV43.total, 10);
  assert.equal(p.w.dadosGlobais, undefined);
  assert.equal(p.chamadas.length, 1);
});

test('falhas e respostas inválidas oferecem retry sem nova tentativa a cada render', () => {
  for (const tipo of ['servidor', 'resposta']) {
    const p = portal(); fonteAtual(p);
    p.w.renderReportExecutivaCurvaSemanal();
    if (tipo === 'servidor') p.chamadas[0].falha(new Error('Fonte indisponível'));
    else p.chamadas[0].sucesso({error: 'Leitura incompleta'});
    assert.equal(p.api.estado.status, 'erro');
    assert.equal(p.elementos.reHistorico2026Retry.hidden, false);
    assert.match(p.elementos.reHistorico2026Status.textContent, /Não foi possível/);
    p.w.renderReportExecutivaCurvaSemanal();
    assert.equal(p.chamadas.length, 1);
    assert.equal(p.configs.at(-1).data.datasets.length, 2);
    p.api.carregar(true);
    assert.equal(p.chamadas.length, 2);
    assert.equal(p.elementos.reHistorico2026Retry.hidden, true);
    p.chamadas[1].sucesso({ciclo: 2026, rows: [linha()]});
    assert.equal(p.api.estado.status, 'pronto');
    assert.equal(p.configs.at(-1).data.datasets[2].label, 'V1-26');
  }
});

test('tooltip usa denominador próprio e data original; clique histórico não exporta PCP corrente', () => {
  const p = portal(); fonteAtual(p); p.w.renderReportExecutivaCurvaSemanal();
  p.chamadas[0].sucesso({ciclo: 2026, rows: [linha({tiragem: 60}), linha({tiragem: 40, dataReal: ''})]});
  const config = p.configs.at(-1), dataset = config.data.datasets[2];
  const textoTooltip = config.options.plugins.tooltip.callbacks.label({dataset, datasetIndex: 2, dataIndex: 0, raw: dataset.data[0]});
  assert.match(textoTooltip[0], /V1-26: 60% \(60 \/ 100\)/);
  assert.match(textoTooltip[1], /23\/10\/2025/);
  const chart = {data: config.data, canvas: p.elementos.reCurvaEntregas,
    getElementsAtEventForMode: () => [{index: 0, datasetIndex: 2}]};
  config.options.onClick({}, [], chart);
  config.options.onHover({}, [], chart);
  assert.equal(p.exportacoes.length, 0);
  assert.equal(chart.canvas.style.cursor, 'default');
  chart.getElementsAtEventForMode = () => [{index: 0, datasetIndex: 1}];
  config.options.onClick({}, [], chart);
  config.options.onHover({}, [], chart);
  assert.equal(p.exportacoes.length, 1);
  assert.equal(chart.canvas.style.cursor, 'pointer');
});
