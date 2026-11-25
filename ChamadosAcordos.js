// Central de Chamados: leitura de cronogramas, sem enviar ou modificar mensagens.
function pgChMailNorm_(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function pgChMailSubject_(v){
 const m=pgChMailNorm_(v).match(/(?:^|\b)(solicitacao de prazo|formalizacao da producao)\s*:\s*chamado\s+(\d+)\b/);
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
 ['printEnd',/(?:data\s+(?:de\s+)?)?(?:fim|termino|conclusao)\s+(?:de|da)\s+impressao/],
 ['proof',/(?:data\s+(?:de\s+)?)?(?:envio|recebimento)\s+d[oe]s?\s+bonecos?/],
 ['file',/(?:data\s+(?:de\s+)?)?(?:envio\s+d[oe]s?\s+arquivos?|arquivo(?:s)?)/],
 ['pickup',/(?:disponibilizacao\s+para\s+coleta|(?:data\s+(?:da|de)\s+)?coleta(?:\s+(?:desejada|sugerida|respondida|estimada|formalizada))?|prazo\s+(?:respondido|sugerido))/],
 ['delivery',/(?:data\s+(?:de\s+)?)?entrega\s+(?:no|ao|em)\s+cd/]
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
function pgChMailOCR_(message,part){
 const bytes=part.body.data||Gmail.Users.Messages.Attachments.get('me',message.id,part.body.attachmentId).data;
 const blob=Utilities.newBlob(pgChMailDecode_(bytes),part.mimeType,'cronograma');
 let id='';
 try{
  const doc=Drive.Files.create({name:'PG_CH_OCR_TEMP_'+Utilities.getUuid(),mimeType:'application/vnd.google-apps.document'},blob,{ocrLanguage:'pt',fields:'id'});
  id=doc.id;
  const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'/export?mimeType=text%2Fplain';
  return UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}}).getContentText();
 }finally{if(id)try{DriveApp.getFileById(id).setTrashed(true);}catch(e){console.warn('[CH email] Falha na limpeza de OCR temporário');}}
}
function pgChMailReadThread_(id,allocated,stats){
 const thread=Gmail.Users.Threads.get('me',id,{format:'full'}),messages=(thread.messages||[]).slice().sort((a,b)=>Number(a.internalDate)-Number(b.internalDate));
 if(!messages.length)return [];
 const root=messages[0],subject=pgChMailSubject_(pgChMailHeader_(root,'Subject'));
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
    try{const ocr=pgChMailOCR_(m,p);stats.ocr++;if(ocr)text+='\n'+ocr;}
    catch(e){stats.ocrErrors++;console.warn('[CH email] OCR não concluído em mensagem de cronograma');}
   }
   dates=pgChMailParse_(text,at);
  }
  if(Object.keys(dates).length)out.push({n:subject.n,vendor,kind:subject.kind,at,thread:id,dates});
 }
 return out;
}
function pgChLerAcordos_(spg){
 const effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
 if(effective!=='leonardo.pereira@arcoeducacao.com.br')throw new Error('A leitura de acordos exige a conta administradora do portal.');
 const allocated=new Map(),starts=[];
 for(const r of spg||[]){
  const n=pgChNumero_(r.n),vendor=pgChGraf_(r.printer),d=pgChData_(r.created);
  if(!n||!vendor||/CANCEL/.test(pgChNormal_(r.status)))continue;
  if(!allocated.has(n))allocated.set(n,new Set());allocated.get(n).add(vendor);if(d)starts.push(d);
 }
 const stats={threads:0,ocr:0,ocrErrors:0,decodeErrors:0,matched:0},records=[];
 if(!allocated.size)return {agreements:{},stats};
 const date=(starts.sort()[0]||'2026-09-01').replace(/-/g,'/'),cache=CacheService.getScriptCache();
 let next;
 do{
  const page=Gmail.Users.Threads.list('me',{q:'{subject:"Solicitação de prazo" subject:"Formalização da produção"} after:'+date+' -in:trash -in:spam',maxResults:100,pageToken:next});
  for(const t of page.threads||[]){
   stats.threads++;
   const key='PGCHMAIL_V1_'+t.id+'_'+(t.historyId||'');
   let cached=t.historyId?cache.get(key):null,rows;
   if(cached){rows=JSON.parse(cached).filter(r=>allocated.get(r.n)?.has(r.vendor));}
   else{
    const before=stats.ocrErrors,beforeDecode=stats.decodeErrors;rows=pgChMailReadThread_(t.id,allocated,stats);
    if(t.historyId&&rows.length&&stats.ocrErrors===before&&stats.decodeErrors===beforeDecode)try{cache.put(key,JSON.stringify(rows),21600);}catch(e){}
   }
   records.push(...rows);
  }
  next=page.nextPageToken;
 }while(next);
 const agreements=pgChMailSelect_(records,allocated);stats.matched=Object.keys(agreements).length;return {agreements,stats};
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
