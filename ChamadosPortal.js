const PG_CH_CALCULATION_VERSION = 14;
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
function pgChLerTransportes_() {
  const id='1fue7_H6-vWdDuV4oI0Lu1dL9atOumjSM_8mkipNC11E', gid=1102000840;
  const columns=[['C','MAPA'],['G','DATA DA COLETA'],['Z','ENTREGUE']];
  const ranges=columns.map(([c])=>"'Base Fechada'!"+c+'1:'+c);
  const result=Sheets.Spreadsheets.Values.batchGet(id,{ranges,majorDimension:'COLUMNS',valueRenderOption:'FORMATTED_VALUE'});
  const [maps,picks,deliveries]=columns.map(([,header],i)=>{
    const values=result.valueRanges[i].values?.[0]||[];
    if(pgChTexto_(values[0])!==header)throw new Error('Coluna de Transportes inválida: '+header);
    return values;
  });
  const rows=[];
  for(let i=1;i<maps.length;i++){
    if(pgChTexto_(maps[i]))rows.push({map:maps[i],pick:picks[i],delivery:deliveries[i],row:i+1});
  }
  return {rows,url:'https://docs.google.com/spreadsheets/d/'+id+'/edit#gid='+gid};
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
// Recuperação manual de reserva órfã. Execute somente após verificar que não há
// geração em andamento em Execuções. Não apaga dados, cache publicado nem gatilhos.
function liberarTravaChamadosPortal(){
  pgChJsonAdmin_();
  const lock=LockService.getScriptLock();lock.waitLock(5000);
  try{
    const props=PropertiesService.getScriptProperties();
    const raw=props.getProperty(PG_CH_JSON_LEASE);
    if(!raw){const result={liberada:false,mensagem:'Nenhuma reserva de chamados ativa.'};console.log(JSON.stringify(result));return result;}
    props.deleteProperty(PG_CH_JSON_LEASE);
    const result={liberada:true,mensagem:'Reserva da Central liberada; dados publicados preservados.'};
    console.log(JSON.stringify(result));return result;
  }finally{lock.releaseLock();}
}
// Referência da primeira carga: 16.923 registros com INFO_MAPA_CODE
// conferidos na fonte em 18/11/2026, não o tamanho da grade.
const PG_CH_MAPA_BOOTSTRAP_ROWS=16923;
function pgChMapaValido_(first,second,previous){
  const keyRows=rows=>rows.filter(r=>r&&pgChTexto_(r.map));
  const a=keyRows(first),b=keyRows(second);
  const ref=Number(previous)||PG_CH_MAPA_BOOTSTRAP_ROWS;
  const min=Math.ceil(ref*0.95);
  if(a.length<min||b.length<min)
    throw new Error('Mapa em reposição ou redução de volume: '+a.length+' / '+b.length+' registros válidos; mínimo de segurança '+min+' (referência '+ref+'). Nenhum JSON foi substituído.');
  // Detecta repovoamento, troca das linhas e das informações efetivamente
  // utilizadas pela Central, inclusive quando as contagens são iguais.
  if(JSON.stringify(a)!==JSON.stringify(b))
    throw new Error('Mapa mudou durante a leitura ('+a.length+' / '+b.length+' registros). Nenhum JSON foi substituído; execute novamente.');
  return b;
}
const PG_CH_MAP_STORE='PG_CH_MAP_SOURCE_V1';
function pgChMapaFonte_(previous){
 const props=PropertiesService.getScriptProperties(),saved=JSON.parse(props.getProperty(PG_CH_MAP_STORE)||'null');let lastError;
 for(let attempt=0;attempt<3;attempt++){
  try{const first=pgChLerFonte_('map');Utilities.sleep(3000);const last=pgChLerFonte_('map'),rows=pgChMapaValido_(first.rows,last.rows,saved?.count||previous);
   const data={rows,url:last.url,at:new Date().toISOString()},file=pgChJsonWrite_(DriveApp.getFolderById(PASTA_CACHE_ID),'PG_CH_MAP_'+Utilities.getUuid()+'.json',data);
   props.setProperty(PG_CH_MAP_STORE,JSON.stringify({id:file.id,count:rows.length,at:data.at}));
   if(saved?.id)try{DriveApp.getFileById(saved.id).setTrashed(true);}catch(e){console.warn('[CH MAP] limpeza '+e);}
   return {...data,stale:false};
  }catch(e){lastError=e;console.warn('[CH MAP] tentativa '+(attempt+1)+': '+String(e.message||e));if(attempt<2)Utilities.sleep(5000);}
 }
 if(saved?.id)return {...pgChJsonRead_(saved.id),stale:true};
 const err=new Error('Mapa temporariamente indisponível. Atualização automática pendente. '+String(lastError?.message||lastError));err.pgMapRetry=true;throw err;
}
function pgChAgendarRetryMapa_(){
 const handler='repetirCacheChamadosPortal';if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===handler))ScriptApp.newTrigger(handler).timeBased().after(2*60*1000).create();
}
function repetirCacheChamadosPortal(){ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='repetirCacheChamadosPortal').forEach(t=>ScriptApp.deleteTrigger(t));return atualizarCacheChamadosPortal();}
function pgChJsonBuild_(before){
 const datasets={},links={},counts={};
 Object.keys(PG_CH_FONTES).filter(k=>k!=='map').forEach(k=>{const src=pgChLerFonte_(k);datasets[k]=src.rows;links[k]=src.url;counts[k]=src.rows.length;if(k==='spg'&&(!counts[k]||(before&&counts[k]<before.counts[k]*0.8)))throw new Error('A base '+PG_CH_FONTES[k].sheet+' está em atualização.');});
 const map=pgChMapaFonte_(before&&before.counts.map);datasets.map=map.rows;links.map=map.url;counts.map=map.rows.length;datasets.sla=getMatrizSLAPortal();
 const tp=pgChLerTransportes_();datasets.tp=tp.rows;links.tp=tp.url;counts.tp=tp.rows.length;
 let mail;
 try{mail=pgChLerAcordos_(datasets.spg);datasets.agreements=mail.agreements;counts.emailAcordos=mail.stats.matched;}
 catch(e){console.warn('[CH email] '+String(e.message||e));mail={stats:{error:true}};datasets.agreements={};}
 const model=pgChModelo_(datasets),gen=Utilities.getUuid(),now=new Date().toISOString(),result={gen,now,links,counts,mapPartial:false,mapStale:map.stale,mapAt:map.at,calculationVersion:PG_CH_CALCULATION_VERSION,rows:model.summaries,phases:PG_CH_ETAPAS};
 result.emailAgreements=mail.stats;
 if(map.stale)result.notice='Mapa: última leitura íntegra em '+new Date(map.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'. Atualização automática pendente.';
 if(mail.stats.error||mail.stats.partial||mail.stats.ocrErrors||mail.stats.decodeErrors)result.notice=[result.notice,mail.stats.error?'Não foi possível acessar os cronogramas de e-mail nesta geração.':mail.stats.partial?'Leitura de cronogramas de e-mail em andamento; os acordos já recuperados foram mantidos.':'Alguns cronogramas de e-mail não foram interpretados.'].filter(Boolean).join(' ');
 if(!model.summaries.length)throw new Error('Nenhum chamado encontrado; geração não publicada.');return {result,tickets:model.tickets};
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
    let built;try{built=pgChJsonBuild_(before);}catch(e){if(e.pgMapRetry){pgChAgendarRetryMapa_();console.warn(e.message);return {pending:true,reason:'MAPA_EM_ATUALIZACAO'};}throw e;}const {result,tickets}=built;if(result.mapStale)pgChAgendarRetryMapa_();
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
  pgChAplicarColetasResumo_(s,pgChColetasManuais_());
  // Corrige também JSONs já publicados, sem exigir nova geração.
  for(const t of s.rows||[]){
    const groups=t.groups||[];
    for(const g of groups)if(g.target&&g.qty>0&&g.coverage?.[10]>=g.qty)g.target=pgChProximaEtapa_(g.target,g.qty,g.coverage);
    if(groups.length&&groups.some(g=>g.target))t.target=pgChPrazoResumo_(groups);
    else if(t.target&&t.totals?.coverage?.[10]>=t.totals.qty)t.target=pgChProximaEtapa_(t.target,t.totals.qty,t.totals.coverage);
  }
  return Object.assign({},s,{requiredCalculationVersion:PG_CH_CALCULATION_VERSION,manual:latest,states:PG_CH_TRATATIVAS});
}
function pgChValidaId_(id) {
  if(typeof id!=='string' || !/^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|(?:SPG|PAINEL)-\d+)$/.test(id)) throw new Error('Chamado inválido.');
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
  pgChAplicarColetasDetalhe_(t,pgChColetasManuais_());
  for(const it of t.items||[])if(it.target&&it.qty>0&&it.coverage?.[10]>=it.qty)it.target=pgChProximaEtapa_(it.target,it.qty,it.coverage);
  if((t.items||[]).some(it=>it.target))t.target=pgChPrazoResumo_(t.items);
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

const PG_CH_ABA_COLETA='Chamados_Coletas_Manuais';
function pgChColetasManuais_(){
 const sheet=pgArquivoObservacoesGiro_().getSheetByName(PG_CH_ABA_COLETA),out=new Map();
 if(!sheet||sheet.getLastRow()<2)return out;
 sheet.getRange(2,1,sheet.getLastRow()-1,6).getDisplayValues().forEach(r=>{const date=pgChData_(r[2]);if(date)out.set(JSON.stringify([r[0],pgChCDNome_(r[1])]),{date,user:r[3],at:r[4]});});return out;
}
function salvarColetaManualChamadoPortal(id,cd,date){
 pgChValidaId_(id);cd=pgChCDNome_(cd);const d=pgChData_(date),today=Utilities.formatDate(new Date(),'America/Sao_Paulo','yyyy-MM-dd'),user=Session.getActiveUser().getEmail();
 if(!user||!cd||!d||d>today)throw new Error('Informe uma data válida, não futura, e entre com sua conta.');
 const s=pgChSnapshot_(),t=s.rows.find(r=>r.id===id);
 if(!t||/CANCEL/i.test(t.status)||!t.created||d<t.created)throw new Error('Chamado cancelado, inexistente ou data anterior à abertura.');
 const routes=(t.okrRoutes||[]).filter(r=>pgChCDNome_(r.cd)===cd&&r.qty>0);
 if(!routes.length)throw new Error('Destino não localizado neste chamado.');
 if(routes.some(r=>r.delivery&&d>r.delivery))throw new Error('A coleta não pode ser posterior à entrega.');
 if(routes.every(r=>r.pick))throw new Error('O destino já tem coleta integral registrada.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const old=pgChColetasManuais_().get(JSON.stringify([id,cd]));if(old)throw new Error('Este destino já possui uma coleta manual registrada.');
  const ss=pgArquivoObservacoesGiro_();let sheet=ss.getSheetByName(PG_CH_ABA_COLETA);
  if(!sheet){sheet=ss.insertSheet(PG_CH_ABA_COLETA);sheet.getRange(1,1,1,6).setValues([['ID Chamado','CD','Data de coleta','Usuário','Registrado em','Evento']]);sheet.setFrozenRows(1);SpreadsheetApp.flush();}
  Sheets.Spreadsheets.Values.append({values:[[id,cd,d,user,new Date().toISOString(),Utilities.getUuid()]]},ss.getId(),"'"+PG_CH_ABA_COLETA+"'!A:F",{valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'});
  return {ok:true};
 }finally{lock.releaseLock();}
}
function pgChComplementoManual_(collection,qty,manual){
 if(!manual||!collection||!(qty>0)||pgChDataIntegral_(collection.events||[],qty,'date','qty'))return false;
 const events=collection.events||[],remaining=Math.max(0,qty-events.reduce((n,e)=>n+e.qty,0));if(!remaining)return false;
 const known=new Map();events.forEach(e=>{if(e.kit)known.set(e.kit,(known.get(e.kit)||0)+e.qty);});
 let left=remaining;
 for(const part of collection.parts||[]){const covered=Math.min(part.qty,known.get(part.kit)||0);known.set(part.kit,Math.max(0,(known.get(part.kit)||0)-covered));const q=Math.min(left,part.qty-covered);if(q>0){events.push({date:manual.date,qty:q,kit:part.kit||'',map:'',source:'Manual'});left-=q;}}
 if(left)events.push({date:manual.date,qty:left,kit:'',map:'',source:'Manual'});
 collection.events=events;collection.source=pgChUnicos_(events.map(e=>e.source)).join(' + ');collection.date=pgChDataIntegral_(events,qty,'date','qty');collection.picked=qty;return true;
}
function pgChAplicarColetasResumo_(s,manual){
 for(const t of s.rows||[]){
  let changed=false;
  for(const r of t.okrRoutes||[]){
   const edit=manual.get(JSON.stringify([t.id,pgChCDNome_(r.cd)]));if(!edit||!pgChDataRealChamado_(edit.date,t.created)||r.delivery&&edit.date>r.delivery||!pgChComplementoManual_(r.collection,r.qty,edit))continue;
   changed=true;r.pick=r.collection.date;const prev=r.coverage||[];
   const {specRows,...dims}=r.dimensions||{},g=(t.groups||[]).find(g=>Object.keys(dims).every(k=>JSON.stringify(g[k])===JSON.stringify(dims[k])));
   const delta=Math.max(0,r.qty-(r.picked||0));t.totals.picked+=delta;if(g)g.picked+=delta;r.picked=r.qty;
   for(const k of [0,1,2,3,4,5,6,10]){const diff=Math.max(0,r.qty-(prev[k]||0));t.totals.coverage[k]+=diff;if(g)g.coverage[k]+=diff;prev[k]=r.qty;}
   const label=r.delivery?'Entregue integralmente':'Em trânsito';
   for(const list of [t.production,g&&g.production])if(list&&r.productionStatus!==label){const old=list.find(x=>x.label===r.productionStatus);if(old)old.qty=Math.max(0,old.qty-r.qty);let next=list.find(x=>x.label===label);if(!next){next={label,qty:0};list.push(next);}next.qty+=r.qty;}
   r.productionStatus=label;
  }
  if(changed){t.pickDone=pgChMarcoItens_(t.okrRoutes,'pick');t.pickSource=pgChUnicos_(t.okrRoutes.map(r=>r.collection.source)).join(' + ');t.production=(t.production||[]).filter(x=>x.qty>0);(t.groups||[]).forEach(g=>g.production=(g.production||[]).filter(x=>x.qty>0));}
 }
}
function pgChAplicarColetasDetalhe_(t,manual){
 for(const it of t.items||[]){const edit=manual.get(JSON.stringify([t.id,pgChCDNome_(it.cd)])),delivery=it.deliveryEvidence?.date||it.stages?.[11]?.r||pgChDataIntegral_(it.maps||[],it.qty,'delivery','delivered');if(!edit||!pgChDataRealChamado_(edit.date,t.created)||delivery&&edit.date>delivery||!pgChComplementoManual_(it.collection,it.qty,edit))continue;
  const delta=Math.max(0,it.qty-Math.min(it.qty,it.picked));t.totals.picked+=delta;it.picked=it.qty;
  for(const k of [0,1,2,3,4,5,6,10]){const diff=Math.max(0,it.qty-(it.coverage[k]||0));t.totals.coverage[k]+=diff;it.coverage[k]=it.qty;it.stages[k].units=it.qty;}
  it.stages[10].r=it.collection.date;it.stages[10].f=it.collection.source;it.productionStatus={label:it.delivered>=it.qty?'Entregue integralmente':'Em trânsito',source:'Manual'};
 }
}
