const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'AuditoriaMetaArmazem.js'), 'utf8');
const headers = [...source.match(/var colunas = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const volumes = ['Entregue Geral','Entregue armazém','Entregue dentro da meta','Entregue fora da meta',
  'Excedente de entrega','Coletado TP','Coletado TP bruto','Excedente de coleta'];
const textColumns = ['Parcelas de Entrega TP (data: quantidade)','Parcelas de Coleta TP (data: quantidade)',
  'Linhas de origem','Série original','Regra de conciliação','Composição do agrupamento',
  'Movimentos de Entrega TP','Movimentos de Coleta TP','Diagnósticos de conciliação'];

function spreadsheet() {
  const state = {calls: [], formats: [], values: null};
  const range = args => new Proxy({}, {get(_target, name) {
    return (...values) => {
      if (name === 'setValues') state.values = values[0];
      if (name === 'setNumberFormat') state.formats.push({column: args[1], format: values[0]});
      return range(args);
    };
  }});
  const sheet = {
    getRange: (...args) => range(args), getFilter: () => true,
    setFrozenRows() {}, setFrozenColumns() {}, setRowHeight() {},
    setColumnWidths() {}, setColumnWidth() {}
  };
  const context = {
    Utilities: {
      parseDate: value => new Date(value.slice(0, 10) + 'T15:00:00Z'),
      formatDate: date => date.toISOString().slice(0, 10)
    },
    SpreadsheetApp: {
      openById: () => ({setSpreadsheetLocale() {}, setSpreadsheetTimeZone() {}, getSheets: () => [sheet]}),
      BandingTheme: {LIGHT_GREY: 'grey'}, flush() {}
    },
    gerarPlanilhaReportExecutiva: payload => {
      state.calls.push(payload);
      return {success: true, id: 'audit-test'};
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename: 'AuditoriaMetaArmazem.js'});
  return {state, export: payload => context.gerarPlanilhaMetaArmazemAuditavel(payload)};
}

function payload(values = {}) {
  return {cabecalho: headers.slice(), linhas: [headers.map(name => values[name] ?? '')]};
}

test('Google Sheets recebe volumes e percentuais numéricos e conciliação preservada como texto', () => {
  const values = {
    Kit: '00012', SKU: '00034', 'Tiragem total': 300, 'Dentro da meta': 200,
    'Fora da meta': 999, 'Sem previsão': 20, '% dentro da meta': 999,
    'Entrega TP real': '2026-10-14', 'Linhas de origem': '0001 | 0002',
    'Composição do agrupamento': '[{"linha":"0001","tiragem":100},{"linha":"0002","tiragem":200}]',
    'Movimentos de Entrega TP': '[{"linhaMapa":2,"volume":250,"data":"2026-10-14"}]',
    'Movimentos de Coleta TP': '[{"linhaMapa":2,"volume":300,"data":"2026-10-13"}]',
    'Diagnósticos de conciliação': '=texto da origem',
    'Parcelas de Entrega TP (data: quantidade)': '14/10/2026: 250',
    'Parcelas de Coleta TP (data: quantidade)': '13/10/2026: 300',
    'Série original': '6º ANO', 'Regra de conciliação': 'Total do agrupamento'
  };
  volumes.forEach((name, i) => {values[name] = String(i + 10);});
  const app = spreadsheet(), result = app.export(payload(values));
  assert.equal(result.success, true);
  assert.equal(result.warning, undefined);
  assert.equal(app.state.calls.length, 1);
  const row = app.state.values;
  assert.equal(row.length, 1);
  const value = name => row[0][headers.indexOf(name)];
  assert.equal(value('Kit'), '00012');
  assert.equal(value('SKU'), '00034');
  assert.equal(value('Fora da meta'), 80);
  assert.equal(value('% dentro da meta'), 200 / 300);
  assert.equal(Object.prototype.toString.call(value('Entrega TP real')), '[object Date]');
  volumes.forEach((name, i) => {
    assert.equal(value(name), i + 10, name);
    assert(app.state.formats.some(f => f.column === headers.indexOf(name) + 1 && f.format === '#,##0'), name);
  });
  textColumns.forEach(name => {
    assert.equal(value(name), name === 'Diagnósticos de conciliação' ? "'=texto da origem" : values[name], name);
    assert(app.state.formats.some(f => f.column === headers.indexOf(name) + 1 && f.format === '@'), name);
  });
});

test('Google Sheets rejeita cabeçalho e linhas incompatíveis antes de criar arquivo', () => {
  for (const mutate of [
    p => {p.cabecalho.pop();},
    p => {[p.cabecalho[36], p.cabecalho[37]] = [p.cabecalho[37], p.cabecalho[36]];},
    p => {p.linhas[0].pop();}
  ]) {
    const app = spreadsheet(), input = payload();
    mutate(input);
    const result = app.export(input);
    assert.equal(result.success, false);
    assert.match(result.error, /cabeçalho|colunas incompletas/);
    assert.equal(app.state.calls.length, 0);
  }
});

test('Google Sheets rejeita número inválido em cada novo campo de volume', () => {
  volumes.forEach(name => {
    const app = spreadsheet(), result = app.export(payload({[name]: 'inválido'}));
    assert.equal(result.success, false, name);
    assert(result.error.includes('Número inválido') && result.error.includes(name), name);
    assert.equal(app.state.calls.length, 0, name);
  });
});
