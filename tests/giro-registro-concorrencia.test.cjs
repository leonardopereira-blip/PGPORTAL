const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname,'..');

function portal() {
  const abas = new Map(), props = new Map(), cache = new Map();
  let leituras=0, aberturas=0, bloqueado=false, onAppend, locks=0, releases=0;
  let agora=Date.parse('2026-10-27T15:00:00Z'), falhar=false;
  class Relogio extends Date { constructor(...args){super(...(args.length?args:[agora]));} }
  function sheet(nome, rows=[]) {
    const tab={nome,rows,getLastRow:()=>rows.length,setFrozenRows(){},
      appendRow(row){if(falhar)throw Error('Sem acesso para gravar');if(onAppend){const f=onAppend;onAppend=null;f();}
        rows.push(row.map(x=>typeof x==='string' && x[0]==="'"?x.slice(1):x));return tab;},
      getRange(row,col,nr=1,nc=1){
        const range={getRow:()=>row,
          getValues(){leituras++;return Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>rows[row+r-1]?.[col+c-1]??''));},
          setValues(values){if(falhar)throw Error('Sem acesso para gravar');values.forEach((r,i)=>{
            while(rows.length<row+i)rows.push([]);r.forEach((v,j)=>rows[row+i-1][col+j-1]=v);
          });return range;},
          createTextFinder(texto){return {matchEntireCell(){return this;},findNext(){
            for(let r=row;r<row+nr;r++)if(String(rows[r-1]?.[col-1]??'')===texto)return {getRow:()=>r};return null;
          }};},
          setFontWeight:()=>range,setBackground:()=>range,setFontColor:()=>range};
        return range;
      }};
    abas.set(nome,tab);return tab;
  }
  const ss={getSheetByName:n=>abas.get(n)||null,insertSheet:n=>sheet(n)};
  const c={Date:Relogio,console,PG_ARQUIVO_PCPS:'pcps',
    SpreadsheetApp:{openById(id){assert.equal(id,'pcps');aberturas++;return ss;},flush(){},
      getActiveSpreadsheet(){throw Error('Não deve gravar em outra base');}},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
    LockService:{getScriptLock(){let adquirido=false;return {
      waitLock(){if(bloqueado)throw Error('Outra gravação em andamento');bloqueado=true;adquirido=true;locks++;},
      releaseLock(){assert(adquirido);assert(bloqueado);bloqueado=false;adquirido=false;releases++;},hasLock:()=>adquirido};}},
    Session:{getActiveUser:()=>({getEmail:()=> 'analista@empresa.com'})},
    Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:(d,z,p)=>{
      const iso=new Date(d).toISOString();return p==='yyyy-MM-dd'?iso.slice(0,10):'27/10/2026 12:00:00';}}};
  vm.createContext(c);
  // As duas ordens de carregamento dos nomes antigos devem delegar ao mesmo backend.
  for(const f of ['Code.js','RegistroGiroJSON.js','EntregasCDPrevisoes.js','Código.js'])
    vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);
  return {c,abas,sheet,setOnAppend:fn=>onAppend=fn,setFail:v=>falhar=v,
    avancar:ms=>agora+=ms,leituras:()=>leituras,aberturas:()=>aberturas,locks:()=>locks,releases:()=>releases};
}
const save=(a,text='Nota A',id='evento-0001',tipo='SKU',key='GRAFICA|MARCA|SKU|V1|CD FOR')=>
  a.c.salvarObsGiroPortal(tipo,key,text,'{"tiragem":100}',id);
const chave=sku=>JSON.stringify(['ECD1','PCP','MARCA','GRAFICA',sku,'CD FOR','V1','','','']);

test('observações concorrentes são serializadas e retry não apaga nem duplica histórico',()=>{
  const a=portal();let concorrente;
  a.setOnAppend(()=>{concorrente=save(a,'Nota B','evento-0002');});
  // O concorrente tenta gravar enquanto o primeiro usuário ainda segura o lock.
  const primeiro=save(a);assert(primeiro.success);assert.equal(concorrente.success,false);
  assert.match(concorrente.error,/em andamento/);assert.equal(a.locks(),1);assert.equal(a.releases(),1);
  assert(save(a,'Nota B','evento-0002').success);
  const retry=save(a);assert(retry.success);assert(retry.duplicate);
  assert.equal(a.abas.get('Obs_Cockpit_sku').rows.length,3,'cabeçalho e dois eventos');
  const hist=a.c.buscarHistoricoObsGiro().sku['GRAFICA|MARCA|SKU|V1|CD FOR'];
  assert.deepEqual(Array.from(hist,h=>h.obs),['Nota B','Nota A']);
  assert.equal(new Set(hist.map(h=>h.id)).size,2);
});

test('a mesma nota com outra intenção é preservada e reuso do ID com outro texto falha',()=>{
  const a=portal();assert(save(a).success);assert(save(a,'Nota A','evento-0002').success);
  const invalido=save(a,'Outro texto');assert.equal(invalido.success,false);assert.match(invalido.error,/já foi usado/);
  assert.equal(a.c.buscarHistoricoObsGiro().sku['GRAFICA|MARCA|SKU|V1|CD FOR'].length,2);
});

test('sequência física desempata notas do mesmo segundo e retry mantém a posição original',()=>{
  const a=portal();const primeira=save(a,'Nota A','evento-0001');
  const inicial=a.c.buscarAtualizacoesGiroPortal();
  const segunda=save(a,'Nota B','evento-0002');
  assert.equal(primeira.data,segunda.data,'dois autores podem confirmar no mesmo segundo');
  assert.equal(primeira.sequencia,2);assert.equal(segunda.sequencia,3);
  const retry=save(a,'Nota A','evento-0001');assert.equal(retry.sequencia,2);assert(retry.duplicate);
  const historico=a.c.buscarHistoricoObsGiro().sku[primeira.chave];
  assert.deepEqual(Array.from(historico,e=>[e.obs,e.sequencia]),[['Nota B',3],['Nota A',2]]);
  const delta=a.c.buscarAtualizacoesGiroPortal(inicial.revisao);
  assert.equal(delta.historico.sku[primeira.chave][0].sequencia,3);
  const master=save(a,'Nota MASTER','evento-0003','MASTER','GRUPO');
  assert.equal(master.sequencia,2,'sequência é local à planilha do tipo, sem misturar MASTER/SKU');
});

test('rotas antigas em Code e Código usam PCPs, IDs e normalização estável',()=>{
  const a=portal();const r=a.c.salvarObsGiro('SKU','gráfica| marca |sku|1.000|v1|cd for','Nota','{}','evento-0011');
  assert(r.success);assert.equal(r.chave,'GRAFICA|MARCA|SKU|V1|CD FOR');
  assert.equal(a.c.buscarHistoricoObsGiro().sku[r.chave][0].id,'evento-0011');
  assert.equal(a.abas.get('Obs_Cockpit_sku').rows[1][5],'evento-0011');
});

test('poll sem alteração não acessa Sheets; revisão alterada retorna só eventos e previsões novos',()=>{
  const a=portal();save(a);
  const inicial=a.c.buscarAtualizacoesGiroPortal();assert(inicial.success);assert.equal(inicial.parcial,false);
  const reads=a.leituras(),opens=a.aberturas();
  const igual=a.c.buscarAtualizacoesGiroPortal(inicial.revisao);assert.equal(igual.alterado,false);
  assert.equal(a.leituras(),reads);assert.equal(a.aberturas(),opens);
  save(a,'Nota B','evento-0002');
  a.c.salvarPrevisaoEntregaCDPortal({chave:chave('SKU'),campos:['dataEntrega'],dataEntrega:'2026-10-30',requestId:'previsao-0001'});
  const delta=a.c.buscarAtualizacoesGiroPortal(inicial.revisao);
  assert.equal(delta.parcial,true);assert.equal(delta.historico.sku['GRAFICA|MARCA|SKU|V1|CD FOR'].length,1);
  assert.equal(delta.historico.sku['GRAFICA|MARCA|SKU|V1|CD FOR'][0].obs,'Nota B');
  assert.equal(delta.previsoes[chave('SKU')].dataEntrega,'2026-10-30');
  a.c.salvarPrevisaoEntregaCDPortal({chave:chave('SKU'),campos:['dataEntrega'],dataEntrega:'2026-11-01',requestId:'previsao-0002'});
  const seguinte=a.c.buscarAtualizacoesGiroPortal(delta.revisao);
  assert.equal(Object.keys(seguinte.historico.sku).length,0);
  assert.equal(seguinte.previsoes[chave('SKU')].versao,2);
});

test('conferência periódica incorpora edição direta sem apagar linhas antigas',()=>{
  const a=portal();save(a);const inicial=a.c.buscarAtualizacoesGiroPortal();
  a.abas.get('Obs_Cockpit_sku').rows[1][3]='Editada diretamente na PCPs';
  a.avancar(61000);const atualizado=a.c.buscarAtualizacoesGiroPortal(inicial.revisao);
  assert.equal(atualizado.parcial,false);assert.equal(atualizado.historico.sku['GRAFICA|MARCA|SKU|V1|CD FOR'][0].obs,'Editada diretamente na PCPs');
});

test('falha de gravação não confirma nota nem invalida revisão ou história antiga',()=>{
  const a=portal();save(a);const inicial=a.c.buscarAtualizacoesGiroPortal();
  a.setFail(true);const erro=save(a,'Não gravada','evento-0002');assert.equal(erro.success,false);
  assert.equal(a.abas.get('Obs_Cockpit_sku').rows.length,2);
  assert.equal(a.c.buscarAtualizacoesGiroPortal(inicial.revisao).alterado,false);
  assert.equal(a.locks(),a.releases());
});

test('contexto inválido e texto vazio são rejeitados sem tocar Sheets',()=>{
  const a=portal();assert.equal(save(a,' ').success,false);
  assert.equal(a.c.salvarObsGiroPortal('SKU','K','Nota','{quebrado','evento-0001').success,false);
  assert.equal(a.aberturas(),0);
});

test('histórico legado sem cabeçalho e chaves antigas conserva primeira linha e contexto',()=>{
  const a=portal();a.sheet('Obs_Cockpit_sku',[
    ['26/10/2026 10:00','usuario','GRÁFICA|MARCA|SKU|100|V1|CD FOR','Nota antiga','{"origem":"legado"}'],
    ['27/10/2026 10:00','usuario','GRAFICA|MARCA|SKU|V1|CD FOR','Nota nova','{}']]);
  const hist=a.c.buscarHistoricoObsGiro().sku['GRAFICA|MARCA|SKU|V1|CD FOR'];
  assert.equal(hist.length,2);assert.equal(hist[0].obs,'Nota nova');assert.equal(hist[1].contexto.origem,'legado');
});
