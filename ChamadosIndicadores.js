function pgChIndiceEspec_(rows) {
  const idx=new Map();
  rows.forEach(r=>{
    if(!r.sku || !r.brand)return;
    pgChAdd_(idx,pgChSku_(r.sku)+'|'+pgChMarca_(r.brand),r);
  });
  return idx;
}
function pgChAtributos_(idx,it) {
  const fichas=idx.get(pgChSku_(it.sku)+'|'+pgChMarca_(it.brand))||[];
  const clean=values=>pgChUnicos_(values.map(pgChTexto_)).sort();
  const list=(key)=>clean(fichas.map(r=>r[key]));
  const cuts=fichas.flatMap(r=>['cut','cut0','cut1','cut2','cut3','cut4','cut5','cut6'].map(k=>pgChNormal_(r[k])));
  const features=[];
  if(cuts.some(v=>['TRUE','SIM','1'].includes(v))||it.legacy&&it.spg.some(r=>['SIM','TRUE','1'].includes(pgChNormal_(r.cut))))features.push('Corte e vinco');
  if(list('cover').some(v=>pgChNormal_(v)==='DURA'))features.push('Capa dura');
  if([it.desc,...list('description')].some(s=>/\bMONTAVE(?:L|IS)\b/.test(pgChNormal_(s))))features.push('Montável');
  return {printer:pgChGrafNome_(it.printer),cd:pgChCDNome_(it.cd),series:clean(fichas.flatMap(r=>pgChTexto_(r.series).split(/[;|]/))),
    material:list('material'),feature:features,cover:list('cover'),finish:list('finish'),specRows:fichas.map(r=>r.row)};
}
// Data em que a soma da própria rota atinge a tiragem. Um excedente posterior
// ou de outro SKU nunca desloca a data de conclusão.
function pgChDataIntegral_(events,qty,dateField,qtyField) {
  if(!(qty>0))return '';
  let done=0;
  const dated=events.filter(m=>m[dateField] && m[qtyField]>0).sort((a,b)=>a[dateField].localeCompare(b[dateField]));
  for(const e of dated){done+=e[qtyField];if(done>=qty)return e[dateField];}
  return '';
}
function pgChMarcoItens_(items,key) {
  return items.length && items.every(r=>r[key])?pgChUltima_(items.map(r=>r[key])):'';
}
// Datas consolidadas da própria etapa. Cobertura inferida não cria data real.
function pgChDatasEtapas_(items) {
  const routes=(items||[]).filter(it=>it.qty>0);
  return PG_CH_ETAPAS.map((_,k)=>{
    const stages=routes.map(it=>(it.stages||[])[k]||{});
    const real=stages.map(s=>pgChData_(s.r)),complete=real.length>0&&real.every(Boolean);
    const agreed=stages.map(s=>pgChData_(s.agreed)),starts=stages.map(s=>pgChData_(s.agreedStart));
    return {agreed:agreed.length&&agreed.every(Boolean)?pgChUltima_(agreed):'',agreedStart:starts.length&&starts.every(Boolean)?pgChUltima_(starts):'',agreedStatus:stages.length&&stages.every(s=>s.agreedStatus==='ACERVO')?'ACERVO':'',agreedSource:pgChUnicos_(stages.map(s=>s.agreedSource)).join(' + '),agreedStartSource:pgChUnicos_(stages.map(s=>s.agreedStartSource)).join(' + '),p:pgChUltima_(stages.map(s=>pgChData_(s.p))),r:complete?pgChUltima_(real):'',
      a:!complete&&real.some(Boolean)?'Parcial':pgChUnicos_(stages.map(s=>pgChTexto_(s.a))).join(' / '),
      f:pgChUnicos_(stages.flatMap(s=>pgChTexto_(s.f).split(/\s+\+\s+/))).join(' + ')};
  });
}
function pgChMetricaChamado_(t,idx,costHistory) {
  const groups=new Map(),routes=[];
  for(const it of t.items){
    const attributes=pgChAtributos_(idx,it);it.attributes=attributes;
    const specs=idx.get(pgChSku_(it.sku)+'|'+pgChMarca_(it.brand))||[];
    const pages=[...new Set(specs.map(s=>pgChTexto_(s.pages)).filter(v=>/^\d+$/.test(v)).map(Number))];
    it.pages=pages.length===1?pages[0]:null;
    it.commercial=pgChComercialItem_(t,it,costHistory);
    const sp=it.spg.filter(r=>r.q>0);
    const delivery=it.deliveryEvidence?.date||it.stages?.[11]?.r||'';
    const collection=it.collection||pgChColetaRota_(it),pick=collection.date;
    const formal=pgChMarcoItens_(sp,'formal');
    const routePanel=(t.panel||[]).filter(p=>pgChGraf_(p.printer)===pgChGraf_(it.printer)&&pgChCD_(p.cd)===pgChCD_(it.cd));
    const prepressEnd=pgChData_(it.stages?.[2]?.r)||pgChMarcoItens_(routePanel,'startR');
    const deadlines=pgChUnicos_(sp.map(r=>r.formal));
    let late=!!(pick && formal && pick>formal),unverified=false;
    if(formal && deadlines.length>1){
      // Entregas de kits com compromissos diferentes exigem evidência de coleta por kit.
      for(const part of sp){
        const events=collection.events.filter(m=>part.kit && m.kit===part.kit);
        const collected=pgChDataIntegral_(events,part.q,'date','qty');
        if(!collected)unverified=true;else if(collected>part.formal)late=true;
      }
    }
    if(it.qty>0)routes.push({sku:it.sku,printer:it.printer,cd:it.cd,qty:it.qty,delivery,pick,formal,prepressEnd,late,unverified,source:delivery?it.stages[11].f:'',dimensions:attributes,coverage:it.coverage.slice(),picked:Math.min(it.qty,it.picked),productionStatus:it.productionStatus.label,collection:{events:collection.events,parts:collection.parts,source:collection.source,maps:collection.maps,authoritativePick:collection.authoritativePick||'',chronologyException:!!collection.chronologyException,spgDate:pgChDataIntegral_(sp.filter(s=>!s.legacy&&s.pick&&(!s.delivery||s.pick<=s.delivery)).map(s=>({date:s.pick,qty:s.q})),it.qty,'date','qty')}});
    const {specRows,...dims}=attributes,key=JSON.stringify(dims);
    let g=groups.get(key);
    if(!g){
      g={...dims,qty:0,mapped:0,picked:0,delivered:0,balance:0,coverage:it.stages.map(()=>0),eta:'',partial:false,production:[],targetItems:[],stageItems:[],commercial:[]};
      groups.set(key,g);
    }
    g.qty+=it.qty;const label=it.productionStatus.label,prev=g.production.find(x=>x.label===label);if(prev)prev.qty+=it.qty;else g.production.push({label,qty:it.qty});
    ['mapped','picked','delivered'].forEach(k=>g[k]+=Math.min(it.qty,it[k]));
    g.balance+=Math.max(0,it.qty-it.delivered);
    for(let i=0;i<it.coverage.length;i++)g.coverage[i]+=it.coverage[i];
    g.commercial.push(it.commercial);g.targetItems.push({qty:it.qty,target:it.target});g.stageItems.push(it);g.eta=pgChUltima_([g.eta,it.eta]);g.partial=g.partial||it.etaPartial;
  }
  const delivered=pgChMarcoItens_(routes,'delivery');
  t.ocValues=pgChOCsResumo_(t);
  return {ocValues:t.ocValues,allocated:pgChData_(t.steps['Alocação']?.r),stages:pgChDatasEtapas_(t.items),groups:Array.from(groups.values(),g=>{g.target=pgChPrazoResumo_(g.targetItems);g.stages=pgChDatasEtapas_(g.stageItems);delete g.targetItems;delete g.stageItems;return g;}),closed:t.steps['Conclusão']?.r||'',canceled:t.steps.Cancelamento?.r||'',
    delivered,deliverySource:delivered?pgChUnicos_(routes.map(r=>r.source)).join(' + '):'',
    pickDone:pgChMarcoItens_(routes,'pick'),pickDue:pgChMarcoItens_(routes,'formal'),
    pickLate:routes.some(r=>r.late),pickUnverified:routes.some(r=>r.unverified),okrRoutes:routes,pickMaps:pgChUnicos_(routes.flatMap(r=>r.collection.maps)),pickSource:pgChUnicos_(routes.map(r=>r.collection.source)).join(' + '),owner:t.owner||''};
}

function pgChStatusRota_(t,it,panel){
  const q=it.qty,c=it.coverage,st=it.stages,full=k=>q>0&&(c[k]||0)>=q,any=k=>(c[k]||0)>0;
  const state=pgChNormal_(t.status),notes=pgChUnicos_((panel||[]).map(p=>pgChNormal_(p.status)));
  const has=s=>notes.some(n=>n.includes(s)),result=(label,source)=>({label,source});
  if(/CANCEL/.test(state))return result('Cancelado','SPG');
  if(full(11))return result('Entregue integralmente',st[11]?.f||'Mapa');
  if(any(11)&&full(10))return result('Entrega parcial · saldo em trânsito',st[11]?.f||'Mapa');
  if(full(10))return result('Em trânsito',st[10]?.f||'Mapa');
  if(any(10))return result('Coleta parcial',st[10]?.f||'Mapa');
  if(it.legacy&&has('GESTAO TIME COMPRAS'))return result('Gestão time Compras','Painel de produção');
  if(!it.printer)return result(/SOLICITADO/.test(state)&&!t.steps?.Liberação?.r?'Aguardando liberação':'Em alocação','SPG');
  if(full(6)){
    if(full(9))return result('Aguardando coleta','Mapa');
    if(has('FATURAMENTO'))return result('Em faturamento','Painel de produção');
    if(full(7)&&full(8))return result('Pronto para coleta','Produção / custos / OC');
    if(!full(7))return result('Em validação de custos','Produção / custos');
    return result('Aguardando OC','Custos / OC');
  }
  if(st[5]?.a==='Em andamento'||has('FORMACAO DE KIT'))return result('Em produção · Formação de kit','Painel de produção');
  if(st[4]?.a==='Em andamento'||has('ACABAMENTO'))return result('Em produção · Acabamento','Painel de produção');
  if(st[3]?.a==='Em andamento'||has('IMPRESSAO'))return result('Em produção · Impressão','Painel de produção');
  if(has('GESTAO TIME COMPRAS'))return result('Gestão time Compras','Painel de produção');
  if(any(5))return result('Formação de kit parcial','PCP');
  if(full(4))return result('Aguardando formação de kit','PCP');
  if(any(4))return result('Acabamento parcial','PCP');
  if(full(3))return result('Aguardando acabamento','PCP');
  if(any(3))return result('Impressão parcial','PCP');
  if(full(2))return result('Aguardando entrada em máquina','Calendário');
  if(full(1))return result('Aguardando aprovação de boneco','Calendário');
  if(full(0))return result('Aguardando recebimento de boneco','Calendário');
  if(/CONCLU/.test(state))return result(it.legacy?'Concluído no painel':'Encerrado no SPG',it.legacy?'Painel de produção':'SPG');
  if(/VALIDADO/.test(state))return result('Custos validados · produção pendente','SPG');
  return result('Aguardando envio de arquivo','Calendário / SPG');
}
function pgChResumoStatus_(items){
  const by=new Map();
  items.filter(it=>it.qty>0).forEach(it=>{const k=it.productionStatus?.label||'Sem etapa registrada';by.set(k,(by.get(k)||0)+it.qty);});
  return Array.from(by,([label,qty])=>({label,qty})).sort((a,b)=>b.qty-a.qty);
}

function pgChLeadDays_(a,b){a=pgChData_(a);b=pgChData_(b);if(!a||!b)return null;const n=Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);return n>=0&&n<=180?n:null;}
function pgChLeadAdd_(a,n){return a?new Date(Date.parse(a+'T00:00:00Z')+n*86400000).toISOString().slice(0,10):'';}
function pgChLeadProfile_(rows){
 const by=new Map(),dedup=new Map(),base=[2,1,10,3,1,1,1];
 for(const r of rows||[]){
  if(!r.n||!/CONCLU|ENTREGUE/.test(pgChNormal_(r.status)))continue;
  const brand=pgChMarca_(r.brand),printer=pgChGraf_(r.printer),cd=pgChCD_(r.cd),key=[r.n,brand,printer,cd].join('|');
  const ds=[[r.created,r.allocated],[r.allocated,r.startR],[r.startR,r.endR],[r.endR,r.costDate],[r.ocRequest,r.ocSent],[r.endR,r.pickup],[r.pickup,r.delivered]].map(([a,b])=>pgChLeadDays_(a,b));
  const prev=dedup.get(key);if(!prev)dedup.set(key,{brand,printer,cd,ds});else ds.forEach((v,k)=>{if(v!==null)prev.ds[k]=prev.ds[k]===null?v:Math.max(v,prev.ds[k]);});
 }
 for(const r of dedup.values())for(const key of ['*','M|'+r.brand,'G|'+r.printer,'MG|'+r.brand+'|'+r.printer,'R|'+r.brand+'|'+r.printer+'|'+r.cd]){
  if(!by.has(key))by.set(key,base.map(()=>[]));r.ds.forEach((v,k)=>{if(v!==null)by.get(key)[k].push(v);});
 }
 const stats=new Map();for(const [key,ds] of by)stats.set(key,ds.map(a=>{a.sort((x,y)=>x-y);return {n:a.length,median:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null};}));
 return {stats,n:dedup.size,base};
}
function pgChPrazoRota_(t,it,profile,slaDays){
 if(!t.created)return null;
 const brand=pgChMarca_(t.brand),graf=pgChGraf_(it.printer),cd=pgChCD_(it.cd),keys=['R|'+brand+'|'+graf+'|'+cd,'MG|'+brand+'|'+graf,'G|'+graf,'M|'+brand,'*'];
 const targets=profile.base.map((fallback,k)=>{for(const key of keys){const x=profile.stats.get(key)?.[k];if(x&&x.n>=10)return {v:x.median,n:x.n,key};}return {v:fallback,n:0,key:'META'};});
 const transit=slaDays!=null&&Number.isFinite(Number(slaDays))?Math.max(0,Number(slaDays)):Math.max(1,Math.ceil(targets[6].v));
 const deadline=pgChLeadAdd_(t.created,25);
 // O compromisso mais cedo da própria rota protege todos os kits.
 const parts=(it.spg||[]).filter(s=>s.q>0);
 const valid=v=>pgChDataRealChamado_(v,t.created);
 const earliest=a=>a.filter(Boolean).sort()[0]||'';
 const formal=earliest(parts.map(s=>valid(s.formal)))||valid(it.stages?.[10]?.agreed);
 const planned=earliest(parts.map(s=>valid(s.pickP)))||valid(it.stages?.[10]?.p);
 const limit=pgChLeadAdd_(deadline,-Math.min(25,Math.ceil(transit)));
 const pickup=formal||planned||limit;
 const safePickup=[pickup,limit].sort()[0];
 const available=Math.max(0,pgChLeadDays_(t.created,safePickup)||0);
 const weights=[Math.max(1,targets[0].v),Math.max(1,targets[1].v),Math.max(1,targets[2].v),Math.max(1,targets[5].v)];
 const total=weights.reduce((a,b)=>a+b,0),budget=weights.map(w=>available*w/total);
 const alloc=Math.round(budget[0]),preEnd=Math.round(budget[0]+budget[1]),prodEnd=Math.round(budget[0]+budget[1]+budget[2]),pre=preEnd-alloc,prod=prodEnd-preEnd;
 // Preserva a distribuição proporcional original dos blocos históricos, com a
 // janela limitada pela coleta e pelo prazo máximo de 25 dias menos transporte.
 const dates=[alloc,alloc+Math.round(pre*.5),preEnd,preEnd+Math.round(prod*.5),preEnd+Math.round(prod*.85),prodEnd,prodEnd,Math.min(available,prodEnd+Math.ceil(targets[3].v)),Math.min(available,prodEnd+Math.ceil(targets[3].v+targets[4].v)),available].map(n=>pgChLeadAdd_(t.created,Math.min(available,Math.max(0,n)))).concat([pickup,deadline]);
 const target={dates,deadline,allocation:pgChLeadAdd_(t.created,alloc),transit,pickupAnchor:pickup,safePickup,pickupAnchorSource:formal?'Formalizada':planned?'Prevista':'Prazo de 25 dias menos SLA (estimativa)',compressed:transit>25||total>available||pickup>limit,profile:targets};
 return pgChProximaEtapa_(target,it.qty,it.coverage);
}
function pgChProximaEtapa_(target,qty,coverage){
 if(!target||!qty||!Array.isArray(coverage))return target;
 const full=k=>(coverage[k]||0)>=qty;
 const pending=full(11)?[]:full(10)?[11]:[0,1,2,3,4,5,6,7,8,9,10].filter(k=>!full(k)).sort((a,b)=>(target.dates[a]||'').localeCompare(target.dates[b]||''));
 const next=pending[0]??-1;
 return {...target,next:next<0?'':target.dates[next]||target.deadline||'',nextStage:next};
}
function pgChPrazoResumo_(items){
 const valid=items.filter(it=>it.qty>0&&it.target);if(!valid.length)return null;const pending=valid.filter(it=>it.target.next).sort((a,b)=>a.target.next.localeCompare(b.target.next));
 return {dates:PG_CH_ETAPAS.map((_,k)=>k<10?valid.map(it=>it.target.dates[k]).filter(Boolean).sort()[0]||'':pgChUltima_(valid.map(it=>it.target.dates[k]))),deadline:pgChUltima_(valid.map(it=>it.target.deadline)),next:pending[0]?.target.next||'',nextStage:pending[0]?.target.nextStage??-1};
}

// A linha real do SPG é prioritária. As fontes da mesma rota só complementam
// unidades ainda sem registro; nunca substituem a data real de uma parcela SPG.
function pgChCompletarEventosRota_(sp,primary,fallback,qty,field){
 const total=arr=>arr.reduce((n,e)=>n+e.qty,0);
 const limit=qty,events=[];
 function add(e,max){const n=Math.min(max,e.qty,Math.max(0,limit-total(events)));if(n>0)events.push({...e,qty:n});return n;}
 for(const e of primary)add(e,qty);
 if(total(events)>=qty)return events;
 if(!primary.length){for(const e of fallback.slice().sort((a,b)=>a.date.localeCompare(b.date)))add(e,qty);return events;}
 const known=new Set(primary.map(e=>e.kit).filter(Boolean)),pending=new Map();
 if(primary.every(e=>e.kit))for(const s of sp)if(!s[field]&&s.kit&&!known.has(s.kit))pending.set(s.kit,(pending.get(s.kit)||0)+s.q);
 for(const e of fallback.slice().sort((a,b)=>a.date.localeCompare(b.date))){
   const n=add(e,pending.get(e.kit)||0);if(n)pending.set(e.kit,pending.get(e.kit)-n);
 }
 // A comprovação integral da mesma rota também cobre seu saldo, mesmo quando
 // a fonte de transporte não informa kit. Não atribui essa parcela a outro kit.
 const full=pgChDataIntegral_(fallback,qty,'date','qty');
 if(full&&total(events)<qty){
   const date=pgChUltima_([full,...events.map(e=>e.date)]);
   const source=pgChUnicos_(fallback.filter(e=>e.date<=full).map(e=>e.source)).join(' + ');
   add({date,qty:qty-total(events),kit:'',map:'',source},qty);
 }
 return events;
}
function pgChEntregaRota_(it){
 const q=it.qty,sp=it.spg.filter(s=>s.q>0),maps=it.maps||[];
 const primary=sp.filter(s=>!s.legacy&&s.delivery).map(s=>({date:s.delivery,qty:s.q,kit:s.kit||'',map:'',source:'SPG · Entrega real'}));
 const fullPick=pgChDataIntegral_(sp.filter(s=>s.pick).map(s=>({date:s.pick,qty:s.q})),q,'date','qty');
 const fallback=maps.filter(m=>m.delivery&&m.delivered>0&&(!fullPick||m.delivery>=fullPick)&&!sp.some(s=>s.kit&&s.kit===m.kit&&s.pick>m.delivery)).map(m=>({date:m.delivery,qty:Math.min(m.qty,m.delivered),kit:m.kit||'',map:m.map||'',source:m.tpDeliveryRow?'Transportes':'Mapa'}));
 const events=pgChCompletarEventosRota_(sp,primary,fallback,q,'delivery');
 const delivered=Math.min(q,events.reduce((n,e)=>n+e.qty,0));
 const date=pgChDataIntegral_(events,q,'date','qty');
 return {delivered,date,events,source:pgChUnicos_(events.map(e=>e.source)).join(' + ')};
}
function pgChColetaRota_(it){
 const q=it.qty,sp=it.spg.filter(s=>s.q>0),maps=it.maps||[];
 // Data escolhida entre Painel/SPG: não pode ser substituída por outra evidência.
 if(sp.length&&sp.every(s=>s.preferredPick)){
  const chronologyException=sp.some(s=>s.pickException),source=chronologyException?'SPG · Coleta real (dados do Painel)':'Painel de produção · Histórico';
  const events=sp.map(s=>({date:s.preferredPick,qty:s.q,kit:s.kit||'',map:'',source}));
  const date=pgChDataIntegral_(events,q,'date','qty');
  return {picked:q,date,events,source,maps:pgChUnicos_(maps.map(m=>m.map)),parts:sp.map(s=>({kit:s.kit||'',qty:s.q,due:s.formal||''})),authoritativePick:date,chronologyException};
 }
 const primary=sp.filter(s=>s.pick&&(!s.delivery||s.pick<=s.delivery)).map(s=>({date:s.pick,qty:s.q,kit:s.kit||'',map:'',source:s.legacy?'Painel de produção · Histórico':'SPG · Coleta real'}));
 const spgDelivery=pgChDataIntegral_(sp.filter(s=>!s.legacy&&s.delivery).map(s=>({date:s.delivery,qty:s.q})),q,'date','qty');
 const mapEvents=maps.filter(m=>m.pick&&m.qty>0&&(!spgDelivery||m.pick<=spgDelivery)&&!sp.some(s=>!s.legacy&&s.kit&&s.kit===m.kit&&s.delivery&&m.pick>s.delivery)).map(m=>({date:m.pick,qty:m.qty,kit:m.kit||'',map:m.map||'',source:m.tpPickRow?'Transportes':'Mapa'}));
 // O painel histórico conserva a regra anterior: mapa integral prevalece sobre
 // datas históricas do painel. Para o SPG, o realizado sempre prevalece.
 const legacyMap=it.legacy&&pgChDataIntegral_(mapEvents,q,'date','qty');
 const events=pgChCompletarEventosRota_(sp,legacyMap?[]:primary,mapEvents,q,'pick');
 // Entrega integral da mesma rota comprova a coleta. Só completa o saldo sem data.
 const delivery=it.deliveryEvidence||pgChEntregaRota_(it),remaining=Math.max(0,q-events.reduce((n,e)=>n+e.qty,0));
 if(remaining>0&&delivery.delivered>=q&&delivery.date&&events.every(e=>e.date<=delivery.date))events.push({date:delivery.date,qty:remaining,kit:'',map:'',source:'Entrega real · referência para coleta'});
 const mapPhysical=maps.reduce((n,m)=>n+Math.max(0,m.pick?m.qty:Math.min(m.qty,m.delivered)),0);
 const picked=Math.min(q,Math.max(mapPhysical,it.deliveryEvidence?.delivered||0,events.reduce((n,e)=>n+e.qty,0)));
 const date=pgChDataIntegral_(events,q,'date','qty');
 return {picked,date,events,source:pgChUnicos_(events.map(e=>e.source)).join(' + '),maps:pgChUnicos_(maps.map(m=>m.map)),parts:sp.map(s=>({kit:s.kit||'',qty:s.q,due:s.formal||''}))};
}
