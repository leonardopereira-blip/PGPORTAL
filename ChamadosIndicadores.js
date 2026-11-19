function pgChIndiceEspec_(rows) {
  const idx=new Map();
  rows.forEach(r=>{
    if(!r.sku || !r.brand)return;
    pgChAdd_(idx,pgChNormal_(r.sku)+'|'+pgChMarca_(r.brand),r);
  });
  return idx;
}
function pgChAtributos_(idx,it) {
  const fichas=idx.get(pgChNormal_(it.sku)+'|'+pgChMarca_(it.brand))||[];
  const clean=values=>pgChUnicos_(values.map(pgChTexto_)).sort();
  const list=(key)=>clean(fichas.map(r=>r[key]));
  const cuts=fichas.flatMap(r=>['cut','cut0','cut1','cut2','cut3','cut4','cut5','cut6'].map(k=>pgChNormal_(r[k])));
  const features=[];
  if(cuts.some(v=>['TRUE','SIM','1'].includes(v)))features.push('Corte e vinco');
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
function pgChMetricaChamado_(t,idx) {
  const groups=new Map(),routes=[];
  for(const it of t.items){
    const attributes=pgChAtributos_(idx,it);it.attributes=attributes;
    const sp=it.spg.filter(r=>r.q>0);
    const mapDelivery=pgChDataIntegral_(it.maps,it.qty,'delivery','delivered');
    const spDelivery=pgChMarcoItens_(sp,'delivery');
    const delivery=mapDelivery||spDelivery;
    const collection=it.collection||pgChColetaRota_(it),pick=collection.date;
    const formal=pgChMarcoItens_(sp,'formal');
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
    if(it.qty>0)routes.push({sku:it.sku,printer:it.printer,cd:it.cd,qty:it.qty,delivery,pick,formal,late,unverified,source:mapDelivery?'Mapa':spDelivery?'SPG':'',collection:{events:collection.events,parts:collection.parts,source:collection.source,maps:collection.maps}});
    const {specRows,...dims}=attributes,key=JSON.stringify(dims);
    let g=groups.get(key);
    if(!g){
      g={...dims,qty:0,mapped:0,picked:0,delivered:0,balance:0,coverage:it.stages.map(()=>0),eta:'',partial:false,production:[],targetItems:[]};
      groups.set(key,g);
    }
    g.qty+=it.qty;const label=it.productionStatus.label,prev=g.production.find(x=>x.label===label);if(prev)prev.qty+=it.qty;else g.production.push({label,qty:it.qty});
    ['mapped','picked','delivered'].forEach(k=>g[k]+=Math.min(it.qty,it[k]));
    g.balance+=Math.max(0,it.qty-it.delivered);
    for(let i=0;i<it.coverage.length;i++)g.coverage[i]+=it.coverage[i];
    g.targetItems.push({qty:it.qty,target:it.target});g.eta=pgChUltima_([g.eta,it.eta]);g.partial=g.partial||it.etaPartial;
  }
  const delivered=pgChMarcoItens_(routes,'delivery');
  return {groups:Array.from(groups.values(),g=>{g.target=pgChPrazoResumo_(g.targetItems);delete g.targetItems;return g;}),closed:t.steps['Conclusão']?.r||'',canceled:t.steps.Cancelamento?.r||'',
    delivered,deliverySource:delivered?pgChUnicos_(routes.map(r=>r.source)).join(' + '):'',
    pickDone:pgChMarcoItens_(routes,'pick'),pickDue:pgChMarcoItens_(routes,'formal'),
    pickLate:routes.some(r=>r.late),pickUnverified:routes.some(r=>r.unverified),okrRoutes:routes,pickMaps:pgChUnicos_(routes.flatMap(r=>r.collection.maps)),pickSource:pgChUnicos_(routes.map(r=>r.collection.source)).join(' + '),owner:t.owner||''};
}

function pgChStatusRota_(t,it,panel){
  const q=it.qty,c=it.coverage,st=it.stages,full=k=>q>0&&(c[k]||0)>=q,any=k=>(c[k]||0)>0;
  const state=pgChNormal_(t.status),notes=pgChUnicos_((panel||[]).map(p=>pgChNormal_(p.status)));
  const has=s=>notes.some(n=>n.includes(s)),result=(label,source)=>({label,source});
  if(/CANCEL/.test(state))return result('Cancelado','SPG');
  if(full(11))return result('Entregue integralmente','Mapa');
  if(any(11)&&full(10))return result('Entrega parcial · saldo em trânsito','Mapa');
  if(full(10))return result('Em trânsito','Mapa');
  if(any(10))return result('Coleta parcial','Mapa');
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
  if(/CONCLU/.test(state))return result('Encerrado no SPG','SPG');
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
 const transit=slaDays!=null&&Number.isFinite(Number(slaDays))?Math.max(0,Number(slaDays)):Math.max(1,Math.ceil(targets[6].v)),available=25-Math.min(25,Math.ceil(transit));
 const weights=[Math.max(1,targets[0].v),Math.max(1,targets[1].v),Math.max(1,targets[2].v),Math.max(1,targets[5].v)],total=weights.reduce((a,b)=>a+b,0);
 const budget=weights.map(w=>available*w/total),alloc=Math.round(budget[0]),preEnd=Math.round(budget[0]+budget[1]),prodEnd=Math.round(budget[0]+budget[1]+budget[2]),pre=preEnd-alloc,prod=prodEnd-preEnd;
 // O painel mede blocos de produção; subdivisões abaixo são metas internas, não tempos observados.
 const dates=[alloc,alloc+Math.round(pre*.5),preEnd,preEnd+Math.round(prod*.5),preEnd+Math.round(prod*.85),prodEnd,prodEnd,Math.min(available,prodEnd+Math.ceil(targets[3].v)),Math.min(available,prodEnd+Math.ceil(targets[3].v+targets[4].v)),available,available,25].map(n=>pgChLeadAdd_(t.created,Math.min(25,Math.max(0,n))));
 const pending=[0,1,2,3,4,5,6,7,8,9,10,11].filter(k=>(it.coverage[k]||0)<it.qty).sort((a,b)=>dates[a].localeCompare(dates[b]));const next=pending[0]??-1;
 return {dates,deadline:dates[11],next:next<0?'':dates[next],nextStage:next,allocation:pgChLeadAdd_(t.created,alloc),transit,compressed:transit>25||total>available,profile:targets};
}
function pgChPrazoResumo_(items){
 const valid=items.filter(it=>it.qty>0&&it.target);if(!valid.length)return null;const pending=valid.filter(it=>it.target.next).sort((a,b)=>a.target.next.localeCompare(b.target.next));
 return {dates:PG_CH_ETAPAS.map((_,k)=>pgChUltima_(valid.map(it=>it.target.dates[k]))),deadline:pgChUltima_(valid.map(it=>it.target.deadline)),next:pending[0]?.target.next||'',nextStage:pending[0]?.target.nextStage??-1};
}

// Eventos de coleta exclusivamente da própria rota. SPG é alternativa, nunca soma a um mapa parcial.
function pgChColetaRota_(it){
 const q=it.qty,sp=it.spg.filter(s=>s.q>0),maps=it.maps||[];
 const primary=sp.filter(s=>s.pick).map(s=>({date:s.pick,qty:s.q,kit:s.kit||'',map:'',source:'SPG · Coleta real'}));
 const mapEvents=maps.filter(m=>m.pick&&m.qty>0).map(m=>({date:m.pick,qty:m.qty,kit:m.kit||'',map:m.map||'',source:'Mapa'}));
 let events=primary.slice(),remaining=Math.max(0,q-primary.reduce((n,e)=>n+e.qty,0));
 // Prioridade absoluta à Coleta real de cada linha. Complemento por kit exclusivo;
 // sem data SPG na rota, o mapa inteiro é a fonte alternativa.
 if(!primary.length)events=mapEvents;
 else if(remaining){
   const known=new Set(primary.map(e=>e.kit).filter(Boolean));
   const pending=new Map();if(primary.every(e=>e.kit))for(const s of sp)if(!s.pick&&s.kit&&!known.has(s.kit))pending.set(s.kit,(pending.get(s.kit)||0)+s.q);
   for(const e of mapEvents.slice().sort((a,b)=>a.date.localeCompare(b.date))){
      const n=Math.min(remaining,pending.get(e.kit)||0,e.qty);if(n>0){events.push({...e,qty:n});pending.set(e.kit,pending.get(e.kit)-n);remaining-=n;}
   }
 }
 const mapPhysical=maps.reduce((n,m)=>n+Math.max(0,m.pick?m.qty:Math.min(m.qty,m.delivered)),0);
 const picked=Math.min(q,Math.max(mapPhysical,events.reduce((n,e)=>n+e.qty,0)));
 const date=pgChDataIntegral_(events,q,'date','qty');
 return {picked,date,events,source:pgChUnicos_(events.map(e=>e.source)).join(' + '),maps:pgChUnicos_(maps.map(m=>m.map)),parts:sp.map(s=>({kit:s.kit||'',qty:s.q,due:s.formal||''}))};
}
