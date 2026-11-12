const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
const eventos = fs.readFileSync(path.join(__dirname, '..', 'EventosTPMapa.js'), 'utf8');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-12T15:00:00Z'])); }
}

function linha(overrides = {}) {
  return Object.assign(Array(53).fill(''), {
    0: 'COC', 1: 'ANTILHAS', 2: 'FORMA CERTA', 4: 'MP-1', 7: 'V1 - 27',
    10: 'KIT-1', 11: 'SKU-1', 14: 1280, 39: 1280,
    41: 'COCANTILHASFORMA CERTASKU-1V1', 45: '2026-11-10',
    46: '2026-11-11', 47: 'Entregue no Prazo', 49: 'V1'
  }, overrides);
}

function portal(linhas) {
  const leituras = [];
  const ctx = vm.createContext({
    Date: FixedDate,
    console: { warn() {} },
    Logger: { log() {} },
    pgLerAbaCache_(nomes, colunas) {
      leituras.push({ nomes: [...nomes], colunas });
      return [['cabecalhos'], ...linhas];
    },
    Utilities: { formatDate() { return '2026-11-12'; } }
  });
  vm.runInContext(codigo, ctx);
  vm.runInContext(eventos, ctx);
  ctx.pgChavesForecastTP_ = () => ({ conferido: true, coleta: [], entrega: [] });
  const bruto = JSON.parse(JSON.stringify(ctx.getDadosMapaSaida()));
  assert.equal(bruto._ERRO_CRITICO, undefined);
  const cache = JSON.parse(JSON.stringify(ctx.pgComplementarEventosTPMapa_(
    JSON.parse(JSON.stringify(bruto)))));
  return { bruto, cache, leituras, ctx };
}

test('somente NF venda chega como texto do mapa ao payload TP sem alterar volumes ou identidade', () => {
  const registro = linha({ 20: ' 000123 / 000456 ', 22: 987654 });
  const { bruto, cache, leituras } = portal([registro]);
  assert.deepEqual(leituras, [{
    nomes: ['MAPA DE SAÍDA', 'MAPA DE SAIDA', 'MAPA DE SAIDA '], colunas: 53
  }]);
  assert.equal(bruto[registro[41]][0].nfVenda, '000123 / 000456');
  assert.equal(Object.hasOwn(bruto[registro[41]][0], 'nfRemessa'), false);
  assert.equal(bruto.__linhasFisicas[0].nfVenda, '000123 / 000456');
  assert.equal(Object.hasOwn(bruto.__linhasFisicas[0], 'nfRemessa'), false);
  const [parcela] = cache.__eventosTPAtuais;
  assert.equal(parcela.nfVenda, '000123 / 000456');
  assert.equal(Object.hasOwn(parcela, 'nfRemessa'), false);
  assert.deepEqual([parcela.codigoMapa, parcela.sku, parcela.kit, parcela.destino, parcela.envio,
    parcela.volumeSolicitado, parcela.volumeColetado, parcela.coletaTP, parcela.entregaTP],
    ['MP-1', 'SKU-1', 'KIT-1', 'ANTILHAS', 'V1', 1280, 1280, '2026-11-10', '2026-11-11']);
  assert.deepEqual(cache[registro[41]], [{ vol: 1280, dataColeta: null, dataEntrega: null }],
    'O payload das telas legadas mantém o contrato anterior');
});

test('NF venda acompanha parcelas sem AP e adicionais sem ampliar as listas legadas', () => {
  const semAP = linha({ 4: 'MP-SEM-AP', 20: '000001', 22: '000002', 41: '' });
  const adicional = linha({ 4: 'MP-ADICIONAL', 20: '000003', 22: '000004',
    15: new FixedDate('2026-11-13T03:00:00Z') });
  const { cache } = portal([semAP, adicional]);
  assert.deepEqual(cache.__parcelasAgendaSemAP.map(e => [e.codigoMapa, e.nfVenda]),
    [['MP-SEM-AP', '000001']]);
  assert.deepEqual(cache.__eventosTPAtuais.map(e => [e.codigoMapa, e.nfVenda]),
    [['MP-ADICIONAL', '000003']]);
  assert(cache.__parcelasAgendaSemAP.concat(cache.__eventosTPAtuais)
    .every(e => !Object.hasOwn(e, 'nfRemessa')));
  assert.deepEqual(cache[adicional[41]], []);
});

test('NF venda ausente continua vazia e NF remessa de cache anterior não é projetada', () => {
  const registro = linha({ 20: null, 22: undefined });
  const { bruto, cache, ctx } = portal([registro]);
  assert.equal(bruto[registro[41]][0].nfVenda, '');
  assert.equal(cache.__eventosTPAtuais[0].nfVenda, '');
  delete bruto[registro[41]][0].nfVenda;
  bruto[registro[41]][0].nfRemessa = 'REMESSA-ANTIGA';
  const anterior = JSON.parse(JSON.stringify(ctx.pgComplementarEventosTPMapa_(bruto)));
  assert.equal(anterior.__agendaTPCompleta, true);
  assert.equal(anterior.__eventosTPAtuais[0].nfVenda, '');
  assert.equal(Object.hasOwn(anterior.__eventosTPAtuais[0], 'nfRemessa'), false);
});

test('NF venda numérica da fonte é transportada como texto', () => {
  const registro = linha({ 20: 987654 });
  const { bruto, cache } = portal([registro]);
  assert.equal(bruto[registro[41]][0].nfVenda, '987654');
  assert.equal(cache.__eventosTPAtuais[0].nfVenda, '987654');
});
