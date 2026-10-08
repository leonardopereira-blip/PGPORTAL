const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
const now = '2026-10-08T15:00:00Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return Date.parse(now); }
}

function mapaRow(overrides = {}) {
  const row = Array(50).fill('');
  Object.assign(row, {
    0: 'COC', 1: 'ANTILHAS', 2: 'FORMA CERTA', 4: 'MP-1', 7: 'V1 - 27',
    10: 'KIT-1', 11: 'CCP25PP26111801', 14: 1280, 39: 1280,
    41: 'COCANTILHASFORMA CERTACCP25PP26111801V1', 45: '2026-07-31',
    46: '2026-08-03', 47: 'Entregue no Prazo', 49: 'V1'
  }, overrides);
  return row;
}

function app(rows) {
  const calls = [];
  const ctx = vm.createContext({
    Date: FixedDate,
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} },
    pgLerAbaCache_(names, columns) { calls.push({ names: [...names], columns }); return [['headers'], ...rows]; },
    Utilities: { formatDate(date, zone, format) {
      assert.equal(zone, 'America/Sao_Paulo');
      assert.equal(format, 'yyyy-MM-dd');
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date).map(part => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    } }
  });
  vm.runInContext(source, ctx);
  return { value: JSON.parse(JSON.stringify(ctx.getDadosMapaSaida())), calls };
}

test('le ate AX e preserva campos legacy ao acrescentar identidade e dados TP', () => {
  const row = mapaRow({ 15: new FixedDate('2026-07-31T03:00:00Z'), 26: new FixedDate('2026-08-03T03:00:00Z') });
  const { value, calls } = app([row]);
  assert.equal(calls[0].columns, 50, 'a leitura deve incluir AU, AV e AX');
  assert.deepEqual(calls[0].names, ['MAPA DE SAÍDA', 'MAPA DE SAIDA', 'MAPA DE SAIDA ']);
  const event = value[row[41]][0];
  assert.deepEqual({ vol: event.vol, dataColeta: event.dataColeta, dataEntrega: event.dataEntrega }, {
    vol: 1280, dataColeta: '2026-07-31', dataEntrega: '2026-08-03'
  });
  assert.equal(event.codigoMapa, 'MP-1');
  assert.equal(event.marca, 'COC');
  assert.equal(event.destino, 'ANTILHAS');
  assert.equal(event.grafica, 'FORMA CERTA');
  assert.equal(event.kit, 'KIT-1');
  assert.equal(event.sku, 'CCP25PP26111801');
  assert.equal(event.envioRaw, 'V1 - 27');
  assert.equal(event.envio, 'V1');
  assert.equal(event.linhaMapa, 2);
  assert.equal(event.volumeColetado, 1280);
  assert.equal(event.coletaTP, '2026-07-31');
  assert.equal(event.entregaTP, '2026-08-03');
  assert.equal(event.statusTP, 'Entregue no Prazo');
  assert.equal(Object.hasOwn(event, 'volumeEntregaTP'), false, 'nao inventa quantidade de entrega');
});

test('dois codigos do mesmo destino mantem datas e parcelas distintas que conciliam com PCP', () => {
  // Evidencia local: PCP linha 2 tem AZ=1403 e data minima 31/07;
  // Mapa linhas 745/1881 tem parcelas 1280 em 31/07 e 123 em 04/09.
  const first = mapaRow({ 4: 'MP 95 V1 COC FC' });
  const second = mapaRow({ 4: 'MP-506731-COC-V1-FORMACERTA', 14: 123, 39: 123,
    45: '2026-09-04', 46: '2026-09-04' });
  const events = app([first, second]).value[first[41]];
  assert.equal(events.length, 2);
  assert.equal(events.reduce((sum, event) => sum + event.volumeColetado, 0), 1403);
  assert.deepEqual(events.map(event => [event.codigoMapa, event.coletaTP, event.volumeColetado]), [
    ['MP 95 V1 COC FC', '2026-07-31', 1280],
    ['MP-506731-COC-V1-FORMACERTA', '2026-09-04', 123]
  ]);
});

test('P futuro continua fora de arrays legacy e TP realizado fica na lista reservada', () => {
  const accepted = mapaRow();
  const skipped = mapaRow({ 4: 'MP-2', 15: new FixedDate('2026-10-09T03:00:00Z'), 45: '2026-10-07' });
  const futureTP = mapaRow({ 4: 'MP-3', 15: new FixedDate('2026-10-09T03:00:00Z'), 45: '2026-10-10' });
  const absentTP = mapaRow({ 4: 'MP-4', 15: new FixedDate('2026-10-09T03:00:00Z'), 45: '' });
  const { value } = app([accepted, skipped, futureTP, absentTP]);
  assert.deepEqual(value[accepted[41]].map(event => event.codigoMapa), ['MP-1']);
  assert.equal(value.__eventosTPAdicionais.length, 1);
  assert.equal(value.__eventosTPAdicionais[0].codigoMapa, 'MP-2');
  assert.equal(value.__eventosTPAdicionais[0].chaveMapa, accepted[41]);
  assert.equal(value.__eventosTPAdicionais[0].coletaTP, '2026-10-07');
  const onlySkipped = app([skipped]).value;
  assert.deepEqual(onlySkipped[skipped[41]], [], 'chave vazia legacy segue preservada');
});

test('datas TP respeitam calendario Sao Paulo para Date, ISO, BR e seriais', () => {
  const inputs = [new FixedDate('2026-09-04T01:00:00Z'), '2026-09-04T01:00:00Z',
    '2026-09-04', '04/09/2026 23:30:00', 46269.5, '2026-09-04T23:30:00-03:00'];
  const rows = inputs.map((value, index) => mapaRow({ 4: `MP-${index}`, 45: value, 46: value }));
  const events = app(rows).value[rows[0][41]];
  assert.deepEqual(events.map(event => event.coletaTP), [
    '2026-09-03', '2026-09-03', '2026-09-04', '2026-09-04', '2026-09-04', '2026-09-04'
  ]);
  assert.deepEqual(events.map(event => event.entregaTP), events.map(event => event.coletaTP));
});

test('dados TP ausentes ou invalidos permanecem sem data e sem quantidade inventada', () => {
  const inputs = ['', null, 0, NaN, false, '31/02/2026', '2026-02-30', '2026-09-04T25:00:00', '#REF!', '04/09'];
  const rows = inputs.map(value => mapaRow({ 39: value, 45: value, 46: value, 49: '' }));
  const events = app(rows).value[rows[0][41]];
  assert(events.every(event => event.coletaTP === null && event.entregaTP === null));
  assert.deepEqual(events.map(event => event.volumeColetado), [null, null, 0, null, null, null, null, null, null, null]);
  assert(events.every(event => event.envio === ''), 'nao transforma envio original sem campo AX');
});

test('quantidade TP usa AN sem substituir vol legacy e preserva parcelas repetidas', () => {
  const row = mapaRow({ 14: '1.234,50', 39: '1.234,50' });
  const { value } = app([row, [...row], mapaRow({ 41: '' })]);
  assert.equal(value[row[41]].length, 2, 'backend nao deduplica parcelas sem evidencia');
  assert(value[row[41]].every(event => event.volumeColetado === 1234.5));
  assert(value[row[41]].every(event => event.vol === 1.234), 'parser de vol legacy permanece igual');
  assert.equal(Object.keys(value).length, 1);
});
