const PG_CH_TRATATIVAS = ['Em análise','Em tratativa','Aguardando retorno','Resolvido'];
const PG_CH_ABA_EDICAO = 'Chamados_Tratativas';

function pgChFonte_(key) {
  const def=PG_CH_FONTES[key], props=PropertiesService.getScriptProperties(), prop='PG_CH_FONTE_'+key;
  let id=props.getProperty(prop);
  if (!id) {
    const arquivos=DriveApp.getFilesByName(def.file), candidatos=[], encontrados=[];
    while(arquivos.hasNext()) {
      const file=arquivos.next();
      if(file.isTrashed() || file.getMimeType()!==MimeType.GOOGLE_SHEETS) continue;
      candidatos.push(file.getId());
    }
    // O serviço DriveApp pode omitir arquivos de drives compartilhados.
    if(!candidatos.length){
      const q="trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '"+def.file.replace(/'/g,"\\'")+"'";
      let token='';
      do{
        const url='https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id)&q='+encodeURIComponent(q)+(token?'&pageToken='+encodeURIComponent(token):'');
        const res=JSON.parse(UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}}).getContentText());
        (res.files||[]).forEach(f=>candidatos.push(f.id));token=res.nextPageToken||'';
      }while(token);
    }
    candidatos.forEach(candidate=>{
      const meta=Sheets.Spreadsheets.get(candidate,{fields:'sheets(properties(sheetId,title))'});
      if(meta.sheets.some(s=>s.properties.sheetId===def.gid && s.properties.title===def.sheet)) encontrados.push(candidate);
    });
    if(encontrados.length!==1) throw new Error('Não foi possível identificar a fonte '+def.file+' / '+def.sheet+'.');
    id=encontrados[0];props.setProperty(prop,id);
  }
  return id;
}
function pgChLetra_(n) {
  let s='';
  for(;n>0;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s;
  return s;
}
function pgChLerFonte_(key) {
  const def=PG_CH_FONTES[key], id=pgChFonte_(key), tab="'"+def.sheet.replace(/'/g,"''")+"'!";
  const out=Sheets.Spreadsheets.Values.get(id,tab+def.header+':'+def.header), headers=(out.values||[])[0]||[];
  const cols=Object.entries(def.fields).map(([field,h])=>{
    const i=headers.indexOf(h);
    if(i<0) throw new Error('Coluna ausente em '+def.sheet+' — '+h);
    return {field,i,h};
  }).sort((a,b)=>a.i-b.i);
  if(key==='spg' && headers[1]!==def.fields.cat) throw new Error('A coluna B dos chamados mudou. Confira a categoria no SPG.');
  const groups=[];
  cols.forEach(c=>{
    const last=groups[groups.length-1];
    if(last && c.i===last[last.length-1].i+1) last.push(c); else groups.push([c]);
  });
  const ranges=groups.map(g=>tab+pgChLetra_(g[0].i+1)+def.header+':'+pgChLetra_(g[g.length-1].i+1));
  const resp=Sheets.Spreadsheets.Values.batchGet(id,{ranges,majorDimension:'COLUMNS',valueRenderOption:'FORMATTED_VALUE'});
  const rows=[];
  groups.forEach((g,k)=>{
    const values=resp.valueRanges[k].values||[];
    g.forEach((c,j)=>{
      const col=values[j]||[];
      if(col[0]!==c.h) throw new Error('A fonte '+def.sheet+' mudou durante a leitura. Atualize a tela.');
      for(let n=1;n<col.length;n++){
        if(!rows[n-1]) rows[n-1]={row:def.header+n};
        rows[n-1][c.field]=pgChTexto_(col[n]);
      }
    });
  });
  return {rows,url:'https://docs.google.com/spreadsheets/d/'+id+'/edit#gid='+def.gid};
}
// A propriedade contém apenas ponteiros para gerações completas no Drive.
const PG_CH_JSON_PTR='PG_CH_JSON_GENERATIONS_V2';
const PG_CH_JSON_LEASE='PG_CH_JSON_LEASE_V2';
function pgChJsonRefs_(){
  return JSON.parse(PropertiesService.getScriptProperties().getProperty(PG_CH_JSON_PTR)||'[]');
}
function pgChJsonRead_(id){
  return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
}
function pgChSnapshot_(){
  const start=Date.now(), refs=pgChJsonRefs_();
  if(!refs.length)throw new Error('A Central ainda não tem JSON publicado. Execute a primeira carga no Apps Script.');
  const s=pgChJsonRead_(refs[0].summary);
  if(s.gen!==refs[0].gen || !Array.isArray(s.rows))throw new Error('Índice de chamados inválido.');
  console.log('[CH JSON] leitura resumo ms='+ (Date.now()-start));
  return s;
}
function pgChJsonReserve_(){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw new Error('Outra atualização está reservando o cache.');
  try{
    const props=PropertiesService.getScriptProperties();
    const old=JSON.parse(props.getProperty(PG_CH_JSON_LEASE)||'null');
    if(old && old.until>Date.now())throw new Error('Já existe uma geração de chamados em andamento.');
    const token=Utilities.getUuid();
    props.setProperty(PG_CH_JSON_LEASE,JSON.stringify({token,until:Date.now()+15*60*1000}));
    return token;
  }finally{lock.releaseLock();}
}
function pgChJsonRelease_(token){
  const lock=LockService.getScriptLock();lock.waitLock(5000);
  try{
    const props=PropertiesService.getScriptProperties();
    const lease=JSON.parse(props.getProperty(PG_CH_JSON_LEASE)||'null');
    if(lease && lease.token===token)props.deleteProperty(PG_CH_JSON_LEASE);
  }finally{lock.releaseLock();}
}
function pgChJsonBuild_(before){
  const datasets={},links={},counts={};
  let mapPartial=false;
  Object.keys(PG_CH_FONTES).forEach(k=>{
    const src=pgChLerFonte_(k);datasets[k]=src.rows;links[k]=src.url;counts[k]=src.rows.length;
    if((k==='spg'||k==='map') && (!counts[k] || (before && counts[k]<before.counts[k]*0.8))) {
      if(k==='map' && counts[k])mapPartial=true;
      else throw new Error('A base '+PG_CH_FONTES[k].sheet+' está em atualização. Tente novamente em instantes.');
    }
    if(k==='map'){
      const meta=Sheets.Spreadsheets.get(pgChFonte_(k),{fields:'sheets(properties(sheetId,gridProperties(rowCount)))'});
      const sheet=meta.sheets.find(s=>s.properties.sheetId===PG_CH_FONTES.map.gid);
      // O consolidado é apagado e repovoado em lotes. Uma lacuna grande no
      // final da grade é exibida como leitura parcial, inclusive no primeiro acesso.
      const capacity=sheet.properties.gridProperties.rowCount-1;
      mapPartial=mapPartial || counts.map<capacity*0.97;
    }
  });
  if(mapPartial) throw new Error('Mapa em atualização; a geração publicada permanece intacta.');
  datasets.sla=getMatrizSLAPortal();
  const model=pgChModelo_(datasets),gen=Utilities.getUuid(),now=new Date().toISOString();
  const result={gen,now,links,counts,mapPartial,rows:model.summaries,phases:PG_CH_ETAPAS};
  if(!model.summaries.length)throw new Error('Nenhum chamado encontrado; geração não publicada.');
  return {result,tickets:model.tickets};
}
function pgChJsonWrite_(folder,name,obj){
  const raw=JSON.stringify(obj);
  const blob=Utilities.newBlob(raw,'application/json',name);
  return {id:folder.createFile(blob).getId(),bytes:blob.getBytes().length};
}
// Esta função não é chamada por getChamadosPortal nem pela abertura do portal.
function atualizarCacheChamadosPortal(){
  pgChJsonAdmin_();
  const token=pgChJsonReserve_(), start=Date.now();
  let folder=null,published=false;
  try{
    const refs=pgChJsonRefs_(),before=refs.length?pgChSnapshot_():null;
    const {result,tickets}=pgChJsonBuild_(before);
    folder=DriveApp.getFolderById(PASTA_CACHE_ID).createFolder('PG_CH_JSON_'+result.gen);
    const index={}, entries=Array.from(tickets.entries());
    for(let i=0;i<entries.length;i+=8){
      const batch=entries.slice(i,i+8);
      const file=pgChJsonWrite_(folder,'detalhe_'+i+'.json',Object.fromEntries(batch));
      batch.forEach(([id])=>index[id]=file.id);
    }
    const details=pgChJsonWrite_(folder,'indice_detalhes.json',index);
    const summary=pgChJsonWrite_(folder,'resumo.json',result);
    // Confirma o ponteiro somente depois que todos os arquivos existem.
    const lock=LockService.getScriptLock();lock.waitLock(5000);
    let removed=[];
    try{
      const props=PropertiesService.getScriptProperties();
      const lease=JSON.parse(props.getProperty(PG_CH_JSON_LEASE)||'null');
      if(!lease || lease.token!==token || lease.until<=Date.now())throw new Error('Reserva expirada; publicação interrompida.');
      const all=[{gen:result.gen,summary:summary.id,details:details.id,folder:folder.getId(),now:result.now},...pgChJsonRefs_()];
      // Mantém a geração atual, a anterior, e as recentes para fichas ainda abertas.
      const keep=all.filter((r,i)=>i<2 || Date.now()-Date.parse(r.now)<24*60*60*1000);
      removed=all.filter(r=>!keep.includes(r));
      props.setProperty(PG_CH_JSON_PTR,JSON.stringify(keep));published=true;
    }finally{lock.releaseLock();}
    removed.forEach(r=>{try{DriveApp.getFolderById(r.folder).setTrashed(true);}catch(e){console.warn('[CH JSON] limpeza: '+e);}});
    const info={gen:result.gen,now:result.now,chamados:result.rows.length,bytes:summary.bytes,ms:Date.now()-start};
    console.log('[CH JSON] publicado '+JSON.stringify(info));return info;
  }finally{
    if(folder && !published){try{folder.setTrashed(true);}catch(e){console.warn('[CH JSON] descarte: '+e);}}
    pgChJsonRelease_(token);
  }
}
function pgChJsonAdmin_(){
  const active=String(Session.getActiveUser().getEmail()||'').toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if((active||effective)!=='leonardo.pereira@arcoeducacao.com.br')throw new Error('A geração do JSON é administrada pelo responsável do portal.');
}
function instalarAtualizacaoCacheChamadosPortal(){
  pgChJsonAdmin_();
  const handler='atualizarCacheChamadosPortal';
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler);
  if(existing.length===1)return {ok:true,existing:true};
  existing.forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
  return {ok:true,period:'1 hora'};
}
function conferirCacheChamadosPortal(){
  pgChJsonAdmin_();
  const s=pgChSnapshot_();
  const info={gen:s.gen,now:s.now,chamados:s.rows.length,counts:s.counts};
  console.log(JSON.stringify(info));return info;
}
function pgChEventos_(id) {
  const sheet=pgArquivoObservacoesGiro_().getSheetByName(PG_CH_ABA_EDICAO);
  if(!sheet || sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,7).getDisplayValues()
    .filter(r=>!id || r[0]===id).map(r=>({ticket:r[0],event:r[1],at:r[2],user:r[3],state:r[4],note:r[5],base:r[6]}));
}
function getChamadosPortal(atualizar) {
  const start=Date.now(),s=pgChSnapshot_(), latest={};
  pgChEventos_().forEach(e=>{latest[e.ticket]=e.state;});
  console.log('[CH JSON] resumo + tratativas ms='+(Date.now()-start));
  return Object.assign({},s,{manual:latest,states:PG_CH_TRATATIVAS});
}
function pgChValidaId_(id) {
  if(typeof id!=='string' || !/^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|SPG-\d+)$/.test(id)) throw new Error('Chamado inválido.');
}
function getDetalheChamadoPortal(id,gen) {
  pgChValidaId_(id);
  if(typeof gen!=='string' || !/^[a-f0-9-]{36}$/.test(gen))throw new Error('Atualize a lista de chamados.');
  const start=Date.now(),ref=pgChJsonRefs_().find(r=>r.gen===gen);
  if(!ref)throw new Error('A geração da lista expirou. Atualize a lista.');
  const index=pgChJsonRead_(ref.details),file=index[id];
  if(!file)throw new Error('Chamado não localizado nesta geração.');
  const t=pgChJsonRead_(file)[id];
  if(!t || t.id!==id)throw new Error('Detalhe inválido. Atualize a lista.');
  const history=pgChEventos_(id);console.log('[CH JSON] detalhe ms='+(Date.now()-start));
  return {ticket:t,history};
}
function salvarTratativaChamadoPortal(id,state,note,base,event) {
  pgChValidaId_(id);
  if(!PG_CH_TRATATIVAS.includes(state) || typeof note!=='string' || note.length>1500) throw new Error('Confira o status e a observação (até 1.500 caracteres).');
  event=pgGiroEventoId_(event);base=pgChTexto_(base);note=note.trim();
  const user=Session.getActiveUser().getEmail();
  if(!user)throw new Error('Entre com sua conta para registrar a alteração.');
  const s=pgChSnapshot_();
  if(!s.rows.some(t=>t.id===id))throw new Error('Chamado não localizado no SPG.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const history=pgChEventos_(id), duplicate=history.find(x=>x.event===event);
    if(duplicate){
      if(duplicate.user!==user || duplicate.state!==state || duplicate.note!==note || duplicate.base!==base) throw new Error('Evento incompatível com o registro anterior.');
      return {ok:true,history};
    }
    const last=history[history.length-1];
    if((last?last.event:'')!==base)return {ok:false,conflict:true,history};
    const ss=pgArquivoObservacoesGiro_();
    let sheet=ss.getSheetByName(PG_CH_ABA_EDICAO);
    if(!sheet){sheet=ss.insertSheet(PG_CH_ABA_EDICAO);sheet.getRange(1,1,1,7).setValues([['ID Chamado','Evento','Registrado em','Usuário','Status da tratativa','Observação','Revisão anterior']]);sheet.setFrozenRows(1);SpreadsheetApp.flush();}
    const at=new Date().toISOString();
    Sheets.Spreadsheets.Values.append({values:[[id,event,at,user,state,note,base]]},ss.getId(),"'"+PG_CH_ABA_EDICAO+"'!A:G",{valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'});
    return {ok:true,history:history.concat([{ticket:id,event,at,user,state,note,base}])};
  }finally{lock.releaseLock();}
}
