const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'Main.html'), 'utf8');
const inicio = source.indexOf("        const PG_DASH_LS_PREFIXO =");
const fim = source.indexOf('        // PG_LOADING_TODOS_MESES_V1', inicio);
assert.ok(inicio >= 0 && fim > inicio);

function portal(responder, salvo = {}) {
  const armazenamento = { ...salvo };
  const localStorage = new Proxy({}, {
    ownKeys: () => Reflect.ownKeys(armazenamento),
    getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
    get(_, nome) {
      if (nome === 'getItem') return chave => armazenamento[chave] ?? null;
      if (nome === 'setItem') return (chave, valor) => { armazenamento[chave] = String(valor); };
      if (nome === 'removeItem') return chave => { delete armazenamento[chave]; };
    }
  });
  const chamadas = [];
  function runner(sucesso, falha) {
    return new Proxy({}, { get(_, nome) {
      if (nome === 'withSuccessHandler') return fn => runner(fn, falha);
      if (nome === 'withFailureHandler') return fn => runner(sucesso, fn);
      return (...args) => {
        chamadas.push({ nome, args });
        Promise.resolve().then(() => responder(nome, ...args)).then(sucesso, falha);
      };
    } });
  }
  const contexto = vm.createContext({
    window: {}, localStorage, google: { script: { run: runner() } },
    console: { info() {}, warn() {} },
    setTimeout(fn) { queueMicrotask(fn); }
  });
  vm.runInContext(source.slice(inicio, fim), contexto);
  return { contexto, armazenamento, chamadas,
    carregar: () => contexto.carregarDashboardPorMes(),
    local: () => Array.from(contexto.pgLerDashboardLocal()) };
}

function mensal(meses, geradoEm = '2026-10-08T10:00:00.000Z') {
  const indice = { geradoEm, registros: Object.values(meses).reduce((total, linhas) => total + linhas.length, 0),
    meses: Object.entries(meses).map(([mes, linhas]) => ({ mes, registros: linhas.length })) };
  const textos = Object.fromEntries(Object.entries(meses).map(([mes, linhas]) => [mes, JSON.stringify(linhas)]));
  return { indice, textos, responder(nome, mes, inicio = 0) {
    if (nome === 'getDadosDashboardIndice') return JSON.stringify(indice);
    if (nome === 'getDadosDashboardMes') return textos[mes];
    if (nome === 'getDadosDashboardMesParte') {
      const texto = textos[mes];
      const json = texto.slice(inicio, inicio + 100);
      return { mes, inicio, totalCaracteres: texto.length, identidade: geradoEm,
        json, proximo: inicio + json.length < texto.length ? inicio + json.length : null };
    }
    throw new Error('RPC inesperado: ' + nome);
  } };
}

test('carrega todos os meses e preserva cada registro antes de liberar o dashboard', async () => {
  const dados = { '2026-11': [{ id: 'novembro', nome: 'Gráfica' }],
    '2026-10': Array.from({ length: 120 }, (_, id) => ({ id, texto: 'Dados de produção' })) };
  const servidor = mensal(dados);
  const p = portal(servidor.responder);
  const resultado = await p.carregar();
  assert.deepEqual(JSON.parse(JSON.stringify(resultado)), Object.values(dados).flat());
  assert.equal(p.contexto.window.PG_DASHBOARD_COMPLETO, true);
  assert.deepEqual(JSON.parse(JSON.stringify(p.local())), Object.values(dados).flat());
  assert.equal(p.chamadas.filter(c => c.nome === 'getDadosDashboardMes').length, 2);
  assert.equal(p.chamadas.filter(c => c.nome === 'getDadosDashboardMesParte').length, 0,
    'Meses que chegam completos devem manter o transporte direto');
});

test('erro permanente preserva a causa e impede liberar dashboard incompleto', async () => {
  const servidor = mensal({ '2026-11': [{ id: 'nov' }], '2026-10': [{ id: 'out' }] });
  const p = portal((nome, mes, ...args) => {
    if (mes === '2026-10') throw new Error('Permissão negada na leitura do cache');
    return servidor.responder(nome, mes, ...args);
  });
  await assert.rejects(p.carregar(), /2026-10[\s\S]*Permissão negada/);
  assert.equal(p.contexto.window.PG_DASHBOARD_COMPLETO, false);
  assert.deepEqual(p.local(), []);
});

test('falha de uma nova geração mantém a cópia local completa anterior', async () => {
  let servidor = mensal({ '2026-11': [{ id: 'nov-antigo' }], '2026-10': [{ id: 'out-antigo' }] }, 'antiga');
  let falhar = false;
  const p = portal((nome, mes, ...args) => {
    if (falhar && mes === '2026-10') throw new Error('Cache indisponível');
    return servidor.responder(nome, mes, ...args);
  });
  await p.carregar();
  servidor = mensal({ '2026-11': [{ id: 'nov-novo' }], '2026-10': [{ id: 'out-novo' }] }, 'nova');
  falhar = true;
  await assert.rejects(p.carregar());
  assert.deepEqual(JSON.parse(JSON.stringify(p.local())), [{ id: 'nov-antigo' }, { id: 'out-antigo' }]);
});

test('repete resposta invalida e falha transitória sem duplicar registros', async () => {
  const servidor = mensal({ '2026-10': Array.from({ length: 20 }, (_, id) => ({ id })) });
  let tentativasIndice = 0, tentativasParte = 0;
  const p = portal((nome, ...args) => {
    if (nome === 'getDadosDashboardIndice' && tentativasIndice++ === 0) return '{';
    if (nome === 'getDadosDashboardMes') throw new Error('Falha no transporte mensal');
    if (nome === 'getDadosDashboardMesParte' && args[1] === 100 && tentativasParte++ === 0) {
      throw new Error('Servidor temporariamente indisponível');
    }
    return servidor.responder(nome, ...args);
  });
  const resultado = await p.carregar();
  assert.equal(resultado.length, 20);
  assert.equal(new Set(resultado.map(l => l.id)).size, 20);
  assert.equal(p.chamadas.filter(c => c.nome === 'getDadosDashboardIndice').length, 2);
  assert.equal(p.chamadas.filter(c => c.nome === 'getDadosDashboardMesParte' && c.args[1] === 100).length, 2);
});

test('quantidade incompleta não substitui índice local nem libera a tela', async () => {
  const servidor = mensal({ '2026-10': [{ id: 'outubro' }] });
  servidor.indice.meses[0].registros = 2;
  servidor.indice.registros = 2;
  const p = portal(servidor.responder);
  await assert.rejects(p.carregar(), /Quantidade de registros diferente do indice/);
  assert.equal(p.contexto.window.PG_DASHBOARD_COMPLETO, false);
  assert.equal(p.armazenamento.PG_DASH_INDICE, undefined);
});

function backend(textos) {
  const cache = new Map();
  let leiturasDrive = 0;
  const contexto = vm.createContext({
    Logger: { log() {} }, console: { log() {}, warn() {}, error() {} },
    CacheService: { getScriptCache: () => ({
      get: chave => cache.get(chave) ?? null,
      getAll: chaves => Object.fromEntries(chaves.filter(chave => cache.has(chave)).map(chave => [chave, cache.get(chave)])),
      put: (chave, valor) => cache.set(chave, valor),
      putAll: valores => Object.entries(valores).forEach(([chave, valor]) => cache.set(chave, valor))
    }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algoritmo, texto) => Array.from(crypto.createHash(algoritmo).update(texto, 'utf8').digest()) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'SalvaJson.js'), 'utf8'), contexto);
  contexto.lerJSONDoDrive = nome => {
    leiturasDrive++;
    return textos[nome.replace(/^cache_dashboard_mes_/, '').replace(/\.json$/, '')];
  };
  return { contexto, cache, get leiturasDrive() { return leiturasDrive; } };
}

test('22 MB atravessam Main e backend em partes limitadas, preservando todos os campos e registros', async () => {
  const linhas = Array.from({ length: 4364 }, (_, id) => ({ id, detalhe: 'Produção gráfica '.repeat(320) }));
  const servidor = mensal({ '2026-10': linhas });
  const b = backend(servidor.textos);
  const tamanhos = [];
  const p = portal((nome, ...args) => {
    if (nome === 'getDadosDashboardIndice') return servidor.responder(nome, ...args);
    if (nome === 'getDadosDashboardMes') throw new Error('Falha no transporte de resposta grande');
    const parte = b.contexto.getDadosDashboardMesParte(...args);
    tamanhos.push(parte.json.length);
    return parte;
  });
  const resultado = await p.carregar();
  assert.ok(servidor.textos['2026-10'].length > 22000000);
  assert.ok(tamanhos.length > 40);
  assert.ok(tamanhos.every(tamanho => tamanho > 0 && tamanho <= 500000));
  assert.equal(b.leiturasDrive, 1, 'Os demais trechos devem reutilizar os chunks mensais');
  assert.deepEqual(JSON.parse(JSON.stringify(resultado)), linhas);
  assert.equal(p.contexto.window.PG_DASHBOARD_COMPLETO, true);
});

test('controlador pinta processamento e só libera overlay depois de iniciar o painel com dados completos', async () => {
  const servidor = mensal({ '2026-11': [{ id: 'novembro' }], '2026-10': [{ id: 'outubro' }] });
  const p = portal((nome, ...args) => {
    if (nome.startsWith('getDadosDashboard')) return servidor.responder(nome, ...args);
    if (nome === 'getEmailUsuario') return 'usuario@exemplo.com';
    return {};
  });
  const classes = new Set();
  const elementos = {
    globalLoading: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    loadingBar: { style: {} }, loadingMsg: { textContent: '' }, userEmail: { textContent: '' }
  };
  const frames = [];
  let inicializacoes = 0;
  Object.assign(p.contexto, {
    document: { getElementById: id => elementos[id] || null, querySelectorAll: () => [] },
    performance: { now: () => 1000 }, setInterval: () => 1, clearInterval() {},
    showToast() {}, atualizarRodapeDatas() {}, formatarNum: n => String(n),
    iniciarDashboard(dados) {
      inicializacoes++;
      assert.equal(classes.has('hidden'), false);
      assert.match(elementos.loadingMsg.textContent, /Dados completos\. Preparando o painel/);
      assert.deepEqual(JSON.parse(JSON.stringify(dados)), [{ id: 'novembro' }, { id: 'outubro' }]);
    }
  });
  p.contexto.console.error = () => {};
  p.contexto.window.requestAnimationFrame = callback => frames.push(callback);
  const start = source.indexOf('        async function carregarSistema()');
  const end = source.indexOf('        function navegarView(', start);
  vm.runInContext(source.slice(start, end), p.contexto);
  const carregamento = p.contexto.carregarSistema();
  await new Promise(setImmediate);
  assert.equal(p.contexto.window.PG_DASHBOARD_COMPLETO, true);
  assert.equal(inicializacoes, 0);
  assert.equal(classes.has('hidden'), false);
  assert.match(elementos.loadingMsg.textContent, /Preparando o painel/);
  assert.equal(frames.length, 1);
  frames.shift()();
  await new Promise(setImmediate);
  assert.equal(inicializacoes, 0);
  frames.shift()();
  await carregamento;
  assert.equal(inicializacoes, 1);
  assert.equal(classes.has('hidden'), true);
  assert.equal(p.contexto.window.pgCarregamentoInicial, false);
});

test('evicção de chunk recupera a mesma fatia sem perder trecho', () => {
  const texto = JSON.stringify([{ detalhe: 'x'.repeat(700000) }]);
  const b = backend({ '2026-10': texto });
  const primeira = b.contexto.getDadosDashboardMesParte('2026-10', 0, '');
  b.cache.delete('DADOS_DASHBOARD_2026-10_chunk_11');
  const segunda = b.contexto.getDadosDashboardMesParte('2026-10', primeira.proximo, primeira.identidade);
  assert.equal(primeira.json + segunda.json, texto);
  assert.equal(b.leiturasDrive, 2);
});

test('conteúdo trocado durante download rejeita partes de outra identidade', () => {
  const texto = JSON.stringify([{ detalhe: 'x'.repeat(700000) }]);
  const b = backend({ '2026-10': texto });
  const primeira = b.contexto.getDadosDashboardMesParte('2026-10', 0, '');
  b.contexto.salvarNoCacheRAM('DADOS_DASHBOARD_2026-10', texto.replace(/x/g, 'y'));
  assert.throws(() => b.contexto.getDadosDashboardMesParte('2026-10', primeira.proximo, primeira.identidade),
    /cache do mes mudou/);
});
