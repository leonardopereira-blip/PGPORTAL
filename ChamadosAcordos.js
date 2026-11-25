// Central de Chamados: leitura de cronogramas, sem enviar ou modificar mensagens.
function pgChMailNorm_(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function pgChMailSubject_(v){
 const m=pgChMailNorm_(v).match(/(?:^|\b)(solicitacao de prazo|formalizacao da producao)(?:\s+ampliados?)?\s*:\s*chamado\s+(\d+)\b/);
 return m?{kind:m[1].startsWith('solicitacao')?'request':'formal',n:m[2]}:null;
}
function pgChMailDomains_(v){return [...new Set((String(v||'').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)||[]).map(x=>x.toLowerCase().split('@')[1]))];}
function pgChMailVendor_(domain){
 if(!domain||/(^|\.)arcoeducacao\.com\.br$/.test(domain)||/^(gmail|hotmail|outlook|yahoo)\./.test(domain))return '';
 const root=domain.split('.')[0].replace(/[^a-z0-9]/g,'').toUpperCase();
 const aliases={METABRASIL:'META',RONAEDITORA:'RONA',MAXIGRAFICA:'MAXI',PIFFERPRINT:'PIFFER',SDIGRAFICA:'SDI',GRAFICAPOSIGRAF:'POSIGRAF',GRAFICACOAN:'COAN'};
 return pgChGraf_(aliases[root]||root);
}
function pgChMailDate_(raw,at){
 const m=String(raw||'').match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?\b/);
 if(!m)return '';
 const ref=new Date(at),year=ref.getUTCFullYear();if(!Number.isFinite(year))return '';
 const years=m[3]?[m[3].length===2?2000+Number(m[3]):Number(m[3])]:[year-1,year,year+1];
 const candidates=years.map(y=>String(y)+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')).filter(x=>pgChData_(x));
 candidates.sort((a,b)=>Math.abs(Date.parse(a)-ref)-Math.abs(Date.parse(b)-ref));return candidates[0]||'';
}
function pgChMailAdd_(date,n){if(!date)return '';const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function pgChMailClean_(text){
 return String(text||'').replace(/\r/g,'').split(/\n\s*(?:-{3,}\s*mensagem original|em [^\n]+ escreveu:|on [^\n]+ wrote:|de:\s*.+@|from:\s*.+@|_{5,}|-{3,}\s*original message)/i)[0].replace(/^\s*>.*$/gm,'');
}
function pgChMailParse_(body,at){
 const text=pgChMailNorm_(pgChMailClean_(body)),out={},rank={};
 const fields=[
 ['approval',/(?:data\s+(?:de\s+)?)?(?:aprove|aprovacao|aprovar|aceite)(?:\s+d[oe]s?\s+bonecos?)?/],
 ['op',/data\s+lib(?:eracao)?\.?\s*(?:de\s+)?op\s*(?:e|\/)\s*papel/],
 ['machine',/(?:data\s+(?:planejada\s+)?(?:de\s+)?)?(?:entrada\s+em\s+maquina|inicio\s+(?:de|da)\s+impressao)/],
 ['printEnd',/(?:data\s+(?:de\s+)?)?(?:(?:fim|termino|conclusao)\s+(?:de|da)\s+impressao|prazo\s+de\s+finalizacao\s+de\s+producao)/],
 ['proof',/(?:data\s+(?:de\s+)?)?(?:envio|recebimento)\s+d[oe]s?\s+bonecos?/],
 ['file',/(?:data\s+(?:de\s+)?)?(?:envio\s+d[oe]s?\s+arquivos?|arquivo(?:s)?)/],
 ['pickup',/(?:prazo\s+de\s+envio\s+do\s+material|disponibilizacao\s+para\s+coleta|(?:data\s+(?:da|de)\s+)?coleta(?:\s+(?:desejada|sugerida|respondida|estimada|formalizada))?|prazo\s+(?:respondido|sugerido))/],
 ['delivery',/(?:data\s+(?:de\s+)?)?(?:entrega\s+(?:no|ao|em)\s+cd|prazo\s+de\s+entrega\s+do\s+material)/]
 ];
 const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
 for(let i=0;i<lines.length;i++){
  const line=lines[i].replace(/^(?:[-*•]\s*|\d+[.)]\s*)+/,'');
  if(/^(?:para a data|considere|prazo solicitado)/.test(line))continue;
  for(const [field,re] of fields){
   const m=line.match(new RegExp('^'+re.source+'\\s*(?:[:=–—-]\\s*)?','i'));if(!m)continue;
   let rest=line.slice(m[0].length).trim();
   if(!rest&&lines[i+1]&&/^(?:\d{1,2}[\/.-]\d{1,2}|acervo\b)/.test(lines[i+1]))rest=lines[i+1];
   const value=/^acervo\b/.test(rest)?'ACERVO':pgChMailDate_(rest,at);
   if(!value)continue;
   const priority=/respondid|sugerid|formalizad/.test(line)?3:/desejad/.test(line)?1:2;
   if(!rank[field]||priority>=rank[field]){out[field]=value;rank[field]=priority;}break;
  }
 }
 if(/(?:data\s+)?(?:envio\s+d[oe]s?\s+bonecos?)[^\n]{0,90}\bd\s*-\s*1\b[^\n]{0,50}aprovacao/.test(text)&&out.approval&&out.approval!=='ACERVO')out.proof=pgChMailAdd_(out.approval,-1);
 if(/entrada\s+em\s+maquina[^\n]{0,90}\bd\s*\+\s*1\b[^\n]{0,80}lib[^\n]*op/.test(text)&&out.op&&out.op!=='ACERVO')out.machine=pgChMailAdd_(out.op,1);
 if(rank.pickup===1&&!/conseguimos|podemos atender|atendemos|confirmamos|formalizo/.test(text)&&Object.keys(out).filter(k=>k!=='pickup').length<2)delete out.pickup;
 return out;
}
function pgChMailMerge_(vendor,formal){
 const out={},order=['file','proof','approval','machine','printEnd','pickup','delivery'];
 for(const k of order){
  const v=vendor?.dates?.[k],f=formal?.dates?.[k];
  if(f==='ACERVO'||v==='ACERVO'&&(!f||vendor.at>=formal.at)){out[k]={value:'ACERVO',source:f==='ACERVO'?'Formalização':'Gráfica',thread:f==='ACERVO'?formal.thread:vendor.thread};continue;}
  const val=v&&v!=='ACERVO'?v:f&&f!=='ACERVO'?f:'';
  if(val)out[k]={value:val,source:v===val?'Gráfica':'Formalização',thread:v===val?vendor.thread:formal.thread};
 }
 // Quando as datas escolhidas são incompatíveis, prefere o cronograma formalizado coerente.
 for(let i=1;i<order.length;i++){
  const k=order[i],prior=order.slice(0,i).reverse().map(x=>out[x]?.value).find(v=>v&&v!=='ACERVO');
  if(!prior||!out[k]||out[k].value==='ACERVO'||out[k].value>=prior)continue;
  const fallback=formal?.dates?.[k];
  if(fallback&&fallback!=='ACERVO'&&fallback>=prior)out[k]={value:fallback,source:'Formalização',thread:formal.thread};
  else{const prev=order.slice(0,i).reverse().find(x=>out[x]?.value===prior);const pf=formal?.dates?.[prev];if(pf&&pf!=='ACERVO'&&pf<=out[k].value)out[prev]={value:pf,source:'Formalização',thread:formal.thread};else delete out[k];}
 }
 return out;
}
function pgChMailSelect_(records,allocated){
 const by=new Map();
 for(const r of records.slice().sort((a,b)=>a.at-b.at)){
  if(!r.n||!r.vendor||!allocated.get(r.n)?.has(r.vendor))continue;
  const key=r.n+'|'+r.vendor,a=by.get(key)||{request:null,formal:null};
  if(r.kind==='request'&&r.declined){a.request=r;}
  else if(Object.keys(r.dates||{}).length){
   const prev=a[r.kind];a[r.kind]={...r,dates:{...(prev?.declined?{}:prev?.dates||{}),...r.dates}};
  }
  by.set(key,a);
 }
 const out={};for(const [key,a] of by){
  if(a.request?.declined&&(!a.formal||a.request.at>=a.formal.at))continue;
  out[key]=pgChMailMerge_(a.request?.declined?null:a.request,a.formal);
 }
 return out;
}
function pgChMailHeader_(m,name){return (m.payload?.headers||[]).find(h=>String(h.name).toLowerCase()===name.toLowerCase())?.value||'';}
// Gmail API returns URL-safe Base64, which can omit padding.
function pgChMailDecode_(raw){
 if(Array.isArray(raw)&&raw.every(x=>Number.isInteger(x)&&x>=-128&&x<=255))return raw.map(x=>x>127?x-256:x);
 const value=String(raw||'').replace(/\s/g,'').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(!value)return [];
 if(value.length%4===1||/[^A-Za-z0-9_-]/.test(value))throw new Error('Conteúdo base64 inválido');
 const padded=value+'='.repeat((4-value.length%4)%4);
 return Utilities.base64DecodeWebSafe(padded);
}
function pgChMailText_(part){
 if(!part)return '';
 if(part.mimeType==='text/plain'&&part.body?.data)return Utilities.newBlob(pgChMailDecode_(part.body.data)).getDataAsString('UTF-8');
 const parts=part.parts||[],plain=parts.map(pgChMailText_).filter(Boolean);
 if(plain.length)return plain.join('\n');
 if(part.mimeType==='text/html'&&part.body?.data){
  return Utilities.newBlob(pgChMailDecode_(part.body.data)).getDataAsString('UTF-8').replace(/<blockquote\b[\s\S]*$/i,'').replace(/<\/(?:tr|p|div|li)>|<br\s*\/?>/gi,'\n').replace(/<\/t[dh]>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&');
 }
 return '';
}
function pgChMailImages_(part){
 if(!part)return [];
 const own=/^image\/(?:png|jpeg|gif|webp|bmp)$/i.test(part.mimeType||'')&&part.body?.size>=1000&&part.body.size<=5000000?[part]:[];
 return own.concat((part.parts||[]).flatMap(pgChMailImages_));
}
// Read the actual JSON wire representation, avoiding the advanced service's byte coercion.
function pgChMailGet_(path,stats){
 const url='https://gmail.googleapis.com/gmail/v1/users/me/'+path;
 for(let i=0;i<6;i++){
  if(Date.now()>=stats.deadline){const e=new Error('Tempo reservado à leitura de e-mails atingido');e.pgMailPartial=true;throw e;}
  const response=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  const status=response.getResponseCode(),body=response.getContentText();
  if(status>=200&&status<300)return JSON.parse(body);
  const quota=status===429||status===403&&/quota|rateLimit|resource.exhausted/i.test(body);
  if(quota&&i<5){
   const delay=Math.min(30000,2000*Math.pow(2,i));
   if(Date.now()+delay<stats.deadline){Utilities.sleep(delay);continue;}
  }
  const e=new Error('Gmail HTTP '+status+(quota?' (limite de consultas)':''));
  e.pgMailPartial=quota||status===401||status===403;throw e;
 }
}
function pgChMailOCR_(message,part,stats){
 const bytes=part.body.data||pgChMailGet_('messages/'+encodeURIComponent(message.id)+'/attachments/'+encodeURIComponent(part.body.attachmentId),stats).data;
 const blob=Utilities.newBlob(pgChMailDecode_(bytes),part.mimeType,'cronograma');
 let id='';
 try{
  const doc=Drive.Files.create({name:'PG_CH_OCR_TEMP_'+Utilities.getUuid(),mimeType:'application/vnd.google-apps.document'},blob,{ocrLanguage:'pt',fields:'id'});
  id=doc.id;
  const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'/export?mimeType=text%2Fplain';
  return UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}}).getContentText();
 }finally{if(id)try{DriveApp.getFileById(id).setTrashed(true);}catch(e){console.warn('[CH email] Falha na limpeza de OCR temporário');}}
}
function pgChMailReadThread_(id,allocated,stats,meta){
 const thread=pgChMailGet_('threads/'+encodeURIComponent(id)+'?format=full',stats),messages=(thread.messages||[]).slice().sort((a,b)=>Number(a.internalDate)-Number(b.internalDate));
 if(!messages.length)return [];
 const root=messages[0],subject=pgChMailSubject_(pgChMailHeader_(root,'Subject'));
 if(meta){meta.n=subject?.n||'';meta.history=String(thread.historyId||'');}
 if(!subject||!allocated.has(subject.n))return [];
 const allowed=allocated.get(subject.n),initialVendors=[...new Set(pgChMailDomains_(pgChMailHeader_(root,'To')+' '+pgChMailHeader_(root,'Cc')).map(pgChMailVendor_).filter(v=>allowed.has(v)))];
 if(initialVendors.length!==1)return [];
 const vendor=initialVendors[0],out=[];
 for(let i=subject.kind==='request'?1:0;i<messages.length;i++){
  const m=messages[i],sender=pgChMailDomains_(pgChMailHeader_(m,'From')),external=sender.some(d=>pgChMailVendor_(d)===vendor),internal=sender.some(d=>/(^|\.)arcoeducacao\.com\.br$/.test(d));
  if(!external&&!internal)continue;
  let body='';try{body=pgChMailClean_(pgChMailText_(m.payload));}catch(e){stats.decodeErrors=(stats.decodeErrors||0)+1;console.warn('[CH email] Conteúdo de mensagem não decodificado: '+e.message);}
  const norm=pgChMailNorm_(body),at=Number(m.internalDate);
  if(external&&/declinando|nao (?:conseguimos|podemos) atender|desconsiderar (?:a |esta )?consulta/.test(norm)&&!/cronograma|nova data|melhor data|data estimada/.test(norm)){out.push({n:subject.n,vendor,kind:subject.kind,at,thread:id,declined:true,dates:{}});continue;}
  if(subject.kind==='request'&&!external)continue;
  let text=body,dates=pgChMailParse_(text,at);
  if(external&&subject.kind==='request'&&(!dates.file||!dates.approval||!dates.pickup)){
   for(const p of pgChMailImages_(m.payload)){
    try{const ocr=pgChMailOCR_(m,p,stats);stats.ocr++;if(ocr)text+='\n'+ocr;}
    catch(e){if(e.pgMailPartial)throw e;stats.ocrErrors++;console.warn('[CH email] OCR não concluído em mensagem de cronograma');}
   }
   dates=pgChMailParse_(text,at);
  }
  if(Object.keys(dates).length)out.push({n:subject.n,vendor,kind:subject.kind,at,thread:id,dates});
 }
 return out;
}
// Durable checkpoint contains only extracted dates and identifiers, never message bodies.
const PG_CH_MAIL_STORE='PG_CH_MAIL_CHECKPOINT_V2';
function pgChMailScope_(allocated,n){return Array.from(allocated.get(n)||[]).sort().join('|');}
function pgChMailLoad_(){
 const id=PropertiesService.getScriptProperties().getProperty(PG_CH_MAIL_STORE);
 if(!id)return {id:'',entries:{},scan:null};
 // Do not replace a checkpoint that could not be read.
 const doc=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
 if(!doc.entries||typeof doc.entries!=='object')throw Error('Checkpoint de cronogramas inválido');
 return {id,entries:doc.entries,scan:doc.scan||null};
}
function pgChMailSave_(old,entries,scan){
 const file=DriveApp.getFolderById(PASTA_CACHE_ID).createFile(Utilities.newBlob(JSON.stringify({entries,scan}),'application/json','PG_CH_MAIL_'+Utilities.getUuid()+'.json'));
 PropertiesService.getScriptProperties().setProperty(PG_CH_MAIL_STORE,file.getId());
 if(old)try{DriveApp.getFileById(old).setTrashed(true);}catch(e){console.warn('[CH email] Limpeza do checkpoint');}
}
function pgChMailListPage_(window,stats){
 const q='{subject:"Solicitação de prazo" subject:"Formalização da produção"} after:'+window.from+' before:'+window.to+' -in:trash -in:spam';
 if(Date.now()>=stats.deadline)throw Error('Tempo reservado à listagem atingido');
 return Gmail.Users.Threads.list('me',{q,maxResults:100,pageToken:window.token||undefined});
}
function pgChLerAcordos_(spg){
 const effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
 if(effective!=="leonardo.pereira@arcoeducacao.com.br")throw new Error('A leitura de acordos exige a conta autorizada do portal.');
 const allocated=new Map(),starts=[];
 for(const r of spg||[]){
  const n=pgChNumero_(r.n),vendor=pgChGraf_(r.printer),d=pgChData_(r.created);
  if(!n||!vendor||/CANCEL/.test(pgChNormal_(r.status)))continue;
  if(!allocated.has(n))allocated.set(n,new Set());allocated.get(n).add(vendor);if(d)starts.push(d);
 }
 const stats={threads:0,ocr:0,ocrErrors:0,decodeErrors:0,matched:0,cached:0,read:0,partial:false,deadline:Date.now()+85000};
 if(!allocated.size){delete stats.deadline;return {agreements:{},stats};}
 const saved=pgChMailLoad_(),entries=saved.entries;
 const cutoff=Math.floor(Date.now()/1000),start=Math.floor(Date.parse((starts.sort()[0]||'2026-09-01')+'T00:00:00-03:00')/1000)-1;
 const scan=saved.scan||{cursor:cutoff,historical:{from:start,to:cutoff+1,token:'',done:false},recent:null,pending:{}};
 scan.pending=scan.pending||{};
 const pending=scan.pending;
 // Reopen only previously unknown or changed allocations, not all processed mail.
 for(const [id,e] of Object.entries(entries)){
  const scope=pgChMailScope_(allocated,e.n);
  if((e.n&&scope!==e.scope&&scope)||e.retry||(e.parser!==2&&!e.n))if(!pending[id])pending[id]={history:e.history||'',priority:1};
 }
 if(start<scan.historical.from){scan.historical={from:start,to:scan.historical.from+1,token:'',done:false};}
 // A fixed bounded window is resumed until completely enumerated. Keep a small overlap at its boundary.
 if(!scan.recent&&cutoff>scan.cursor)scan.recent={from:Math.max(start,scan.cursor-2),to:cutoff+1,token:''};
 function list(window,priority){
  const page=pgChMailListPage_(window,stats);
  for(const t of page.threads||[]){
   stats.threads++;
   const old=entries[t.id],history=String(t.historyId||'');
   const same=old&&!old.retry&&old.scope===pgChMailScope_(allocated,old.n)&&old.n&&((history&&history===String(old.history))||(!history&&priority===1));
   if(same){stats.cached++;continue;}
   const queued=pending[t.id];
   pending[t.id]={history:history||queued?.history||'',priority:Math.max(priority,queued?.priority||0)};
  }
  window.token=page.nextPageToken||'';
  return !window.token;
 }
 let quota=false;
 if(scan.recent)try{
  if(list(scan.recent,2)){scan.cursor=scan.recent.to-1;scan.recent=null;}
 }catch(e){stats.partial=true;quota=/quota|rate.limit|limite|429|403/i.test(String(e.message||e));if(!quota&&/page.?token|invalid.*token/i.test(String(e.message||e)))scan.recent.token='';console.warn('[CH email] Listagem incremental parcial');}
 function process(priority,limit){
  const ids=Object.keys(pending).filter(id=>pending[id].priority===priority).sort((a,b)=>Number(!!entries[a]?.retry)-Number(!!entries[b]?.retry));
  for(const id of ids.slice(0,limit)){
   if(Date.now()>=stats.deadline||quota)break;
   const q=pending[id],old=entries[id],meta={},before=stats.ocrErrors,beforeDecode=stats.decodeErrors;
   try{
    const rows=pgChMailReadThread_(id,allocated,stats,meta),retry=stats.ocrErrors!==before||stats.decodeErrors!==beforeDecode;
    const n=meta.n||old?.n||'';
    entries[id]={history:String(meta.history||q.history||old?.history||''),n,scope:pgChMailScope_(allocated,n),rows:retry?(old?.rows||[]).concat(rows):rows,retry,parser:2};
    stats.read++;
    if(retry){pending[id].priority=1;stats.partial=true;}else delete pending[id];
   }catch(e){stats.partial=true;if(old)old.retry=true;if(e.pgMailPartial){quota=true;break;}pending[id].priority=1;console.warn('[CH email] Leitura parcial');}
  }
 }
 process(2,12);
 // Recover history only after new messages; never re-enumerate an already completed history.
 if(!quota&&!scan.historical.done&&Object.keys(pending).filter(id=>pending[id].priority===1).length<25)try{
  scan.historical.done=list(scan.historical,1);
 }catch(e){stats.partial=true;quota=/quota|rate.limit|limite|429|403/i.test(String(e.message||e));if(!quota&&/page.?token|invalid.*token/i.test(String(e.message||e)))scan.historical.token='';console.warn('[CH email] Listagem histórica parcial');}
 if(!quota&&!Object.values(pending).some(q=>q.priority===2))process(1,Math.max(0,18-stats.read));
 stats.partial=stats.partial||!!scan.recent||!scan.historical.done||Object.keys(pending).length>0;
 stats.pending=Object.keys(pending).length;stats.historyComplete=scan.historical.done;stats.cursor=scan.cursor;
 try{pgChMailSave_(saved.id,entries,scan);}catch(e){stats.partial=true;console.warn('[CH email] Checkpoint não gravado');}
 const records=Object.values(entries).flatMap(e=>e.rows||[]),agreements=pgChMailSelect_(records,allocated);
 stats.matched=Object.keys(agreements).length;delete stats.deadline;
 console.log('[CH email] '+JSON.stringify(stats));return {agreements,stats};
}
function pgChAplicarAcordo_(it,t,agreements){
 const key=pgChNumero_(t.n)+'|'+pgChGraf_(it.printer),a=it.printer&&!it.legacy?agreements?.[key]:null;
 if(!a)return;
 const stages={file:0,proof:1,approval:2,printEnd:3,pickup:10,delivery:11};
 for(const [field,i] of Object.entries(stages)){
  const evidence=a[field];if(!evidence||!it.stages[i])continue;
  const s=it.stages[i];if(evidence.value==='ACERVO')s.agreedStatus='ACERVO';else s.agreed=pgChData_(evidence.value);
  s.agreedSource=evidence.source;s.agreedThread=evidence.thread;
 }
 if(a.machine&&a.machine.value!=='ACERVO'){it.stages[3].agreedStart=pgChData_(a.machine.value);it.stages[3].agreedStartSource=a.machine.source;}
}
