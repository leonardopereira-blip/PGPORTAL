const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const key = 'GRAFICA|MARCA|6 ANO|V1|RAIZES';
const keyWithOrdinal = 'Gráfica|Marca|6º ANO|V1|RAÍZES';
const empty = () => ({master:{}, sku:{}});
const event = (id, data, obs, extra = {}) => ({
  id, data, obs, user:'analista@exemplo.com', sequencia:0,
  contexto:{grafica:'GRAFICA', marca:'MARCA', serie:'6º ANO', cd:'RAÍZES'}, ...extra
});

function backend(initial = {}, sheetHistory = empty()) {
  const files = [], writes = [], sourceReads = [];
  let locked = false, onLock = null, sheetError = null, lockError = null;
  const iterator = values => {let i = 0; return {hasNext:() => i < values.length, next:() => values[i++]};};
  function file(name, text) {
    const f = {name, text, trashed:false,
      getName:() => f.name,
      getBlob:() => ({getDataAsString:() => f.text}),
      setContent(value) { writes.push({name:f.name, locked}); f.text = value; return f; },
      setName(value) { f.name = value; return f; },
      setTrashed(value) { f.trashed = value; return f; }
    };
    files.push(f); return f;
  }
  for (const [name, value] of Object.entries(initial)) {
    for (const item of (Array.isArray(value) ? value : [value])) {
      file(name, typeof item === 'string' ? item : JSON.stringify(item));
    }
  }
  const folder = {
    getFilesByName: name => iterator(files.filter(f => !f.trashed && f.name === name)),
    createFile(blob) {
      writes.push({name:blob.name, locked});
      return file(blob.name, blob.text);
    }
  };
  const c = {console:{log(){},warn(){},error(){}}, Logger:{log(){}},
    DriveApp:{getFolderById:() => folder},
    Utilities:{newBlob:(text, mime, name) => ({text, mime, name, getBytes:() => [...Buffer.from(text)]})},
    LockService:{getScriptLock:() => ({
      waitLock() { if (lockError) throw lockError; assert.equal(locked,false); locked = true; if (onLock) onLock(); },
      hasLock:() => locked,
      releaseLock() { assert.equal(locked,true); locked = false; }
    })}
  };
  vm.createContext(c);
  for (const name of ['Code.js', 'RegistroGiroJSON.js', 'SalvaJson.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),c);
  }
  c.pgBuscarHistoricoObsGiroPortal_ = () => {
    sourceReads.push({locked});
    if (sheetError) throw sheetError;
    return sheetHistory;
  };
  return {c,folder,files,writes,sourceReads,file,
    onLock:fn => onLock = fn,
    failSheets:message => sheetError = new Error(message),
    failLock:message => lockError = new Error(message),
    cache:() => JSON.parse(files.find(f => !f.trashed && f.name === 'cache_observacoes.json').text),
    locked:() => locked
  };
}

test('recuperação ordena pela data original e conserva nota de hoje, contexto e todas as fontes', () => {
  const a = backend();
  const recovered = event('recuperada-26', '26/10/2026 09:24:12', 'Previsão de coleta confirmada', {origem:'revisao-26', sequencia:9000});
  const today = event('nota-hoje', '28/10/2026 15:21:31', 'Reimpressão pronta, previsão de coleta 30/10', {sequencia:12});
  const old = event('antiga-17', '17/09/2026 08:00:00', 'Em produção');
  const sources = [{master:{[keyWithOrdinal]:[today]},sku:{}}, {master:{[key]:[recovered,old]},sku:{}}];
  const original = JSON.stringify(sources);
  const merged = a.c.pgGiroMesclarHistoricosObs_(sources);
  assert.deepEqual(Array.from(merged.master[key], r => r.id), ['nota-hoje','recuperada-26','antiga-17']);
  assert.equal(merged.master[key][1].data, '26/10/2026 09:24:12');
  assert.equal(merged.master[key][1].contexto.cd, 'RAÍZES');
  assert.equal(merged.master[key][1].origem, 'revisao-26');
  assert.equal(JSON.stringify(sources), original, 'consulta não altera os registros de origem');
});

test('mescla repetida é idempotente sem apagar intenções distintas com o mesmo texto', () => {
  const a = backend();
  const first = event('intencao-1','26/10/2026 10:00:00','Confirmado');
  const second = event('intencao-2','26/10/2026 10:00:00','Confirmado');
  const one = {master:{[key]:[first,second]},sku:{}};
  const merged = a.c.pgGiroMesclarHistoricosObs_([one,one]);
  const retry = a.c.pgGiroMesclarHistoricosObs_([merged,one]);
  assert.equal(retry.master[key].length, 2);
  assert.deepEqual(new Set(retry.master[key].map(r => r.id)), new Set(['intencao-1','intencao-2']));
});

test('mescla liga cópia sem ID ao evento persistido e mantém CD, envio, gráfica e SKU separados', () => {
  const a = backend();
  const original = event('', '26/10/2026 10:00:00', 'Nota recuperada');
  const persisted = {...original,id:'recuperacao-id-1'};
  const foreignKeys = ['GRAFICA|MARCA|6 ANO|V1|CD FOR', 'GRAFICA|MARCA|6 ANO|V2|RAIZES', 'OUTRA|MARCA|6 ANO|V1|RAIZES'];
  const first = {master:{[key]:[original]},sku:{'GRAFICA|MARCA|SKU1|100|V1|RAÍZES':[original]}};
  const second = {master:{[keyWithOrdinal]:[persisted]},sku:{'GRAFICA|MARCA|SKU1|V1|RAIZES':[persisted]}};
  for (const k of foreignKeys) second.master[k] = [persisted];
  const merged = a.c.pgGiroMesclarHistoricosObs_([first,second]);
  assert.equal(merged.master[key].length,1);
  assert.equal(merged.sku['GRAFICA|MARCA|SKU1|V1|RAIZES'].length,1);
  assert.equal(Object.keys(merged.master).length,4);
  for (const k of foreignKeys) assert.equal(merged.master[k].length,1);
});

test('leitor estrito reúne todos os arquivos homônimos sem descartar o histórico de outra origem', () => {
  const old = {master:{[key]:[event('setembro','17/09/2026 10:00:00','Nota setembro')]},sku:{}};
  const recent = {master:{[key]:[event('outubro','26/10/2026 10:00:00','Nota outubro')]},sku:{}};
  const a = backend({'cache_observacoes.json':[old,recent]});
  const original = a.files.map(f => f.text);
  const result = a.c.pgGiroLerCacheObsSeguro_(a.folder);
  assert.equal(result.existe,true);
  assert.deepEqual(Array.from(result.historico.master[key],r => r.id),['outubro','setembro']);
  assert.deepEqual(a.files.map(f => f.text),original);
  assert.equal(a.writes.length,0);
});

test('cache ausente é distinto de arquivo existente corrompido ou com estrutura inválida', () => {
  const missing = backend();
  assert.equal(missing.c.pgGiroLerCacheObsSeguro_(missing.folder).existe,false);
  for (const text of ['{corrompido','[]','{}','{"master":[],"sku":{}}','{"master":{"CHAVE":{}},"sku":{}}']) {
    const a = backend({'cache_observacoes.json':text});
    assert.throws(() => a.c.pgGiroLerCacheObsSeguro_(a.folder),undefined,text);
    assert.equal(a.files[0].text,text);
    assert.equal(a.writes.length,0);
  }
});

test('regravação do cache relê a fonte sob lock e preserva nota concorrente junto da recuperação', () => {
  const recovered = event('revisao-26','26/10/2026 10:00:00','Recuperada');
  const old = event('antiga','17/09/2026 10:00:00','Antiga');
  const today = event('hoje','28/10/2026 15:21:31','Lançada pelo time durante a atualização');
  const sheet = empty();
  const a = backend({'cache_observacoes.json':{master:{[key]:[old]},sku:{}}},sheet);
  a.onLock(() => { sheet.master[key] = [today]; });
  a.c.pgGravarArquivoDrive_(a.folder,'cache_observacoes.json',JSON.stringify({master:{[key]:[recovered]},sku:{}}));
  assert.deepEqual(Array.from(a.cache().master[key],r => r.id),['hoje','revisao-26','antiga']);
  assert(a.sourceReads.some(r => r.locked),'a fonte viva precisa ser relida depois de adquirir lock');
  assert(a.writes.every(r => r.locked),'o cache só é escrito enquanto o lock está ativo');
  assert.equal(a.locked(),false);
});

test('falha de uma fonte ou do lock impede publicação parcial e conserva o cache anterior', () => {
  const original = {master:{[key]:[event('preservada','28/10/2026 15:21:31','Preservada')]},sku:{}};
  for (const fault of ['sheets','lock','cache']) {
    const a = backend({'cache_observacoes.json':fault === 'cache' ? '{corrompido' : original});
    const before = a.files[0].text;
    if (fault === 'sheets') a.failSheets('PCPs temporariamente indisponível');
    if (fault === 'lock') a.failLock('Outra atualização em andamento');
    assert.throws(() => a.c.pgGravarArquivoDrive_(a.folder,'cache_observacoes.json',JSON.stringify(empty())));
    assert.equal(a.files[0].text,before,fault);
    assert.equal(a.writes.length,0,fault);
    assert.equal(a.locked(),false,fault);
  }
});

test('payload leve devolve recuperadas e atuais sem escrever nas fontes', () => {
  const sheet = {master:{[key]:[event('hoje','28/10/2026 15:21:31','Atual')]},sku:{}};
  const cache = {master:{[keyWithOrdinal]:[event('recuperada','26/10/2026 10:00:00','Recuperada')]},sku:{}};
  const a = backend({'cache_observacoes.json':cache},sheet);
  const result = a.c.buscarHistoricoObsGiroLeve();
  assert.equal(result.success,true);
  assert.deepEqual(Array.from(result.historico.master[key],r => r.id),['hoje','recuperada']);
  assert.equal(result.historico.master[key][1].data,'26/10/2026 10:00:00');
  assert.equal(result.historico.master[key][1].contexto,undefined);
  assert.equal(a.writes.length,0);
});

test('snapshot preparado incorpora nota acrescentada só no Drive antes da publicação', () => {
  const old = event('antiga','17/09/2026 10:00:00','Antiga');
  const recovered = event('recuperada','26/10/2026 10:00:00','Recuperada');
  const concurrent = event('concorrente','28/10/2026 15:21:31','Salva após preparar snapshot');
  const a = backend({'cache_observacoes.json':{master:{[key]:[old]},sku:{}}});
  a.c.pgPreparacaoCache_ = {};
  assert.equal(a.c.salvarJSONNoDrive('cache_observacoes.json',{master:{[key]:[recovered]},sku:{}}),true);
  assert.equal(a.writes.length,0,'preparação deve apenas guardar o snapshot em memória');
  const snapshot = a.c.pgPreparacaoCache_['cache_observacoes.json'];
  a.c.pgPreparacaoCache_ = null;
  a.onLock(() => {
    a.files[0].text = JSON.stringify({master:{[key]:[concurrent,old]},sku:{}});
  });
  a.c.pgGravarArquivoDrive_(a.folder,'cache_observacoes.json',snapshot);
  assert.deepEqual(Array.from(a.cache().master[key],r => r.id),['concorrente','recuperada','antiga']);
});

test('rotas de atualização individual e completa conservam notas exclusivas do Drive e abortam cache inválido', () => {
  for (const route of ['atualizarCacheObservacoes','atualizarTodoOCache']) {
    for (const corrupt of [false,true]) {
      const drive = {master:{[key]:[event('recuperada','26/10/2026 10:00:00','Apenas no Drive')]},sku:{}};
      const sheet = {master:{[key]:[event('hoje','28/10/2026 15:21:31','Nota de hoje')]},sku:{}};
      const a = backend({'cache_observacoes.json':corrupt ? '{corrompido' : drive},sheet);
      const original = a.files[0].text;
      a.c.atualizarCacheDashboard = () => ({});
      for (const loader of ['getDadosCockpit','getDadosQualidade','getDadosPPM','getDadosInspecaoCDs',
        'getDadosAlocacao','getDadosChamados','getDadosCaixas','getDadosMapaSaida']) a.c[loader] = () => [];
      const save = a.c.salvarJSONNoDrive;
      a.c.salvarJSONNoDrive = (name,data) => name === 'cache_observacoes.json' ? save(name,data) : true;
      if (corrupt) {
        assert.throws(() => a.c[route](),undefined,route);
        assert.equal(a.files[0].text,original);
        assert.equal(a.writes.length,0);
      } else {
        a.c[route]();
        assert.deepEqual(Array.from(a.cache().master[key],r => r.id),['hoje','recuperada'],route);
        assert(a.writes.every(r => r.locked));
      }
    }
  }
});
