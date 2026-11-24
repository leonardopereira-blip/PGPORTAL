const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','ChamadosPortal.js'),'utf8');
function load(f){
  const ctx=vm.createContext(f.mocks);vm.runInContext(source,ctx);
  ctx.pgChEventos_=()=>[];ctx.pgChColetasManuais_=()=>new Map();ctx.pgChJsonBuild_=f.build;
  return ctx;
}
const uid='74b79202-798e-4b12-b7da-b7dffa1e01f1';
function makeFake(){
  const props=new Map(), files=new Map(), folders=new Map();let serial=0, builds=0, fail=false, triggers=[];
  const uuid=()=>String(++serial).padStart(8,'0')+'-0000-0000-0000-000000000000';
  const admin=()=>({getEmail:()=> 'leonardo.pereira@arcoeducacao.com.br'});
  const folder=id=>({getId:()=>id,createFile:b=>{if(fail&&b.name==='resumo.json')throw Error('falha Drive');const fid='file'+(++serial);files.set(fid,b.raw);return {getId:()=>fid};},setTrashed:()=>folders.set(id,'trashed')});
  const mocks={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:uuid,newBlob:(raw,mime,name)=>({raw,name,getBytes:()=>Array.from(raw)})},
    DriveApp:{getFolderById:id=>({...folder(id),createFolder:()=>folder('folder'+(++serial))}),getFileById:id=>({getBlob:()=>({getDataAsString:()=>{if(!files.has(id))throw Error('sem arquivo');return files.get(id);}})})},
    Session:{getActiveUser:admin,getEffectiveUser:admin},PASTA_CACHE_ID:'root',
    ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},newTrigger:name=>({timeBased:()=>({everyHours:n=>({create:()=>triggers.push({name,n,getHandlerFunction:()=>name})})})})},
    console:{log(){},warn(){}}};
  return {mocks,props,files,folders,get builds(){return builds},get triggers(){return triggers},setFail:v=>fail=v,
    build:()=>{builds++;const gen=uuid(), t={id:uid,n:10};return {result:{gen,now:new Date().toISOString(),rows:[t],counts:{map:100,spg:1},phases:[]},tickets:new Map([[uid,t]])};}};
}
test('abertura sem JSON falha claramente e não consulta as planilhas',()=>{
  const f=makeFake(),api=load(f);
  assert.throws(()=>api.getChamadosPortal(true),/primeira carga/);assert.equal(f.builds,0);
});
test('geração publica resumo e detalhe persistentes, separados da consulta',()=>{
  const f=makeFake(),api=load(f);
  const info=api.atualizarCacheChamadosPortal();
  assert.equal(f.builds,1);assert.equal(api.getChamadosPortal(false).gen,info.gen);
  assert.equal(api.getChamadosPortal(true).rows.length,1);
  assert.equal(api.getDetalheChamadoPortal(uid,info.gen).ticket.id,uid);
  assert.equal(f.builds,1);
});
test('erro ao gravar nova geração não apaga o ponteiro publicado',()=>{
  const f=makeFake(),api=load(f),a=api.atualizarCacheChamadosPortal();
  f.setFail(true);assert.throws(()=>api.atualizarCacheChamadosPortal(),/falha Drive/);
  assert.equal(api.getChamadosPortal(false).gen,a.gen);
  assert.equal(api.getDetalheChamadoPortal(uid,a.gen).ticket.id,uid);
});
test('gerações distintas não misturam detalhe e gatilho não duplica',()=>{
  const f=makeFake(),api=load(f),a=api.atualizarCacheChamadosPortal(),b=api.atualizarCacheChamadosPortal();
  assert.notEqual(a.gen,b.gen);assert.equal(api.getDetalheChamadoPortal(uid,a.gen).ticket.id,uid);
  api.instalarAtualizacaoCacheChamadosPortal();api.instalarAtualizacaoCacheChamadosPortal();
  assert.equal(f.triggers.length,1);assert.equal(f.triggers[0].n,1);
});
