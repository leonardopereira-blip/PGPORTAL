// Quantidades pertencem ao chamado, SKU e rota. Um mapa nunca distribui
// automaticamente uma mesma parcela entre dois chamados possíveis.
function pgChTexto_(v) { return String(v == null ? '' : v).trim(); }
function pgChNormal_(v) {
  return pgChTexto_(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function pgChToken_(v) { return pgChNormal_(v).replace(/[^A-Z0-9]/g, ''); }
// De-para oficial do PCP informado em 18/11/2026. Gráfica e destino são domínios distintos.
const PG_CH_DEPARA_GRAF={
  "COAN": "COAN",
  "MIDIOGRAF": "MIDIOGRAF",
  "MAXIGRAFICA": "MAXI",
  "MAXI": "MAXI",
  "RICARGRAF": "RICARGRAF",
  "RONA": "RONA",
  "REPROSET": "REPROSET",
  "IPSIS": "IPSIS",
  "PIFFERPRINT": "PIFFER",
  "PIFFER": "PIFFER",
  "BERCROM": "BERCROM",
  "STAR7": "STAR7",
  "LOGPRINT": "LOGPRINT",
  "WALPRINT": "WALPRINT",
  "POSIGRAF": "POSIGRAF",
  "META": "META",
  "IMOS": "IMOS",
  "LEOGRAF": "LEOGRAF",
  "SAOFRANCISCO": "SÃO FRANCISCO",
  "OCEANO": "OCEANO",
  "FORMACERTA": "FORMA CERTA",
  "ZIT": "ZIT",
  "MARGRAF": "MARGRAF",
  "SDIGRAFICA": "SDI",
  "SDI": "SDI"
};
const PG_CH_DEPARA_MARCA={
  "MARALTO": "MAR",
  "MAR": "MAR",
  "GEEKIE": "GEE",
  "GEE": "GEE",
  "GENIO": "GEN",
  "GEN": "GEN",
  "PES": "PES",
  "POSITIVO": "SPE",
  "SPE": "SPE",
  "MESTRE": "MES",
  "MES": "MES",
  "SAS": "SAS",
  "COC": "COC",
  "CQT": "CQT",
  "EI": "EI",
  "PLENO": "PLE",
  "PLE": "PLE",
  "SAE": "SAE",
  "SASADAPT": "SAS ADAPT",
  "SELONEUTRO": "NEU",
  "NEU": "NEU",
  "WAYS": "WAYS",
  "NAVEAVELA": "NAV",
  "NAV": "NAV",
  "PIA": "PIA",
  "IS": "IS",
  "SASBRADESCO": "SAS - BRADESCO",
  "GEK": "GEE",
  "GKI": "GEE",
  "GFN": "GEN",
  "PLN": "PLE",
  "MRT": "MAR",
  "INS": "IS",
  "EDI": "EI",
  "MDM": "MES",
  "SLN": "NEU",
  "SAD": "SAS ADAPT",
  "PEARSON": "PES",
  "PRS": "PES"
};
const PG_CH_DEPARA_DESTINO={
  "CSJR": "RAÍZES",
  "RAIZES": "RAÍZES",
  "CRPR": "CD RP",
  "CDRP": "CD RP",
  "CCWB": "POSIGRAF",
  "POSIGRAF": "POSIGRAF",
  "CJUN": "CD JDI",
  "CDJDI": "CD JDI",
  "CITA": "CD FOR",
  "CDFOR": "CD FOR",
  "CLOV": "KN",
  "KN": "KN",
  "ANTILHAS": "ANTILHAS",
  "RICARGRAF": "RICARGRAF",
  "LEOGRAF": "LEOGRAF",
  "MAXIGRAFICA": "MAXIGRAFICA",
  "RONA": "RONA",
  "PIFFERPRINT": "PIFFER",
  "PIFFER": "PIFFER",
  "STAR7": "STAR7",
  "FORMACERTA": "FORMA CERTA",
  "ATHOS": "ATHOS",
  "LOGPRINT": "LOGPRINT",
  "IMOS": "IMOS",
  "BERCROM": "BERCROM",
  "TRATTOMANUSEIO": "KN",
  "HR": "HR",
  "EMBALARTE": "EMBALARTE",
  "JDI": "CD JDI",
  "JUNDIAI": "CD JDI",
  "CDJUNDIAI": "CD JDI",
  "FOR": "CD FOR",
  "ITAITINGA": "CD FOR",
  "FORTALEZA": "CD FOR",
  "CDCE": "CD FOR",
  "CWB": "POSIGRAF",
  "CDCWB": "POSIGRAF",
  "CURITIBA": "POSIGRAF",
  "SJR": "RAÍZES",
  "SAOJOSEDORIOPRETO": "RAÍZES",
  "CDSJR": "RAÍZES",
  "LOV": "KN",
  "LOUVEIRA": "KN",
  "CDLOV": "KN",
  "RP": "CD RP",
  "CDRIBEIRAO": "CD RP",
  "RIBEIRAOPRETO": "CD RP",
  "AT": "ATHOS",
  "ACABADORAATHOS": "ATHOS"
};
function pgChCanon_(v,map){const k=pgChToken_(v);return Object.prototype.hasOwnProperty.call(map,k)?map[k]:k;}
function pgChMarca_(v){return pgChCanon_(v,PG_CH_DEPARA_MARCA);}
function pgChGraf_(v){return pgChCanon_(v,PG_CH_DEPARA_GRAF);}
function pgChCD_(v){return pgChCanon_(pgChNormal_(v).replace(/\s*-\s*(SP|CE|PR)$/,''),PG_CH_DEPARA_DESTINO);}
function pgChGrafNome_(v){return PG_CH_DEPARA_GRAF[pgChToken_(v)]||pgChTexto_(v);}
function pgChCDNome_(v){const s=pgChNormal_(v).replace(/\s*-\s*(SP|CE|PR)$/,'');return PG_CH_DEPARA_DESTINO[pgChToken_(s)]||pgChTexto_(v);}
function pgChMarcaNome_(v){return PG_CH_DEPARA_MARCA[pgChToken_(v)]||pgChTexto_(v);}
function pgChData_(v) {
  const s = pgChTexto_(v);
  const br = /^(\d{2})\/(\d{2})\/(20\d{2})(?:\s|$)/.exec(s);
  const iso = br ? br[3]+'-'+br[2]+'-'+br[1] : (/^(20\d{2}-\d{2}-\d{2})(?:$|T|\s)/.exec(s)||[])[1];
  if (!iso) return '';
  const d = new Date(iso+'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0,10) === iso ? iso : '';
}
function pgChQtd_(v) {
  const s = pgChTexto_(v);
  if (!s) return 0;
  const n = typeof v === 'number' ? v : Number(s.replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function pgChUltima_(arr) { return arr.filter(Boolean).sort().pop() || ''; }
function pgChUnicos_(arr) { return Array.from(new Set(arr.filter(Boolean))); }
function pgChRotasSLA_(matrix) {
  const routes=new Map(), i=matrix.findIndex(r=>pgChNormal_(r[0])==='FORNECEDOR');
  if(i<0)return routes;
  matrix.slice(i+1).forEach(r=>matrix[i].slice(1).forEach((dest,j)=>{
    const raw=r[j+1], days=Number(pgChTexto_(raw).replace(',','.'));
    if(r[0] && dest && pgChTexto_(raw)!=='' && Number.isInteger(days) && days>=0)routes.set(pgChGraf_(r[0])+'|'+pgChCD_(dest),days);
  }));
  return routes;
}
function pgChAdd_(idx, key, value) {
  if (!idx.has(key)) idx.set(key, []);
  if (!idx.get(key).includes(value)) idx.get(key).push(value);
}
const PG_CH_ETAPAS = ['Arquivo enviado','Boneco recebido','Boneco aprovado','Impressão','Acabamento','Formação de kit',
  'Produção concluída','Custo validado','OC emitida','Mapa solicitado','Coleta no mapa','Entrega no CD'];
function pgChEtapa_(plan,real,fonte,andamento) {
  return {p:pgChData_(plan), r:pgChData_(real), f:fonte, a:andamento || ''};
}
function pgChModelo_(dados) {
  const sla=pgChRotasSLA_(dados.sla||[]);
  const tickets = new Map(), numeros = new Map(), porSKU = new Map(), porOP = new Map();
  const mapaRefs = new Map();
  const rotaKey = (sku,marca,grafica,cd) => [pgChNormal_(sku),pgChMarca_(marca),pgChGraf_(grafica),pgChCD_(cd)].join('|');
  const kitKey = (r) => [r.id || r.n,pgChNormal_(r.sku),pgChMarca_(r.brand||r.brandName),pgChCD_(r.cd),r.kit].join('|');
  const lotes = new Map();
  dados.spg.forEach(r => {
    if (!r.n || !r.cat) return;
    const id = r.id || 'SPG-'+r.n;
    let t = tickets.get(id);
    if (!t) {
      t = {id,n:r.n,cat:r.cat,brand:pgChMarcaNome_(r.brand||r.brandName),shipment:r.shipment,status:r.status,priority:r.priority,
        owner:r.owner,created:pgChData_(r.created),desired:pgChData_(r.desired),goal:pgChData_(r.goal),op:r.op,
        edition:r.edition,why:r.why,obs:r.obs,reason:r.reason,steps:{},issues:[],panel:[],items:[],alerts:[],refs:[],_groups:new Map()};
      tickets.set(id,t); pgChAdd_(numeros,String(r.n),t);
    }
    const refs = pgChTexto_(r.map).match(/(?:MP-)?\d{6}(?=-|\b)/gi) || [];
    refs.forEach(code=>pgChAdd_(mapaRefs,code.replace(/^MP-/i,''),t));
    if (r.map && !t.refs.includes(r.map)) t.refs.push(r.map);
    if (r.issue && !t.issues.includes(r.issue)) t.issues.push(r.issue);
    const stages = {Abertura:r.created,Aceite:r.accepted,Liberação:r.released,Alocação:r.allocated,
      'Validação de custo':r.cost,'OC aberta':r.ocOpen,'OC aprovada':r.ocDone,Produzido:r.produced,Conclusão:r.closed,Cancelamento:r.canceled};
    for (const nome in stages) {
      const real=pgChData_(stages[nome]), plan=nome==='Validação de custo'?pgChData_(r.costPlan):'';
      if (real || plan) {
        const prev=t.steps[nome] || {};
        t.steps[nome]=pgChEtapa_(pgChUltima_([plan,prev.p]),pgChUltima_([real,prev.r]),'SPG');
      }
    }
    const k=kitKey(r); if (!lotes.has(k)) lotes.set(k,[]);
    lotes.get(k).push({t,r});
  });
  function addItem(t,r,qty,printer) {
    const key=rotaKey(r.sku,t.brand,printer,r.cd);
    let it=t._groups.get(key);
    if (!it) {
      it={id:t.id,sku:r.sku,desc:r.description,brand:t.brand,printer:pgChGrafNome_(printer),cd:pgChCDNome_(r.cd),qty:0,kits:[],rows:[],spg:[],cal:[],pcp:[],maps:[],stages:[],evidence:[]};
      t._groups.set(key,it); t.items.push(it);
      if (r.sku) pgChAdd_(porSKU,pgChNormal_(r.sku),it);
      if (t.op) pgChAdd_(porOP,pgChToken_(t.op),it);
    }
    it.qty+=qty; it.rows.push(r.row);
    if (r.kit && !it.kits.includes(r.kit)) it.kits.push(r.kit);
    it.spg.push({q:qty,kit:r.kit,stock:pgChQtd_(r.stock),sub:pgChQtd_(r.sub),oc:r.oc,ocStatus:r.ocStatus,nf:r.nf,
      formal:pgChData_(r.formal),pickP:pgChData_(r.pickPlan),pick:pgChData_(r.pick),deliveryP:pgChData_(r.deliveryPlan),
      delivery:pgChData_(r.delivery),produced:pgChData_(r.produced),cost:pgChData_(r.cost),costP:pgChData_(r.costPlan),ocOpen:pgChData_(r.ocOpen),ocDone:pgChData_(r.ocDone),row:r.row});
  }
  for (const group of lotes.values()) {
    const {t,r}=group[0];
    if (group.length===1) { addItem(t,r,pgChQtd_(r.qty)||pgChQtd_(r.sub),r.printer); continue; }
    // A extração repete a demanda do kit quando divide uma alocação entre gráficas.
    const total=Math.max(...group.map(x=>pgChQtd_(x.r.qty)||pgChQtd_(x.r.sub)));
    const aloc=group.reduce((s,x)=>s+pgChQtd_(x.r.assigned),0);
    if (aloc>0 && aloc<=total) {
      group.forEach(x=>{if (pgChQtd_(x.r.assigned)) addItem(t,x.r,pgChQtd_(x.r.assigned),x.r.printer);});
      if (total>aloc) addItem(t,r,total-aloc,'');
    } else {
      const printers=pgChUnicos_(group.map(x=>pgChGrafNome_(x.r.printer)));
      addItem(t,r,total,printers.length===1?printers[0]:'');
      if (printers.length>1) t.alerts.push({text:'Divisão de tiragem entre gráficas a conferir',sku:r.sku,row:r.row,src:'spg'});
    }
  }
  function comp(a,b,fn) { return !a || !b || fn(a)===fn(b); }
  function envio(v){return pgChToken_(v).replace(/^V(?=\d)/,'');}
  const graf=pgChGraf_;
  dados.cal.forEach(c=>{
    if (pgChNormal_(c.kind).includes('PRINCIPAL') || !c.sku) return;
    const ts=numeros.get(String(c.n))||[];
    if (ts.length!==1) return;
    const t=ts[0];
    if (!comp(c.brand,t.brand,pgChMarca_) || !comp(c.shipment,t.shipment,envio)) return;
    const matches=(porSKU.get(pgChNormal_(c.sku))||[]).filter(it=>it.id===t.id && comp(c.printer,it.printer,graf));
    if (!c.printer && pgChUnicos_(matches.map(it=>it.printer)).length>1) return;
    matches.forEach(it=>{
      if (c.kit && c.kit!=='-' && it.kits.length && !it.kits.includes(c.kit)) return;
      it.cal.push({row:c.row,kit:c.kit,editor:pgChData_(c.editor),fileP:pgChData_(c.fileP),fileR:pgChData_(c.fileR),
        proofP:pgChData_(c.proofP),proofR:pgChUltima_([pgChData_(c.proofR),pgChData_(c.proof2)]),
        approvalP:pgChData_(c.approvalP),approvalR:pgChData_(c.approvalR),state:c.state,note:c.note});
    });
  });
  dados.pcp.forEach(r=>{
    if (!r.op || !r.sku || !r.printer || !r.cd || !r.brand) return;
    const eligible=(porOP.get(pgChToken_(r.op))||[]).filter(it=>pgChNormal_(it.sku)===pgChNormal_(r.sku)
      && graf(it.printer)===graf(r.printer) && pgChCD_(it.cd)===pgChCD_(r.cd) && pgChMarca_(it.brand)===pgChMarca_(r.brand)
      && comp(tickets.get(it.id).shipment,r.shipment,envio));
    if (eligible.length===1) eligible[0].pcp.push(r);
  });
  dados.panel.forEach(r=>{
    const ts=numeros.get(String(r.n))||[];
    if (ts.length!==1 || !comp(r.brand,ts[0].brand,pgChMarca_) || !comp(r.shipment,ts[0].shipment,envio)) return;
    ts[0].panel.push({row:r.row,cd:pgChCDNome_(r.cd),printer:pgChGrafNome_(r.printer),status:r.status,note:r.note,responsible:r.responsible,criticality:r.criticality,risk:r.risk,cause:r.cause,
      startP:pgChData_(r.startP),startR:pgChData_(r.startR),endP:pgChData_(r.endP),endR:pgChData_(r.endR)});
  });
  const seen=new Map();
  dados.map.forEach(m=>{
    const code=m.map||m.code;
    if (!code || !m.sku || /^(SIM|TRUE|1)$/.test(pgChNormal_(m.canceled)) || /CANCEL/.test(pgChNormal_(m.state+' '+m.collection))) return;
    const raw=pgChUnicos_([m.n,m.nCol,m.nInc].filter(v=>v && !/^(0|-|não|false)$/i.test(v)));
    const ns=pgChUnicos_(raw.flatMap(v=>String(v).match(/\b\d+\b/g)||[]));
    const num=(code.match(/(?:MP-)?(\d{6})(?:-|$)/i)||[])[1];
    const named=raw.length?pgChUnicos_(ns.flatMap(n=>numeros.get(n)||[])):(mapaRefs.get(num)||[]);
    const printer=m.printer||m.org, cd=m.cd||m.colCD;
    const dtOrig=pgChData_(m.created)||pgChData_(m.picked);
    let opts=porSKU.get(pgChNormal_(m.sku))||[];
    if (raw.length || named.length) {
      opts=opts.filter(it=>named.includes(tickets.get(it.id)) && it.sku && it.printer && it.cd && printer && cd && comp(it.brand,m.brand,pgChMarca_) && graf(it.printer)===graf(printer) && pgChCD_(it.cd)===pgChCD_(cd));
    } else {
      if (!m.brand || !printer || !cd) return;
      opts=opts.filter(it=>it.printer && it.cd && it.brand && graf(it.printer)===graf(printer) &&
        pgChCD_(it.cd)===pgChCD_(cd) && pgChMarca_(it.brand)===pgChMarca_(m.brand) &&
        !/CANCEL/.test(tickets.get(it.id).status) && dtOrig && dtOrig>=tickets.get(it.id).created);
    }
    opts=opts.filter(it=>comp(tickets.get(it.id).shipment,m.shipment,envio));
    if (opts.length>1 && m.kit) {
      const ex=opts.filter(it=>it.kits.includes(m.kit)); if(ex.length) opts=ex;
    }
    if (opts.length!==1) {
      const affected=pgChUnicos_(opts.map(it=>tickets.get(it.id)).concat(named));
      affected.forEach(t=>t.alerts.push({src:'map',row:m.row,map:code,sku:m.sku,
        text:opts.length?'Rota compatível com mais de um item ou chamado':'Chamado citado; SKU ou rota divergente'}));
      return;
    }
    const it=opts[0], qty=pgChQtd_(m.qty), received=pgChData_(m.delivered)||pgChData_(m.checked);
    const hasCount=pgChTexto_(m.received)!=='';
    const event={row:m.row,map:code,kit:m.kit,sku:m.sku,nf:m.nf,qty,created:pgChData_(m.created),book:pgChData_(m.book),
      pick:pgChData_(m.picked)||pgChData_(m.colPick),eta:pgChData_(m.eta),delivery:received,
      delivered:received?(hasCount?Math.min(qty,pgChQtd_(m.received)):(/^(SIM|TRUE)$/.test(pgChNormal_(m.divergent))?0:qty)):0,
      method:raw.length?'Número do chamado':named.length?'Mapa informado no SPG':'SKU + marca + gráfica + CD',
      cd:pgChCDNome_(cd),printer:pgChGrafNome_(printer),raw:raw.join(' / '),scan:m.scan};
    // Repetições da mesma leitura/conferência não criam uma nova expedição.
    const k=[m.out||code,m.scan||'',m.document||'',m.kit,m.sku,m.nf,pgChCD_(cd),qty].join('|');
    const old=seen.get(k);
    if(old && old.id===it.id && old.it===it){
      if (pgChData_(m.checked)>=old.checked) {
        Object.assign(old.event,event); old.checked=pgChData_(m.checked);
      }
      return;
    }
    it.maps.push(event);seen.set(k,{it,id:it.id,event,checked:pgChData_(m.checked)});
  });
  function stage(rows,p,r,source) {
    const real=rows.length && rows.every(x=>pgChData_(x[r]))?pgChUltima_(rows.map(x=>pgChData_(x[r]))):'';
    return pgChEtapa_(pgChUltima_(rows.map(x=>pgChData_(x[p]))),real,source,
      !real && rows.some(x=>pgChData_(x[r]))?'Parcial':'');
  }
  pgChFinanceiro_(dados,tickets,numeros);
  const specIdx=pgChIndiceEspec_(dados.spec||[]),leadProfile=pgChLeadProfile_(dados.panel||[]);
  const summaries=[];
  for(const t of tickets.values()) {
    delete t._groups;
    const totals={qty:0,mapped:0,picked:0,delivered:0,balance:0,coverage:PG_CH_ETAPAS.map(()=>0)};
    const pendingEtas=[]; let missingEta=false;
    for(const it of t.items) {
      it.stages=[stage(it.cal,'fileP','fileR','Calendário'),stage(it.cal,'proofP','proofR','Calendário'),
        stage(it.cal,'approvalP','approvalR','Calendário'),stage(it.pcp,'printP','printR','PCP'),
        stage(it.pcp,'finishP','finishR','PCP'),stage(it.pcp,'kitP','kitR','PCP'), stage(it.spg,'','produced','SPG')];
      const painel=t.panel.filter(p=>p.printer && p.cd && graf(p.printer)===graf(it.printer) && pgChCD_(p.cd)===pgChCD_(it.cd));
      if (painel.length) {
        for(const [i,label] of [[3,'IMPRESSAO'],[4,'ACABAMENTO'],[5,'FORMACAO DE KIT']]){
          if (!it.stages[i].r && painel.some(p=>pgChNormal_(p.status).includes('EM PRODUCAO') && pgChNormal_(p.status).includes(label))){
            it.stages[i].a='Em andamento';it.stages[i].f='Painel de produção';
          }
        }
        const prod=stage(painel,'endP','endR','Painel de produção');
        if(!it.stages[6].p && prod.p) it.stages[6].p=prod.p;
      }
      const sum=fn=>it.maps.reduce((n,m)=>n+fn(m),0);
      it.mapped=sum(m=>Math.max(0,m.qty));it.delivered=sum(m=>Math.max(0,Math.min(m.qty,m.delivered)));it.collection=pgChColetaRota_(it);it.picked=it.collection.picked;
      const spgForecast=pgChUltima_(it.spg.map(s=>s.deliveryP));
      const days=sla.get(pgChGraf_(it.printer)+'|'+pgChCD_(it.cd));
      function transporte(coleta){
        if(!coleta || days==null)return '';
        const d=new Date(coleta+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
      }
      const outstanding=it.maps.filter(m=>m.delivered<m.qty);
      const forecasts=outstanding.map(m=>({date:m.eta||transporte(m.pick||m.book)||spgForecast,source:m.eta?'Mapa':transporte(m.pick||m.book)?'Coleta + Matriz SLA':spgForecast?'SPG':''}));
      const saldo=Math.max(0,it.qty-it.delivered);
      if(saldo && it.mapped<it.qty){
        const pickup=pgChUltima_(it.spg.map(s=>s.pick||s.pickP||s.formal));
        forecasts.push({date:spgForecast||transporte(pickup),source:spgForecast?'SPG':transporte(pickup)?'Coleta + Matriz SLA':''});
      }
      it.eta=saldo?pgChUltima_(forecasts.map(f=>f.date)):'';
      it.etaPartial=!!saldo && forecasts.some(f=>!f.date);
      it.forecastSource=pgChUnicos_(forecasts.map(f=>f.source)).join(' + ');
      const costs=t.costs.filter(c=>pgChNormal_(c.sku)===pgChNormal_(it.sku) && pgChGraf_(c.printer)===pgChGraf_(it.printer) && pgChCD_(c.cd)===pgChCD_(it.cd));
      const validCosts=costs.filter(c=>/^(CONCLUID[OA]|VALIDAD[OA]|FINALIZAD[OA])$/.test(pgChNormal_(c.status)));
      const costStage=stage(it.spg,'costP','cost','SPG');
      if(!costStage.r && validCosts.length){
        costStage.units=Math.min(it.qty,validCosts.reduce((s,c)=>s+pgChQtd_(c.qty),0));costStage.f='Validação de custos';
        costStage.a=costStage.units>=it.qty?'Validado':'Parcial';
        if(costStage.units>=it.qty)costStage.r=pgChUltima_(validCosts.map(c=>c.date));
      }
      const orders=t.orders.filter(o=>/^\d+$/.test(o.oc) && !/CANCEL|REPROV/.test(pgChNormal_(o.status+' '+o.approval)) && pgChGraf_(o.printer)===pgChGraf_(it.printer) && pgChCD_(o.cd)===pgChCD_(it.cd));
      const spgOcs=it.spg.filter(s=>/^\d+$/.test(s.oc) && !/CANCEL|REPROV/.test(pgChNormal_(s.ocStatus)));
      const ocStage=pgChEtapa_('','','SPG');
      const matchedCost=costs.filter(c=>orders.some(o=>pgChNormal_(c.lot)===pgChNormal_(o.id) || (c.oc && c.oc===o.oc)));
      const qtyOC=Math.max(spgOcs.reduce((s,c)=>s+c.q,0),matchedCost.reduce((s,c)=>s+pgChQtd_(c.qty),0));
      if(qtyOC>0){
        ocStage.units=Math.min(it.qty,qtyOC);
        ocStage.f=matchedCost.length?'BD OC + validação de custos':'SPG';
        ocStage.a=qtyOC>=it.qty?'OC emitida':'Parcial';
        if(qtyOC>=it.qty)ocStage.r=pgChUltima_(orders.filter(o=>matchedCost.some(c=>pgChNormal_(c.lot)===pgChNormal_(o.id)||c.oc===o.oc)||spgOcs.some(s=>s.oc===o.oc)).map(o=>o.sent));
      }
      it.stages.push(costStage,ocStage);
      // Realizado progressivo da própria rota; não propaga saldo, estoque ou OC.
      if(it.qty>0){
        let confirmed=Math.min(it.qty,it.picked);
        for(let k=6;k>=0;k--){
          const s=it.stages[k],own=Math.min(it.qty,s.units!=null?s.units:s.r?it.qty:0);
          if(confirmed>own){s.units=confirmed;if(!s.r){s.a=it.spg.some(r=>r.stock||r.sub)?'Etapa atendida pela rota (estoque/subcontratação)':confirmed===it.qty?'Realizado por etapa posterior':'Realizado parcial por etapa posterior';s.f='Produção / mapa';}}
          confirmed=Math.max(confirmed,own);
        }
      }
      const log=(q,p,r)=>pgChEtapa_(p,it.qty>0 && q>=it.qty?r:'','Mapa',q>0 && q<it.qty?'Parcial':'');
      it.stages.push(log(it.mapped,'',pgChUltima_(it.maps.map(m=>m.created))),log(it.picked,pgChUltima_(it.spg.map(s=>s.pickP)),
        it.collection.date),log(it.delivered,it.eta,pgChUltima_(it.maps.filter(m=>m.delivered>0).map(m=>m.delivery))));
      if(it.collection.source)it.stages[10].f=it.collection.source;
      totals.qty+=it.qty;totals.balance+=saldo;
      for(const k of ['mapped','picked','delivered']) totals[k]+=Math.min(it.qty,it[k]);
      it.coverage=it.stages.map((s,i)=>Math.max(0,Math.min(it.qty,i>=9?[it.mapped,it.picked,it.delivered][i-9]:s.units!=null?s.units:s.r?it.qty:0)));
      pgChValidarFunilRota_(t,it);
      it.productionStatus=pgChStatusRota_(t,it,painel);it.target=pgChPrazoRota_(t,it,leadProfile,days);
      it.coverage.forEach((v,i)=>{totals.coverage[i]+=v;});
      if(saldo){if(it.eta)pendingEtas.push(it.eta);if(!it.eta||it.etaPartial)missingEta=true;}
    }
    t.totals=totals;t.production=pgChResumoStatus_(t.items);t.target=pgChPrazoResumo_(t.items);
    summaries.push({id:t.id,n:t.n,cat:t.cat,brand:t.brand,shipment:t.shipment,status:t.status,priority:t.priority,created:t.created,
      goal:t.goal,desired:t.desired,eta:pgChUltima_(pendingEtas),partial:missingEta,issues:t.alerts.length,items:t.items.length,totals,production:t.production,target:t.target,
      ...pgChMetricaChamado_(t,specIdx)});
  }
  return {summaries,tickets};
}

function pgChValidarFunilRota_(t,it){
  const c=it.coverage,q=it.qty,seq=[0,1,2,3,4,5,6,10,11];
  const fail=()=>{throw new Error('Funil inconsistente: chamado '+t.n+' SKU '+it.sku+' / '+it.printer+' / '+it.cd);};
  if(c.some(v=>!Number.isFinite(v)||v<0||v>q))fail();
  let prior=q;for(const k of seq){if(c[k]>prior)fail();prior=c[k];}
  if(c[11]>c[10])fail(); // Coleta real do SPG pode existir sem mapa solicitado localizado.
}
