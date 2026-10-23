const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'HistoricoPCP2026.js'), 'utf8');
const headers = {
  B: 'GRÁFICA', C: 'UNIDADE', E: 'ENVIO', J: 'SÉRIE', X: 'CD DESTINO',
  AL: 'TIRAGEM OFICIAL (CALIBRADA)', BH: 'Coleta/Internalização de estoque final real.'
};

function app(linhas = [], alteracoes = {}) {
  const chamadas = [], gravacoes = [], itens = new Map();
  const cache = {
    get: chave => itens.get(chave) || null,
    getAll: chaves => Object.fromEntries(chaves.filter(c => itens.has(c)).map(c => [c, itens.get(c)])),
    putAll(valores) { gravacoes.push(valores); Object.entries(valores).forEach(([k, v]) => itens.set(k, v)); },
    put(chave, valor) { gravacoes.push({ [chave]: valor }); itens.set(chave, valor); }
  };
  const contexto = vm.createContext({
    console: { warn() {} },
    CacheService: { getScriptCache: () => cache },
    SpreadsheetApp: { getActiveSpreadsheet() { throw Error('Nao deve consultar o PCP atual'); } },
    Sheets: { Spreadsheets: {
      get(id, opcoes) {
        chamadas.push({ tipo: 'meta', id, opcoes });
        return { sheets: [{ properties: { title: 'Consolidado', gridProperties: { rowCount: linhas.length + 2 } } }] };
      },
      Values: { batchGet(id, opcoes) {
        chamadas.push({ tipo: 'values', id, opcoes });
        if (alteracoes.erro) throw alteracoes.erro;
        return { valueRanges: opcoes.ranges.map(range => {
          const coluna = range.match(/!([A-Z]+)2:/)[1];
          const values = [[alteracoes[coluna] || headers[coluna]], ...linhas.map(l => l[coluna] == null ? [] : [l[coluna]])];
          while (values.length > 1 && !values.at(-1).length) values.pop();
          return { range, values };
        }) };
      } }
    } }
  });
  vm.runInContext(fonte, contexto);
  return { ctx: contexto, chamadas, gravacoes, itens };
}

function linha(overrides = {}) {
  return { B: ' Posigraf ', C: ' sas ', E: 'V1', J: '3A SERIE', X: ' Jundiaí - SP ', AL: 100, BH: '17/07/2025', ...overrides };
}

test('consulta so as sete colunas do historico, valida linha 2 e preserva o ano de BH', () => {
  const { ctx, chamadas } = app([linha({ AL: 1234.9, BH: 45855.75 })]);
  const dados = ctx.getDadosHistoricoPCP2026();
  assert.equal(dados.ciclo, 2026);
  assert.deepEqual(JSON.parse(JSON.stringify(dados.rows)), [{
    grafica: 'POSIGRAF', unidade: 'SAS', envio: 'V1', serie: '3A SERIE', cd: 'Jundiaí - SP',
    tiragem: 1234.9, dataReal: '2025-07-17'
  }]);
  assert.equal(chamadas.length, 2);
  assert(chamadas.every(c => c.id === '1O2TCumUOJlU9GZRZ89lU1zVSqB9L3Do_Up6gBQx-6Dg'));
  assert.deepEqual(Array.from(chamadas[1].opcoes.ranges), Object.keys(headers).map(c => `'Consolidado'!${c}2:${c}3`));
  assert.equal(chamadas[1].opcoes.valueRenderOption, 'UNFORMATTED_VALUE');
  assert.equal(chamadas[1].opcoes.dateTimeRenderOption, 'SERIAL_NUMBER');
});

test('mantem denominador sem BH, sem preencher com previsto, e nao mistura envios', () => {
  const { ctx } = app([
    linha({ AL: 100.1, BH: '2025-07-17', E: ' v 01-26 ' }),
    linha({ AL: 200.2, BH: '', BG: '2025-07-20', E: 'V1' }),
    linha({ AL: '1.234,5', BH: '31/02/2025', E: 'V2' }),
    linha({ AL: 0, BH: '2025-07-19' })
  ]);
  const dados = ctx.getDadosHistoricoPCP2026();
  assert.equal(dados.rows.length, 3);
  const v1 = dados.rows.filter(r => r.envio === 'V1');
  assert.equal(v1.length, 2);
  assert(Math.abs(v1.reduce((soma, r) => soma + r.tiragem, 0) - 300.3) < 1e-9);
  assert.equal(v1[1].dataReal, '');
  assert.equal(dados.rows[2].envio, 'V2');
  assert.equal(dados.rows[2].tiragem, 1234.5);
  assert.equal(dados.rows[2].dataReal, '');
});

test('coluna BH mais curta ou vazios intermediarios mantem a linha de origem', () => {
  const { ctx } = app([
    linha({ BH: '' }), linha({ BH: '2025-08-04' }), linha({ BH: '' }), linha({ BH: '' })
  ]);
  assert.deepEqual(Array.from(ctx.getDadosHistoricoPCP2026().rows, r => r.dataReal), ['', '2025-08-04', '', '']);
});

test('aceita variacoes cosmeticas do cabecalho mas rejeita fonte planejada em BH', () => {
  assert.doesNotThrow(() => app([linha()], { BH: ' COLETA / INTERNALIZACAO de estoque\nFINAL REAL ' }).ctx.getDadosHistoricoPCP2026());
  const { ctx, gravacoes } = app([linha()], { BH: 'Coleta/Internalização de estoque final (re) plan' });
  assert.throws(() => ctx.getDadosHistoricoPCP2026(), /cabecalho inesperado em BH2/);
  assert.equal(gravacoes.length, 0);
});

test('falha da fonte ou tiragem invalida nao grava cache vazio', () => {
  const api = app([linha()], { erro: Error('Fonte indisponivel') });
  assert.throws(() => api.ctx.getDadosHistoricoPCP2026(), /Fonte indisponivel/);
  assert.equal(api.gravacoes.length, 0);
  for (const valor of ['#N/A', true, -1, '1.234,xx']) {
    const { ctx, gravacoes } = app([linha({ AL: valor })]);
    assert.throws(() => ctx.getDadosHistoricoPCP2026(), /tiragem invalida em AL3/);
    assert.equal(gravacoes.length, 0);
  }
});

test('cache proprio evita nova leitura e cache incompleto busca a fonte novamente', () => {
  const { ctx, chamadas, itens } = app([linha()]);
  const primeiro = ctx.getDadosHistoricoPCP2026();
  const segundo = ctx.getDadosHistoricoPCP2026();
  assert.deepEqual(JSON.parse(JSON.stringify(segundo)), JSON.parse(JSON.stringify(primeiro)));
  assert.equal(chamadas.length, 2);
  assert(Array.from(itens.keys()).every(c => c.startsWith('PG_HISTORICO_PCP2026_')));
  const chaveParte = Array.from(itens.keys()).find(c => !c.endsWith(':manifesto'));
  itens.delete(chaveParte);
  assert.equal(ctx.getDadosHistoricoPCP2026().rows.length, 1);
  assert.equal(chamadas.length, 4);
});

test('cache fatiado remonta todas as linhas e nao devolve publicacao parcial', () => {
  const linhas = Array.from({ length: 1200 }, (_, i) => linha({ AL: i + 0.25, J: `Serie ${i}` }));
  const { ctx, chamadas, itens } = app(linhas);
  ctx.getDadosHistoricoPCP2026();
  const partes = Array.from(itens.keys()).filter(c => !c.endsWith(':manifesto'));
  assert(partes.length > 1);
  const cache = ctx.getDadosHistoricoPCP2026();
  assert.equal(cache.rows.length, 1200);
  assert.equal(cache.rows[1199].tiragem, 1199.25);
  assert.equal(cache.rows[1199].serie, 'Serie 1199');
  assert.equal(chamadas.length, 2);
  itens.delete(partes[Math.floor(partes.length / 2)]);
  assert.equal(ctx.getDadosHistoricoPCP2026().rows.length, 1200);
  assert.equal(chamadas.length, 4);
});

test('aba ausente e resposta incompleta falham antes de publicar cache', () => {
  const ausente = app([linha()]);
  ausente.ctx.Sheets.Spreadsheets.get = () => ({ sheets: [] });
  assert.throws(() => ausente.ctx.getDadosHistoricoPCP2026(), /aba Consolidado ausente/);
  assert.equal(ausente.gravacoes.length, 0);
  const incompleta = app([linha()]);
  incompleta.ctx.Sheets.Spreadsheets.Values.batchGet = () => ({ valueRanges: [] });
  assert.throws(() => incompleta.ctx.getDadosHistoricoPCP2026(), /resposta incompleta/);
  assert.equal(incompleta.gravacoes.length, 0);
});

test('cache indisponivel nao impede consulta valida e datas invalidas nao mudam o dia', () => {
  const { ctx } = app([linha()]);
  ctx.CacheService.getScriptCache = () => { throw Error('Cache indisponivel'); };
  assert.equal(ctx.getDadosHistoricoPCP2026().rows[0].dataReal, '2025-07-17');
  for (const valor of [0, NaN, Infinity, -1, '29/02/2025', '2025-13-01', 'data pendente']) {
    assert.equal(ctx.pgDataHistorico2026_(valor), '');
  }
  assert.equal(ctx.pgDataHistorico2026_('2024-02-29'), '2024-02-29');
  assert.equal(ctx.pgDataHistorico2026_('2025-07-17T23:59:00-03:00'), '2025-07-17');
});
