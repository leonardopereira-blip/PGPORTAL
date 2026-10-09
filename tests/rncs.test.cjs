const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {} };
const headers = ['Nº RNC', ' Data ', 'Fornecedor', 'Marca', 'Status RNC',
  'Desvio', 'Quantidade', 'Responsável', 'Descrição', 'SKU', 'Título',
  'Prazo', 'Resposta', 'CD', 'Gráfica', 'Ação', 'Evidência', 'Observação', ''];

function backend(values) {
  const calls = [];
  const ctx = vm.createContext({
    console: quiet, Logger: quiet, Date,
    pgLerAbaCache_(...args) { calls.push(args); return values; }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'Code.js'), 'utf8'), ctx);
  return { ctx, calls };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

// Executa somente JavaScript que o navegador receberia dentro das tags script.
// Codigo que escape das tags nao pode registrar as funcoes da tela.
function runHtmlScripts(file, ctx, rows = []) {
  const html = fs.readFileSync(path.join(root, file), 'utf8').replace(
    /<\?!=\s*JSON\.stringify\(getDadosRNC\(\)\)\s*\?>/g,
    () => JSON.stringify(rows)
  );
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  assert(scripts.length > 0, `${file} precisa conter JavaScript executavel`);
  scripts.forEach((script, index) => vm.runInContext(script[1], ctx,
    { filename: `${file}:script-${index + 1}` }));
}

function frontend() {
  const elements = new Map();
  const charts = [];
  class Chart {
    static defaults = { font: {} };
    constructor(canvas, config) {
      this.id = canvas.id;
      this.config = config;
      this.destroyed = false;
      charts.push(this);
    }
    destroy() { this.destroyed = true; }
  }
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: 'TODOS', innerText: '', innerHTML: '',
      getContext: () => ({ id })
    });
    return elements.get(id);
  }
  const ctx = vm.createContext({ console: quiet, Chart,
    document: { getElementById: element } });
  ctx.window = ctx;
  return { ctx, element, charts,
    chart(id) { return charts.filter(chart => chart.id === id).at(-1); } };
}

function rncRows() {
  const values = [headers,
    ['RNC-1', '', ' Grafica A ', 'ALFA', 'Pendente', 'Rasgado'],
    ['RNC-2', '', 'Grafica A', 'ALFA', '🚨 Atrasada', 'Rasgado'],
    ['RNC-3', '', 'Grafica A', 'BETA', '✅ Respondida no Prazo', 'Amassado'],
    ['RNC-4', '', 'Grafica A', 'BETA', 'Pendente', ''],
    ['RNC-5', '', 'Grafica B', 'ALFA', '⚠️ Respondida com Atraso', 'Rasgado'],
    ['RNC-6', '', 'Grafica B', 'BETA', '🚨 Atrasada', 'Amassado']
  ];
  return backend(values).ctx.getDadosRNC();
}

test('RNC le as 19 colunas, serializa datas e ignora linhas sem identificacao', () => {
  const opened = new Date('2026-10-09T11:30:00-03:00');
  const row = ['RNC-001', opened, 'Grafica A', 'ALFA', 'Pendente',
    'Rasgado', 0, '', 'Amostra', '00123', 'Livro', '', '', 'CD A',
    'Grafica A', '', '', '', false];
  const second = ['', new Date('2026-10-08T00:00:00-03:00'), 'Grafica B'];
  const { ctx, calls } = backend([headers, row, ['', '', 'Linha vazia'], second]);
  const result = plain(ctx.getDadosRNC());

  assert.deepEqual(calls, [['bd_rnc', 19]]);
  assert.equal(result.length, 2);
  assert.equal(Object.keys(result[0]).length, 19);
  assert.equal(result[0].Data, '2026-10-09T14:30:00.000Z');
  assert.equal(result[1].Data, '2026-10-08T03:00:00.000Z');
  assert.equal(result[0]['Nº RNC'], 'RNC-001');
  assert.equal(result[0].Quantidade, 0);
  assert.equal(result[0].SKU, '00123');
  assert.equal(result[0].Col18, false);
});

test('RNC nao converte uma falha de leitura de cache em dados vazios', () => {
  const { ctx } = backend([headers]);
  assert.deepEqual(plain(ctx.getDadosRNC()), []);
  const failure = Object.assign(new Error('Fonte temporariamente indisponivel'),
    { cacheLeitura: true });
  ctx.pgLerAbaCache_ = () => { throw failure; };
  assert.throws(() => ctx.getDadosRNC(), error => error === failure);
});

test('tela RNC usa os registros lidos para contar SLA e montar os graficos', () => {
  const rows = rncRows();
  const ui = frontend();
  runHtmlScripts('Scripts_Globais_1.html', ui.ctx, rows);
  runHtmlScripts('abaRNCs.html', ui.ctx);
  ui.ctx.iniciarAbaRNCs();

  assert.equal(ui.element('kpiRncAbertas').innerText, 4);
  assert.equal(ui.element('kpiRncAtrasadas').innerText, 2);
  assert.equal(ui.element('kpiRncRespondidas').innerText, 2);
  const suppliers = ui.chart('graficoRncFornecedor').config.data;
  assert.deepEqual(plain(suppliers.labels), ['Grafica A', 'Grafica B']);
  assert.deepEqual(plain(suppliers.datasets[0].data), [4, 2]);
  const pareto = ui.chart('graficoRncPareto').config.data;
  assert.deepEqual(plain(pareto.labels), ['Rasgado', 'Amassado', 'Não Informado']);
  assert.deepEqual(plain(pareto.datasets[1].data), [3, 2, 1]);
  assert.equal(pareto.datasets[0].data[0], 50);
  assert.equal(pareto.datasets[0].data.at(-1), 100);
});

test('filtros combinados de RNC recalculam os cards e substituem os graficos', () => {
  const ui = frontend();
  runHtmlScripts('abaRNCs.html', ui.ctx);
  ui.ctx.DADOS_RNC_CACHE = rncRows();
  ui.ctx.iniciarAbaRNCs();
  const original = [...ui.charts];

  ui.element('filtroRncFornecedor').value = 'Grafica A';
  ui.element('filtroRncMarca').value = 'BETA';
  ui.ctx.processarRNCs();
  assert.equal(ui.element('kpiRncAbertas').innerText, 1);
  assert.equal(ui.element('kpiRncAtrasadas').innerText, 0);
  assert.equal(ui.element('kpiRncRespondidas').innerText, 1);
  assert(original.every(chart => chart.destroyed));
  const brands = ui.chart('graficoRncMarca').config.data;
  assert.deepEqual(plain(brands.labels), ['BETA']);
  assert.deepEqual(plain(brands.datasets[0].data), [2]);
  assert.deepEqual(plain(ui.chart('graficoRncPareto').config.data.datasets[0].data), [50, 100]);

  ui.element('filtroRncMarca').value = 'MARCA AUSENTE';
  ui.ctx.processarRNCs();
  for (const id of ['kpiRncAbertas', 'kpiRncAtrasadas', 'kpiRncRespondidas']) {
    assert.equal(ui.element(id).innerText, 0);
  }
  const emptyPareto = ui.chart('graficoRncPareto').config.data;
  assert.deepEqual(plain(emptyPareto.datasets.map(dataset => dataset.data)), [[0], [0]]);
});

test('Inspecoes CDs continuam executaveis depois do bloco de cache RNC', () => {
  const ui = frontend();
  runHtmlScripts('Scripts_Globais_1.html', ui.ctx, rncRows());
  assert.equal(typeof ui.ctx.iniciarAbaInspecaoCDs, 'function');
  assert.equal(typeof ui.ctx.processarInspecoesCDs, 'function');
  ui.ctx.DADOS_INSPECOES_CACHE = [
    { CD: 'CD A', 'Gráfica': 'Grafica A', Marca: 'ALFA', Status: 'Aprovado',
      Tiragem: 100, 'Data de inicio da amostragem': '2026-10-05T12:00:00Z' },
    { CD: 'CD A', 'Gráfica': 'Grafica A', Marca: 'ALFA', Status: 'Reprovado',
      Tiragem: 50, 'Páginas soltas': 3,
      'Data de inicio da amostragem': '2026-10-05T12:00:00Z' },
    { CD: 'CD B', 'Gráfica': 'Grafica B', Marca: 'BETA', Status: 'Pendente', Tiragem: 50 }
  ];
  ui.ctx.iniciarAbaInspecaoCDs();
  assert.equal(ui.element('kpiInspTotal').innerText, '150');
  assert.equal(ui.element('kpiInspReprovado').innerText, '50');
  assert.equal(ui.element('kpiInspAdesao').innerText, '75,0%');
  assert.equal(ui.element('kpiInspConformidade').innerText, '66,7%');
  assert.deepEqual(plain(ui.chart('graficoInspPareto').config.data.datasets[1].data), [3]);
  assert.deepEqual(plain(ui.chart('graficoInspSemana').config.data.datasets[0].data), [150]);
});
