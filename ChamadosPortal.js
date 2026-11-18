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
// Cada geração é imutável. Um recálculo concorrente não mistura partes de duas leituras.
function pgChCachePut_(key,obj,pending) {
  const raw=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj),'application/json')).getBytes());
  let count=0;
  for(let i=0;i<raw.length;i+=80000) pending[key+':'+count++]=raw.slice(i,i+80000);
  pending[key]=String(count);
}
function pgChCacheGet_(key) {
  const cache=CacheService.getScriptCache(), count=Number(cache.get(key));
  if(!count || count>200) return null;
  const keys=Array.from({length:count},(_,i)=>key+':'+i), parts=cache.getAll(keys);
  if(keys.some(k=>!parts[k]))return null;
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(keys.map(k=>parts[k]).join('')),'application/x-gzip')).getDataAsString('UTF-8'));
}
function pgChSnapshot_(force) {
  const cache=CacheService.getScriptCache(),ptr='PG_CH_V1_CURRENT',prev=cache.get(ptr);
  const before=prev?pgChCacheGet_('CH:'+prev):null;
  if(!force && before)return before;
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
  if(mapPartial && before && !before.mapPartial) return Object.assign({},before,{notice:'Mapa em atualização. Exibindo a última leitura completa de '+before.now+'.'});
  datasets.sla=getMatrizSLAPortal();
  const model=pgChModelo_(datasets),gen=Utilities.getUuid(),now=new Date().toISOString();
  const result={gen,now,links,counts,mapPartial,rows:model.summaries,phases:PG_CH_ETAPAS};
  if(mapPartial)result.notice='O mapa está sendo repovoado. Volumes logísticos, saldos e previsões estão parciais. Atualize para conferir a carga completa.';
  const pending={};
  model.tickets.forEach((t,id)=>pgChCachePut_('CH:'+gen+':'+id,t,pending));
  pgChCachePut_('CH:'+gen,result,pending);
  let batch={},size=0;
  Object.entries(pending).forEach(([key,value])=>{
    if(size+value.length>600000){cache.putAll(batch,1800);batch={};size=0;}
    batch[key]=value;size+=value.length;
  });
  cache.putAll(batch,1800);cache.put(ptr,gen,mapPartial?60:600);
  return result;
}
function pgChEventos_(id) {
  const sheet=pgArquivoObservacoesGiro_().getSheetByName(PG_CH_ABA_EDICAO);
  if(!sheet || sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,7).getDisplayValues()
    .filter(r=>!id || r[0]===id).map(r=>({ticket:r[0],event:r[1],at:r[2],user:r[3],state:r[4],note:r[5],base:r[6]}));
}
function getChamadosPortal(atualizar) {
  const s=pgChSnapshot_(atualizar===true), latest={};
  pgChEventos_().forEach(e=>{latest[e.ticket]=e.state;});
  return Object.assign({},s,{manual:latest,states:PG_CH_TRATATIVAS});
}
function pgChValidaId_(id) {
  if(typeof id!=='string' || !/^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|SPG-\d+)$/.test(id)) throw new Error('Chamado inválido.');
}
function getDetalheChamadoPortal(id,gen) {
  pgChValidaId_(id);
  if(typeof gen!=='string' || !/^[a-f0-9-]{36}$/.test(gen))throw new Error('Atualize a lista de chamados.');
  let t=pgChCacheGet_('CH:'+gen+':'+id);
  if(!t){
    const s=pgChSnapshot_(true);t=pgChCacheGet_('CH:'+s.gen+':'+id);
    if(!t)throw new Error('O chamado mudou ou saiu da base. Atualize a lista.');
  }
  return {ticket:t,history:pgChEventos_(id)};
}
function salvarTratativaChamadoPortal(id,state,note,base,event) {
  pgChValidaId_(id);
  if(!PG_CH_TRATATIVAS.includes(state) || typeof note!=='string' || note.length>1500) throw new Error('Confira o status e a observação (até 1.500 caracteres).');
  event=pgGiroEventoId_(event);base=pgChTexto_(base);note=note.trim();
  const user=Session.getActiveUser().getEmail();
  if(!user)throw new Error('Entre com sua conta para registrar a alteração.');
  const s=pgChSnapshot_(false);
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
