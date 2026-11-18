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
  return {printer:it.printer||'',cd:pgChCD_(it.cd),series:clean(fichas.flatMap(r=>pgChTexto_(r.series).split(/[;|]/))),
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
    const pick=pgChDataIntegral_(it.maps,it.qty,'pick','qty');
    const formal=pgChMarcoItens_(sp,'formal');
    const deadlines=pgChUnicos_(sp.map(r=>r.formal));
    let late=!!(pick && formal && pick>formal),unverified=false;
    if(formal && deadlines.length>1){
      // Entregas de kits com compromissos diferentes exigem evidência de coleta por kit.
      for(const part of sp){
        const events=it.maps.filter(m=>part.kit && m.kit===part.kit);
        const collected=pgChDataIntegral_(events,part.q,'pick','qty');
        if(!collected)unverified=true;else if(collected>part.formal)late=true;
      }
    }
    if(it.qty>0)routes.push({delivery,pick,formal,late,unverified,source:mapDelivery?'Mapa':spDelivery?'SPG':''});
    const {specRows,...dims}=attributes,key=JSON.stringify(dims);
    let g=groups.get(key);
    if(!g){
      g={...dims,qty:0,mapped:0,picked:0,delivered:0,balance:0,coverage:it.stages.map(()=>0),eta:'',partial:false};
      groups.set(key,g);
    }
    g.qty+=it.qty;
    ['mapped','picked','delivered'].forEach(k=>g[k]+=Math.min(it.qty,it[k]));
    g.balance+=Math.max(0,it.qty-it.delivered);
    for(let i=0;i<it.coverage.length;i++)g.coverage[i]+=it.coverage[i];
    g.eta=pgChUltima_([g.eta,it.eta]);g.partial=g.partial||it.etaPartial;
  }
  const delivered=pgChMarcoItens_(routes,'delivery');
  return {groups:Array.from(groups.values()),closed:t.steps['Conclusão']?.r||'',canceled:t.steps.Cancelamento?.r||'',
    delivered,deliverySource:delivered?pgChUnicos_(routes.map(r=>r.source)).join(' + '):'',
    pickDone:pgChMarcoItens_(routes,'pick'),pickDue:pgChMarcoItens_(routes,'formal'),
    pickLate:routes.some(r=>r.late),pickUnverified:routes.some(r=>r.unverified),owner:t.owner||''};
}
