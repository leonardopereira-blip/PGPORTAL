const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const inicio = source.indexOf('const pgCacheVolumesColetaV37 = new WeakMap();');
const fim = source.indexOf('window.pgTiragemColetadaBruta = function', inicio);
const code = source.slice(inicio, fim);

function contexto() {
  const context = vm.createContext({
    dtHojeISO: '2026-10-05',
    window: {
      pgNumeroPrazoV35: v => Number(v) || 0,
      pgCampoPrazoV35: (row, name) => row[name] ?? '',
      pgNormalizarDataColeta: v => v ? String(v).slice(0, 10) : null
    }
  });
  vm.runInContext(code, context);
  return context.window;
}

test('Mapa solicitado sempre usa a coluna TIRAGEM COLETADA inteira', () => {
  const w = contexto();
  const base = { 'TIRAGEM COLETADA': 100 };

  for (const mapaAgendado of ['', '2026-10-04', '2026-10-05', '2026-10-06']) {
    const v = w.pgVolumesColetaUnificadosV37(
      { ...base, Mapa_Agendado: mapaAgendado }, '2026-10-05');
    assert.equal(v.mapa, 100, mapaAgendado || 'sem data');
  }
});

test('Mapa agendado usa EB e somente data >= hoje', () => {
  const w = contexto();
  const base = { 'TIRAGEM COLETADA': 100 };

  assert.equal(w.pgVolumesColetaUnificadosV37(
    { ...base, Mapa_Agendado: '2026-10-04' }, '2026-10-05').agendado, 0);
  assert.equal(w.pgVolumesColetaUnificadosV37(
    { ...base, Mapa_Agendado: '' }, '2026-10-05').agendado, 0);
  assert.equal(w.pgVolumesColetaUnificadosV37(
    { ...base, Mapa_Agendado: '2026-10-05' }, '2026-10-05').agendado, 100);
  assert.equal(w.pgVolumesColetaUnificadosV37(
    { ...base, Mapa_Agendado: '2026-10-06' }, '2026-10-05').agendado, 100);
});

test('regra de mapa nao altera Coleta TP nem Entrega TP realizadas', () => {
  const w = contexto();
  const v = w.pgVolumesColetaUnificadosV37({
    'TIRAGEM COLETADA': 100,
    Mapa_Agendado: '2026-10-04',
    Coleta_TP: '2026-10-04',
    Entrega_TP: '2026-10-05'
  }, '2026-10-05');

  assert.equal(v.bruto, 100);
  assert.equal(v.mapa, 100);
  assert.equal(v.agendado, 0);
  assert.equal(v.coleta, 100);
  assert.equal(v.entrega, 100);
});
