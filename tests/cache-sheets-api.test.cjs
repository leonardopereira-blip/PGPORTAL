const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function app(values, formats = {}) {
  const calls = [];
  const ctx = vm.createContext({
    console: { log() {}, error() {}, warn() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getId: () => 'test-id',
      getSheetByName() { throw Error('Nao pode usar getSheetByName'); }
    }) },
    Utilities: { parseDate(s, zone, format) {
      assert.equal(zone, 'America/Sao_Paulo');
      assert.equal(format, 'yyyy-MM-dd HH:mm:ss.SSS');
      return new Date(s.replace(' ', 'T') + '-03:00');
    } },
    Sheets: { Spreadsheets: {
      get(id, options) {
        calls.push(Object.assign({ id }, options));
        if (!options.ranges) return {
          properties: { timeZone: 'America/Sao_Paulo' },
          sheets: Object.keys(values).map(title => ({ properties: { title,
            gridProperties: { rowCount: values[title].length || 1, columnCount: 135 }
          } }))
        };
        const data = options.ranges.map(range => {
          const match = range.match(/^'((?:[^']|'')+)'!A(\d+):[A-Z]+(\d+)$/);
          assert(match, 'Amostra de formatos deve limitar linhas e colunas');
          const name = match[1].replace(/''/g, "'");
          const start = Number(match[2]) - 1, end = Number(match[3]);
          const rowData = values[name].slice(start, end).map((row, index) => ({
            values: row.map((value, col) => ({ effectiveFormat: {
              numberFormat: { type: formats[`${start + index}:${col}`] || 'NUMBER' }
            } }))
          }));
          return { startRow: start, rowData };
        });
        return { sheets: [{ data }] };
      },
      Values: { get(id, range, options) {
        calls.push({ id, range, options });
        const name = range.match(/^'((?:[^']|'')+)'/)[1].replace(/''/g, "'");
        if (values[name] instanceof Error) throw values[name];
        const bounds = range.match(/!A(\d+):[A-Z]+(\d+)$/);
        assert(bounds, 'Todas as leituras devem limitar linhas e colunas');
        const rows = values[name].slice(Number(bounds[1]) - 1, Number(bounds[2]));
        while (rows.length && !rows[rows.length - 1].length) rows.pop();
        return { values: JSON.parse(JSON.stringify(rows)) };
      } }
    } }
  });
  for (const file of ['LeituraCacheSheets.js', 'Code.js', 'SalvaJson.js', 'CachePorCopia.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
  }
  return { ctx, calls };
}

test('preserva numeros, booleanos, vazios e datas no fuso da planilha', () => {
  const { ctx } = app({ Chamados: [['data', 'qtd', 'flag', 'fim'], [46000, 0, false], [46000.5, 4]] },
    { '1:0': 'DATE', '2:0': 'DATE_TIME' });
  const rows = ctx.pgLerAbaCache_('Chamados');
  const local = new Date(Date.UTC(1899, 11, 30) + 46000 * 86400000 + 3 * 3600000);
  assert.equal(rows[1][0].toISOString(), local.toISOString());
  assert.equal(rows[2][0].getTime() - rows[1][0].getTime(), 12 * 3600000);
  assert.equal(rows[1][1], 0);
  assert.equal(rows[1][2], false);
  assert.equal(rows[1][3], '');
});

// O formato e por coluna, entao o mock declara DATE em toda linha amostravel.
function formatoColuna(qtdLinhas, coluna, tipo) {
  const f = {};
  for (let i = 0; i < qtdLinhas; i++) f[i + ':' + coluna] = tipo;
  return f;
}

test('le a aba em blocos e converte a coluna de data toda', () => {
  const rows = Array.from({ length: 2001 }, () => [46000]);
  const { ctx, calls } = app({ Chamados: rows }, formatoColuna(2001, 0, 'DATE'));
  const result = ctx.pgLerAbaCache_('Chamados');
  assert.equal(typeof result[0][0].toISOString, 'function');
  assert.equal(typeof result[2000][0].toISOString, 'function');
  // Blocos de valores, mas uma unica consulta de formatos por aba.
  assert.equal(calls.filter(c => c.ranges).length, 1);
});

test('coluna de data preenchida so no fim converte as linhas em que aparece', () => {
  // Coluna 1 vazia nas primeiras linhas: a amostra tem que alcancar a linha 499.
  const rows = Array.from({ length: 500 }, () => [1]);
  rows[0] = ['qtd', 'prazo'];
  rows[499] = [1, 46000];
  const { ctx } = app({ Chamados: rows }, formatoColuna(500, 1, 'DATE'));
  const result = ctx.pgLerAbaCache_('Chamados');
  assert.equal(typeof result[499][1].toISOString, 'function');
  assert.equal(result[1][0], 1);
});

test('linhas vazias intermediarias nao mudam os indices', () => {
  const rows = Array.from({ length: 2002 }, () => []);
  rows[0] = ['SKU'];
  rows[2001] = ['ULTIMO'];
  const { ctx } = app({ Chamados: rows });
  const result = ctx.pgLerAbaCache_('Chamados');
  assert.equal(result.length, 2002);
  assert.equal(result[1000][0], '');
  assert.equal(result[2001][0], 'ULTIMO');
});

test('falha na consulta de formatos nao publica dados parciais', () => {
  const { ctx } = app({ qualidade_reclamacoes: Array.from({ length: 1001 }, () => [46000]) },
    { '0:0': 'DATE' });
  const original = ctx.Sheets.Spreadsheets.get;
  ctx.Sheets.Spreadsheets.get = (id, options) => {
    if (options.ranges) throw Error('Servico indisponivel');
    return original(id, options);
  };
  let writes = 0;
  ctx.salvarJSONNoDrive = () => { writes++; return true; };
  assert.throws(() => ctx.atualizarCacheQualidade(), /Servico indisponivel/);
  assert.equal(writes, 0);
});

test('leitura formatada dispensa formatos e reutiliza metadados', () => {
  const { ctx, calls } = app({ "CAL EDIT D'HOJE": [['SKU'], ['00123', '18/05/2026']] });
  const data = ctx.pgLerAbaCache_('CAL. EDIT.', 40, true, false, true);
  assert.equal(data[1][0], '00123');
  assert.equal(data[1][1], '18/05/2026');
  assert.equal(data[1].length, 40);
  assert.equal(ctx.pgLerAbaCache_('ausente', 0, false, true), null);
  assert.equal(calls.filter(c => c.fields).length, 1);
  assert.equal(calls[1].options.valueRenderOption, 'FORMATTED_VALUE');
});

test('falha da API nao vira cache vazio em qualidade', () => {
  const { ctx } = app({ qualidade_reclamacoes: Error('Indisponivel') });
  let writes = 0;
  ctx.salvarJSONNoDrive = () => { writes++; return true; };
  assert.throws(() => ctx.atualizarCacheQualidade(), /Indisponivel/);
  assert.equal(writes, 0);
});

test('todos os processadores de cache usam API, sem localizar abas pelo SpreadsheetApp', () => {
  const names = ['PCP', 'PCP_ACABADORAS', 'Base_Cockpit_Status', 'CAL. EDIT.',
    'qualidade_reclamacoes', 'ppm_consolidado', 'Alocacao_Reentradas', 'Chamados',
    'Caixas', 'MAPA DE SAIDA', 'qlogs_V4', 'Obs_Cockpit', 'Obs_Cockpit_sku'];
  const { ctx } = app(Object.fromEntries(names.map(n => [n, [['header']]])));
  for (const fn of ['_processarDadosDashboardBruto', 'getDadosCockpit', 'getDadosPreProducao',
    'getDadosQualidade', 'getDadosPPM', 'getDadosAlocacao', 'getDadosChamados',
    'getDadosCaixas', 'getDadosMapaSaida', 'getDadosInspecaoCDs', 'buscarHistoricoObsGiro']) {
    assert.doesNotThrow(() => ctx[fn]());
  }
});

test('atualizacao completa continua apos erro e informa falhas ao final', () => {
  const { ctx } = app({});
  const writes = [];
  ctx.atualizarCacheDashboard = () => { throw Error('PCP indisponivel'); };
  for (const name of ['getDadosCockpit', 'getDadosPreProducao', 'getDadosQualidade',
    'getDadosPPM', 'getDadosInspecaoCDs', 'getDadosAlocacao', 'getDadosChamados',
    'getDadosCaixas', 'getDadosMapaSaida', 'buscarHistoricoObsGiro']) ctx[name] = () => [];
  ctx.salvarJSONNoDrive = name => { writes.push(name); return true; };
  assert.throws(() => ctx.atualizarTodoOCache(), /PCP indisponivel/);
  assert.equal(writes.length, 10);
  ctx.getDadosPreProducao = () => [{ erro: 'Sem dados' }];
  assert.throws(() => ctx.atualizarCachePreProducao(), /Dados invalidos/);
  assert.equal(writes.length, 10);
});

function snapshotApp() {
  const { ctx } = app({});
  const writes = [], updates = [], properties = new Map();
  let copies = 0, releases = 0, ramWrites = 0;
  ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() { releases++; } }) };
  ctx.PropertiesService = { getUserProperties: () => ({
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => properties.set(key, value)
  }) };
  ctx.DriveApp = {
    getFileById(id) {
      assert.equal(id, 'test-id');
      return { getName: () => 'Original', makeCopy() { copies++; return { getId: () => 'snapshot-id' }; } };
    },
    getFolderById: () => ({ getFilesByName: () => ({ hasNext: () => false }),
      createFile: (name, text) => writes.push({ name, text }) })
  };
  ctx.MimeType = { PLAIN_TEXT: 'text/plain' };
  ctx.CacheService = { getScriptCache: () => ({ putAll() { ramWrites++; }, put() {} }) };
  ctx.Sheets.Spreadsheets.get = id => {
    assert.equal(id, 'snapshot-id');
    return { sheets: [{ properties: { sheetId: 42, title: 'PCP', sheetType: 'GRID',
      gridProperties: { rowCount: 100, columnCount: 135 } }, protectedRanges: [{ protectedRangeId: 8 }] }] };
  };
  ctx.Sheets.Spreadsheets.batchUpdate = (body, id) => { updates.push({ body, id }); };
  return { ctx, writes, updates, properties, copies: () => copies, releases: () => releases, ramWrites: () => ramWrites };
}

test('snapshot converte somente a copia e publica depois de preparar todos os JSONs', () => {
  const a = snapshotApp();
  a.ctx.atualizarTodoOCache = () => {
    const previousWrites = a.writes.length;
    const previousRamWrites = a.ramWrites();
    assert.equal(a.ctx.pgFonteSnapshot_, 'snapshot-id');
    a.ctx.salvarJSONNoDrive('cache_dashboard.json', [{ SKU: '001' }]);
    a.ctx.salvarNoCacheRAM('DADOS_DASHBOARD', '[]');
    a.ctx.salvarJSONNoDrive('cache_qualidade.json', [{ id: 1 }]);
    assert.equal(a.writes.length, previousWrites);
    assert.equal(a.ramWrites(), previousRamWrites);
  };
  const result = a.ctx.atualizarTodoOCachePorCopia();
  assert.equal(result.arquivos.length, 2);
  assert.equal(a.writes.length, 2);
  assert.equal(a.ramWrites(), 1);
  assert.equal(a.updates[0].id, 'snapshot-id');
  assert.equal(a.updates[0].body.requests[1].copyPaste.pasteType, 'PASTE_VALUES');
  assert.equal(a.releases(), 1);
  assert.equal(a.ctx.pgFonteSnapshot_, null);
  a.ctx.atualizarTodoOCachePorCopia();
  assert.equal(a.copies(), 2, 'Uma atualizacao concluida deve ser seguida por uma copia nova');
});

test('erro de importacao impede publicacao e libera trava; nova tentativa reutiliza copia', () => {
  const a = snapshotApp();
  a.ctx.atualizarTodoOCache = () => {
    a.ctx.salvarJSONNoDrive('cache_dashboard.json', [{ SKU: '001' }]);
    a.ctx.pgValidarBlocoSnapshot_([['#REF!']], 'qualidade', 1000);
  };
  assert.throws(() => a.ctx.atualizarTodoOCachePorCopia(), /qualidade!A1001/);
  assert.equal(a.writes.length, 0);
  assert.equal(a.ramWrites(), 0);
  assert.equal(a.releases(), 1);
  assert.equal(a.ctx.pgPreparacaoCache_, null);
  assert.throws(() => a.ctx.atualizarTodoOCachePorCopia(), /#REF!/);
  assert.equal(a.copies(), 1);
  assert.equal(a.updates.length, 1);
});

test('falha de permissao ao converter copia nao grava JSONs', () => {
  const a = snapshotApp();
  a.ctx.Sheets.Spreadsheets.batchUpdate = () => { throw Error('Sem permissao'); };
  assert.throws(() => a.ctx.atualizarTodoOCachePorCopia(), /Sem permissao/);
  assert.equal(a.writes.length, 0);
  assert.equal(a.releases(), 1);
  assert.equal(JSON.parse([...a.properties.values()][0]).valores, false);
});

test('PCP vem do arquivo separado, com texto convertido em numero e data', () => {
  const externo = '1M0NOlNfABSI7BByc7fG8VEF6xDG9Joh5FVJa8IwOO1c';
  const { ctx, calls } = app({ PCP: [['data', 'tiragem', 'sku'], ['18/05/2026', '1.234', '00123']] });
  const rows = ctx.pgLerAbaCache_('PCP');
  assert.equal(rows[1][0].getTime(), new Date('2026-05-18T00:00:00-03:00').getTime());
  assert.equal(rows[1][1], 1234);
  assert.equal(rows[1][2], '00123', 'codigo com zero a esquerda continua texto');
  // Todas as chamadas de dados apontam para o arquivo separado.
  assert(calls.some(c => c.id === externo), 'deve usar o id do arquivo separado');
  assert(calls.filter(c => c.range || c.ranges).every(c => c.id === externo));
});

test('durante o snapshot por copia o PCP volta a sair da copia', () => {
  const { ctx, calls } = app({ PCP: [['a'], ['1']] });
  ctx.pgFonteSnapshot_ = 'copia-id';
  ctx.pgMetadadosCache_ = null;
  ctx.pgLerAbaCache_('PCP');
  assert(calls.every(c => c.id !== '1M0NOlNfABSI7BByc7fG8VEF6xDG9Joh5FVJa8IwOO1c'));
});

test('#REF! no arquivo separado vira vazio e nao derruba o cache', () => {
  const { ctx } = app({ PCP: [['a', 'b'], ['#REF!', '10']] });
  const rows = ctx.pgLerAbaCache_('PCP');
  assert.equal(rows[1][0], '');
  assert.equal(rows[1][1], 10);
});

test('data como serial no arquivo separado tambem vira Date', () => {
  const { ctx } = app({ PCP: [['plan', 'tiragem'], [46000, 500]] }, { '1:0': 'DATE' });
  const rows = ctx.pgLerAbaCache_('PCP');
  assert.equal(typeof rows[1][0].toISOString, 'function', 'serial com formato DATE deve virar Date');
  assert.equal(rows[1][1], 500);
});

test('arquivo separado mistura data em texto e data em serial', () => {
  const { ctx } = app({ PCP: [['a', 'b'], ['18/05/2026', 46000]] }, { '1:1': 'DATE_TIME' });
  const rows = ctx.pgLerAbaCache_('PCP');
  assert.equal(rows[1][0].getTime(), new Date('2026-05-18T00:00:00-03:00').getTime());
  assert.equal(typeof rows[1][1].toISOString, 'function');
});

test('coluna de prazo vazia nas primeiras linhas ainda vira data', () => {
  // Reproduz o arquivo separado: as primeiras linhas sao rasas e a coluna de
  // prazo so aparece bem depois. Amostrar o inicio da aba deixava passar.
  const rows = [['chave', 'tiragem', 'prazo']];
  for (let i = 0; i < 40; i++) rows.push(['FORMA CERTA', 0]);
  rows.push(['ACABADORA', 500, 46000]);
  const { ctx } = app({ PCP: rows }, { '41:2': 'DATE' });
  const data = ctx.pgLerAbaCache_('PCP');
  assert.equal(typeof data[41][2].toISOString, 'function', 'prazo da linha 42 deve virar Date');
  assert.equal(data[41][1], 500);
});

test('as abas copiadas saem todas do arquivo separado', () => {
  const externo = '1M0NOlNfABSI7BByc7fG8VEF6xDG9Joh5FVJa8IwOO1c';
  ['PCP', 'PCP_ACABADORAS', 'Base_Cockpit_Status', 'Base_OTIF', 'Internalização', 'MAPA DE SAÍDA']
    .forEach(aba => assert.equal(ctxFontes()[aba], externo, aba));
});

function ctxFontes() {
  const { ctx } = app({ PCP: [['a']] });
  return ctx.PG_FONTES_EXTERNAS;
}
