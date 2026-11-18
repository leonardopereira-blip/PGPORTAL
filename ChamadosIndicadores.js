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
      g={...dims,qty:0,mapped:0,picked:0,delivered:0,balance:0,coverage:it.stages.map(()=>0),eta:'',partial:false,production:[]};
      groups.set(key,g);
    }
    g.qty+=it.qty;const label=it.productionStatus.label,prev=g.production.find(x=>x.label===label);if(prev)prev.qty+=it.qty;else g.production.push({label,qty:it.qty});
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
