const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ARQUIVO_PCPS = '1M0NOlNfABSI7BByc7fG8VEF6xDG9Joh5FVJa8IwOO1c';

function bases() {
  const pcp = Array.from({ length: 135 }, (_, i) => 'PCP_' + i);
  pcp[16] = 'Chave';
  pcp[17] = 'TIRAGEM';
  pcp[134] = 'REFERÊNCIA';
  const dadosPcp = pcp.map(() => '');
  dadosPcp[16] = 'PCP-001';
  dadosPcp[17] = 100;
  const acab = Array.from({ length: 78 }, (_, i) => 'ACAB_' + i);
  acab[0] = 'Chave';
  acab[43] = 'TIRAGEM';
  acab[77] = 'REFERÊNCIA';
  const dadosAcab = acab.map(() => '');
  dadosAcab[0] = 'ACAB-001';
  dadosAcab[43] = 50;
  return { PCP: [pcp, dadosPcp], PCP_ACABADORAS: [acab, dadosAcab] };
}

function portal() {
  const leituras = [], escritas = [], chamadas = [];
  const original = bases(), externa = bases();
  let copia;
  let liberacoes = 0;
  const arquivos = new Map([
    ['cache_dashboard_indice.json', 'INDICE ANTERIOR'],
    ['cache_dashboard_mes_sem-data.json', 'BASE ANTERIOR'],
    ['cache_dashboard_mes_2025-01.json', 'FATIA ANTIGA']
  ]);
  const ram = new Map([['DADOS_DASHBOARD_metadata', '1'], ['DADOS_DASHBOARD_chunk_0', 'CACHE ANTERIOR']]);
  const propriedades = new Map();
  const origem = id => id === ARQUIVO_PCPS ? externa : id === 'snapshot-id' ? copia : original;
  const arquivo = nome => ({
    getName: () => nome,
    setContent: conteudo => { escritas.push('Drive.setContent'); arquivos.set(nome, conteudo); },
    setName: () => {},
    setTrashed: () => { escritas.push('Drive.setTrashed'); arquivos.delete(nome); }
  });
  const iterador = lista => ({ hasNext: () => lista.length > 0, next: () => lista.shift() });
  const pasta = {
    getFilesByName: nome => iterador(arquivos.has(nome) ? [arquivo(nome)] : []),
    getFiles: () => iterador([...arquivos.keys()].map(arquivo)),
    createFile: blob => {
      escritas.push('Drive.createFile');
      arquivos.set(blob.nome, blob.texto);
      return arquivo(blob.nome);
    }
  };
  const ctx = vm.createContext({
    console: { log() {}, error() {}, warn() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => 'portal-id' }) },
    Sheets: { Spreadsheets: {
      get(id, opcoes) {
        chamadas.push({ id, opcoes });
        if (opcoes.ranges) return { sheets: [{ data: [] }] };
        return { properties: { timeZone: 'America/Sao_Paulo' }, sheets:
          Object.entries(origem(id)).map(([title, dados], i) => ({ properties: {
            title, sheetId: i + 1, sheetType: 'GRID', gridProperties: {
              rowCount: dados.length, columnCount: dados[0].length
            }
          } })) };
      },
      Values: { get(id, intervalo) {
        const partes = intervalo.match(/^'([^']+)'!A(\d+):([A-Z]+)(\d+)$/);
        assert.ok(partes, intervalo);
        const [, nome, primeira, , ultima] = partes;
        leituras.push({ id, nome, primeira: Number(primeira), ultima: Number(ultima) });
        const valores = origem(id)[nome].slice(Number(primeira) - 1, Number(ultima));
        const resposta = JSON.parse(JSON.stringify(valores));
        if (ctx.refNoPrimeiroLote && Number(ultima) > 1 && nome === 'PCP_ACABADORAS') {
          resposta[0][77] = '#REF!';
        }
        return { values: resposta };
      } },
      batchUpdate: () => escritas.push('Sheets.batchUpdate')
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => liberacoes++ }) },
    PropertiesService: { getUserProperties: () => ({
      getProperty: chave => propriedades.get(chave) || null,
      setProperty: (chave, valor) => { escritas.push('Properties.setProperty'); propriedades.set(chave, valor); }
    }) },
    CacheService: { getScriptCache: () => ({
      get: chave => ram.get(chave) || null,
      getAll: chaves => Object.fromEntries(chaves.filter(chave => ram.has(chave)).map(chave => [chave, ram.get(chave)])),
      putAll: valores => { escritas.push('Cache.putAll'); Object.entries(valores).forEach(([chave, valor]) => ram.set(chave, valor)); },
      put: (chave, valor) => { escritas.push('Cache.put'); ram.set(chave, valor); },
      remove: chave => { escritas.push('Cache.remove'); ram.delete(chave); }
    }) },
    DriveApp: {
      getFolderById: () => pasta,
      getFileById: () => ({ getName: () => 'Portal', makeCopy: () => {
        escritas.push('Drive.makeCopy');
        copia = JSON.parse(JSON.stringify(original));
        return { getId: () => 'snapshot-id' };
      } })
    },
    Utilities: { newBlob: (texto, tipo, nome) => ({ texto, tipo, nome, getBytes: () => Buffer.from(texto) }) }
  });
  for (const nome of ['LeituraCacheSheets.js', 'Code.js', 'SalvaJson.js', 'CachePorCopia.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', nome), 'utf8'), ctx);
  }
  // As demais rotinas nao fazem parte desta trava; preservamos o fluxo real de publicacao.
  for (const nome of ['getDadosCockpit', 'getDadosPreProducao', 'getDadosQualidade',
    'getDadosPPM', 'getDadosInspecaoCDs', 'getDadosAlocacao', 'getDadosChamados',
    'getDadosCaixas', 'getDadosMapaSaida', 'buscarHistoricoObsGiro']) ctx[nome] = () => [];
  return { ctx, original, externa, arquivos, ram, propriedades, leituras, escritas, chamadas,
    liberacoes: () => liberacoes };
}

const entradas = ['atualizarCacheDashboard', 'TRIGGER_AtualizarCache',
  'atualizarTodoOCache', 'atualizarTodoOCachePorCopia'];

for (const entrada of entradas) {
  for (const nome of ['PCP', 'PCP_ACABADORAS']) {
    for (const posicao of ['A', 'ultima']) {
      test(`${entrada}: REF no cabecalho ${nome} (${posicao}) encerra antes de qualquer alteracao`, () => {
        const p = portal();
        const fonte = entrada === 'atualizarTodoOCachePorCopia' ? p.original : p.externa;
        const indice = posicao === 'A' ? 0 : fonte[nome][0].length - 1;
        fonte[nome][0][indice] = posicao === 'A' ? '#REF!' : ' ref ';
        const arquivosAntes = [...p.arquivos];
        const ramAntes = [...p.ram];
        let resultado;
        assert.doesNotThrow(() => { resultado = p.ctx[entrada](); });
        assert.equal(resultado.atualizado, false);
        assert.equal(resultado.motivo, 'REF_NO_CABECALHO');
        assert.equal(resultado.origem, nome);
        assert.deepEqual(p.escritas, [], 'Nao pode alterar Properties, Cache, Drive ou Sheets');
        assert.deepEqual([...p.arquivos], arquivosAntes);
        assert.deepEqual([...p.ram], ramAntes);
        assert.equal(p.propriedades.size, 0);
        assert.ok(p.leituras.length > 0);
        assert.ok(p.leituras.every(leitura => leitura.primeira === 1 && leitura.ultima === 1),
          'A verificacao deve ler apenas a primeira linha, sem dados ou amostras');
        assert.equal(p.liberacoes(), entrada === 'atualizarTodoOCachePorCopia' ? 1 : 0);
        const idEsperado = entrada === 'atualizarTodoOCachePorCopia' ? 'portal-id' : ARQUIVO_PCPS;
        assert.ok(p.leituras.every(leitura => leitura.id === idEsperado), 'Verifica a fonte real da rota');
      });
    }
  }
}

test('REF/#REF! aceita caixa e espacos, mas REFERÊNCIA e valores contendo REF sao cabecalhos validos', () => {
  for (const valor of ['#ref!', ' ReF ', 'REF!', '#REF']) {
    const p = portal();
    p.externa.PCP[0][134] = valor;
    assert.equal(p.ctx.atualizarCacheDashboard().motivo, 'REF_NO_CABECALHO');
    assert.deepEqual(p.escritas, []);
  }
  for (const valor of ['REFERÊNCIA', 'REFORÇO', 'Código REF', 'REF DA ORIGEM']) {
    const p = portal();
    p.externa.PCP[0][134] = valor;
    assert.equal(p.ctx.atualizarCacheDashboard().registros, 2);
    assert.ok(p.escritas.includes('Drive.setContent'));
  }
});

for (const entrada of entradas) {
  test(`${entrada}: proximo gatilho tenta normalmente depois de corrigir o cabecalho`, () => {
    const p = portal();
    const fonte = entrada === 'atualizarTodoOCachePorCopia' ? p.original : p.externa;
    fonte.PCP_ACABADORAS[0][77] = '#REF!';
    assert.equal(p.ctx[entrada]().motivo, 'REF_NO_CABECALHO');
    assert.deepEqual(p.escritas, []);
    fonte.PCP_ACABADORAS[0][77] = 'REFERÊNCIA';
    assert.doesNotThrow(() => p.ctx[entrada]());
    assert.ok(p.escritas.length > 0);
    if (entrada !== 'TRIGGER_AtualizarCache') {
      const fatia = JSON.parse(p.arquivos.get('cache_dashboard_mes_sem-data.json'));
      assert.equal(fatia.length, 2);
      assert.deepEqual(fatia.map(item => item._SOURCE), ['PCP', 'ACABADORA']);
    }
  });
}

test('REF nas linhas de dados nao aciona a nova trava de cabecalho', () => {
  const p = portal();
  p.externa.PCP[1][134] = '#REF!';
  p.externa.PCP_ACABADORAS[1][77] = 'REF';
  const resultado = p.ctx.atualizarCacheDashboard();
  assert.equal(resultado.registros, 2);
  const fatia = JSON.parse(p.arquivos.get('cache_dashboard_mes_sem-data.json'));
  assert.equal(fatia[0]['REFERÊNCIA'], undefined, 'Mantem a normalizacao original de erros em dados');
  assert.equal(fatia[1]['REFERÊNCIA'], 'REF');
});

test('REF surgido entre a consulta do cabecalho e o primeiro lote preserva o cache anterior', () => {
  const p = portal();
  p.ctx.refNoPrimeiroLote = true;
  const arquivosAntes = [...p.arquivos], ramAntes = [...p.ram];
  assert.equal(p.ctx.atualizarTodoOCache().motivo, 'REF_NO_CABECALHO');
  assert.deepEqual(p.escritas, []);
  assert.deepEqual([...p.arquivos], arquivosAntes);
  assert.deepEqual([...p.ram], ramAntes);
});

test('Leitura inesperadamente indisponivel mantem seu erro normal e nao publica dashboard', () => {
  const p = portal();
  p.ctx.Sheets.Spreadsheets.Values.get = () => { throw new Error('Sem permissao de leitura'); };
  assert.throws(() => p.ctx.atualizarCacheDashboard(), /Sem permissao de leitura/);
  assert.deepEqual(p.escritas, []);
});
