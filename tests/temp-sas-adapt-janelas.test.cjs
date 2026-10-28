const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'TempSasAdapt.js'), 'utf8');
const contexto = vm.createContext({ Date });
vm.runInContext(source, contexto);

const header = ['Pedido', 'Cod Kit', 'Componente', 'Qtde', 'CD'];
const linha = (pedido, kit, componente, qtde, cd = 'Jundiaí - SP') => [pedido, kit, componente, qtde, cd];
const janela = (id, rows, titulo = 'Janela ' + id) => ({ id, titulo, valores: [header.slice(), ...rows] });
const mapa = (kit, sku, coletado, overrides = {}) => ({ kit, sku, coletado,
  destino: 'CD JDI', codigoMapa: 'MP-1', linhaMapa: 2, ...overrides });
const calcular = (janelas, saidas = []) => contexto.pgTempSasAdaptEntregasJanelas_(janelas, saidas);

test('meta conta cada pedido uma vez e entrega exige todos os componentes do kit', () => {
  const j = janela('1', [linha('P-1', 'KIT-1', 'SKU-A', 100),
    linha('P-1', 'KIT-1', 'SKU-B', 100), linha('P-1', 'KIT-1', 'SKU-A', 100)]);
  const [r] = calcular([j], [mapa('KIT-1', 'SKU-A', 90), mapa('KIT-1', 'SKU-B', 65)]);
  assert.equal(r.total, 100, 'não soma meta repetida nas linhas de componentes');
  assert.equal(r.entregue, 65, 'kits confirmados são o mínimo entre os componentes necessários');
  assert.equal(r.saldo, 35);
  assert.equal(r.aConferir, 0);
  const [incompleto] = calcular([j], [mapa('KIT-1', 'SKU-A', 100)]);
  assert.equal(incompleto.entregue, 0, 'um componente ausente impede confirmar kit completo');
});

test('parcelas repetidas usam máximo por mapa, kit, componente e CD; kits distintos somam', () => {
  const j = janela('1', [linha('P-1', 'KIT-1', 'SKU', 100), linha('P-2', 'KIT-2', 'SKU', 100)]);
  const [r] = calcular([j], [mapa('KIT-1', 'SKU', 20), mapa('KIT-1', 'SKU', 25),
    mapa('KIT-1', 'SKU', 25), mapa('KIT-2', 'SKU', 40),
    mapa('KIT-1', 'SKU', 5, { codigoMapa: 'MP-2' })]);
  assert.equal(r.total, 200);
  assert.equal(r.entregue, 70, 'KIT-1 = máximo 25 + outra parcela 5; KIT-2 = 40');
  assert.equal(r.saldo, 130);
});

test('sem código de mapa a linha física identifica a parcela e não duplica a repetição', () => {
  const [r] = calcular([janela('1', [linha('P-1', 'KIT-1', 'SKU', 100)])], [
    mapa('KIT-1', 'SKU', 12, { codigoMapa: '', linhaMapa: 30 }),
    mapa('KIT-1', 'SKU', 15, { codigoMapa: '', linhaMapa: 30 }),
    mapa('KIT-1', 'SKU', 7, { codigoMapa: '', linhaMapa: 31 })
  ]);
  assert.equal(r.entregue, 22);
});

test('coleta com identidade presente em duas janelas fica a conferir sem rateio ou dupla contagem', () => {
  const js = [janela('1', [linha('MESMO-PEDIDO', 'KIT-1', 'SKU', 100)]),
    janela('2', [linha('MESMO-PEDIDO', 'KIT-1', 'SKU', 40)])];
  const rs = calcular(js, [mapa('KIT-1', 'SKU', 30)]);
  assert.deepEqual(Array.from(rs, r => [r.total, r.entregue, r.saldo, r.aConferir]),
    [[100, 0, 100, 100], [40, 0, 40, 40]]);
  assert.equal(rs.reduce((sum, r) => sum + r.entregue, 0), 0);
  const semColeta = calcular(js, []);
  assert.ok(Array.from(semColeta).every(r => r.aConferir === 0),
    'compartilhar cadastro sem parcela física não cria entrega a conferir');
});

test('dois pedidos da mesma janela não consomem a mesma parcela física', () => {
  const [r] = calcular([janela('1', [linha('P-1', 'KIT-1', 'SKU', 100),
    linha('P-2', 'KIT-1', 'SKU', 50)])], [mapa('KIT-1', 'SKU', 40)]);
  assert.equal(r.total, 150);
  assert.equal(r.entregue, 0);
  assert.equal(r.aConferir, 150);
});

test('componente igual em outro kit ou CD não atende o pedido', () => {
  const [r] = calcular([janela('1', [linha('P-1', 'KIT-1', 'SKU', 100)])], [
    mapa('KIT-2', 'SKU', 100), mapa('KIT-1', 'SKU', 100, { destino: 'Fortaleza - CE' }),
    mapa('KIT-1', 'OUTRO-SKU', 100)
  ]);
  assert.equal(r.entregue, 0);
  assert.equal(r.saldo, 100);
  assert.equal(r.aConferir, 0);
});

test('quantidade confirmada respeita a meta e ignora valores físicos negativos', () => {
  const [r] = calcular([janela('1', [linha('P-1', 'KIT-1', 'SKU', '100')])], [
    mapa('KIT-1', 'SKU', '150,00'), mapa('KIT-1', 'SKU', -10, { codigoMapa: 'MP-2' })
  ]);
  assert.equal(r.entregue, 100);
  assert.equal(r.saldo, 0);
  assert.equal(r.aConferir, 0);
});

test('resolve cabeçalhos pelo nome e normaliza os CDs originais, kit e SKU', () => {
  const j = { id: '1', titulo: 'Janela de referência', valores: [
    ['CD', 'Qtde', 'Pedido', 'Componente', 'Cod Kit'],
    ['Jundiaí - SP', 20, 'P-JDI', ' sku-a ', ' kit-a '],
    ['Itaitinga - CE', 30, 'P-FOR', 'SKU-B', 'KIT-B'],
    ['Ribeirão Preto - SP', 40, 'P-RP', 'SKU-C', 'KIT-C']
  ] };
  const [r] = calcular([j], [mapa('KIT-A', 'SKU-A', 10),
    mapa('KIT-B', 'SKU-B', 20, { destino: 'CD FOR' }),
    mapa('KIT-C', 'SKU-C', 30, { destino: 'CD RP' })]);
  assert.equal(r.id, '1');
  assert.equal(r.titulo, 'Janela de referência');
  assert.equal(r.total, 90);
  assert.equal(r.entregue, 60);
  assert.equal(r.saldo, 30);
});

test('cálculo isolado preserva dados e linhas vazias da fonte recebida', () => {
  const j = janela('1', [[], linha('P-3', 'KIT-1', 'SKU', 10), []]);
  const saidas = [mapa('KIT-1', 'SKU', 5, { linhaMapa: 47 })];
  const antes = JSON.stringify({ j, saidas });
  const [r] = calcular([j], saidas);
  assert.equal(r.total, 10);
  assert.equal(r.entregue, 5);
  assert.equal(JSON.stringify({ j, saidas }), antes, 'não reordena nem reescreve as fontes compartilhadas');
});

test('leitor mantém sheetId, títulos com espaço final e linhas físicas em intervalos limitados', () => {
  const requests = [];
  const titulos = ['Janela_1 - 13-10 ', "Janela_2 - d'água "];
  const ids = [1073453236, 1546857491];
  const values = [[header.slice(), [], linha('P-3', 'KIT-1', 'SKU-A', 10)],
    [header.slice(), linha('P-2', 'KIT-2', 'SKU-B', 20)]];
  const api = vm.createContext({ Date, Sheets: { Spreadsheets: {
    get(id, options) {
      requests.push({ type: 'metadata', id, options });
      return { sheets: titulos.map((title, i) => ({ properties: { sheetId: ids[i], title,
        gridProperties: { rowCount: i ? 9 : 7, columnCount: 26 } } })) };
    },
    Values: { batchGet(id, options) {
      requests.push({ type: 'values', id, options });
      assert.deepEqual(Array.from(options.ranges), ["'Janela_1 - 13-10 '!A1:Y7", "'Janela_2 - d''água '!A1:Y9"]);
      return { valueRanges: values.map((rows, i) => ({ range: options.ranges[i], values: rows })) };
    } }
  } } });
  vm.runInContext(source, api);
  const rs = api.pgTempSasAdaptLerJanelas_();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].type, 'metadata');
  assert.equal(requests[1].type, 'values');
  assert.equal(requests[0].id, '1vBqSFyKqv8Ttco5LkfQm4SBLOU2EX7FWkOw3maBndIQ');
  assert.equal(requests[1].id, requests[0].id);
  assert.deepEqual(Array.from(rs, r => String(r.id)), ids.map(String));
  assert.deepEqual(Array.from(rs, r => r.titulo), titulos);
  assert.equal(rs[0].valores.length, 3);
  assert.equal(rs[0].valores[1].length, 0, 'linha física vazia permanece no índice original');
  assert.equal(rs[0].valores[2][0], 'P-3');
});
