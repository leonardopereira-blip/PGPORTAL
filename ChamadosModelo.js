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
Object.assign(PG_CH_DEPARA_DESTINO,{
  "CD": "CD",
  "POSIGRAF": "POSIGRAF",
  "CDJDI": "CD JDI",
  "CDFOR": "CD FOR",
  "KN": "KN",
  "DEIGO": "Deigo",
  "RIBEIRAOPRETO": "CD RP",
  "CDRP": "CD RP",
  "RAIZES": "RAÍZES",
  "CDSBC": "CD SBC",
  "ATHOS": "ATHOS",
  "RP": "CD RP",
  "ATHOSOSASCO": "ATHOS",
  "IS": "CD SBC",
  "FORTALEZACE": "CD FOR",
  "JUNDIAISP": "CD JDI",
  "KNSP": "KN",
  "RIBEIRAOPRETOSP": "CD RP",
  "SAOBERNARDOSP": "CD SBC",
  "RAIZESSP": "RAÍZES",
  "FORTALEZA": "CD FOR",
  "DESTINO": "Destino",
  "JUNDIAI": "CD JDI",
  "ACABADORAHRACABAMENTOS": "HR",
  "HR": "HR",
  "SAOJOSEDORIOPRETOSP": "RAÍZES",
  "LOUVEIRASP": "KN",
  "ACABADORAEMBALARTE": "EMBALARTE",
  "EMBALARTE": "EMBALARTE",
  "CURITIBAPR": "POSIGRAF",
  "ITAITINGACE": "CD FOR",
  "ACABADORAKNEMLOUVEIRA": "KN",
  "ACABADORAANTILHAS": "ANTILHAS",
  "ANTILHAS": "ANTILHAS",
  "ACABADORATRATTOFELK": "FELK",
  "FELK": "FELK",
  "ACABADORAATHOS": "ATHOS",
  "ACABADORAATHOSMANUSEIOEARMAZENAGEMLTDAFILIAL": "ATHOS",
  "ACABADORAHRACABAMENTO": "HR",
  "ACABADORAANTILHASLOGISTICAEDEPOSITODEMERCADORIASPARATERCEIROSLTDA": "ANTILHAS",
  "ACABADORAHR": "HR",
  "ACABADORAATHOSRUAURBANOSANTOS901SITIOBRITOSSP": "ATHOS",
  "ACABADORARAIZES": "RAÍZES",
  "ACABADORAHRACABAMENTOSGRAFICOSEIRELI": "HR",
  "ACABADORAANTILHASLOGISTICAEDEPOSITODEMERCADORIASPARATERCEIROSLTD": "ANTILHAS",
  "ACABADORAHRACABAMENTOSEIRELI": "HR",
  "ACABADORAATHOSGUARULHOS": "ATHOS",
  "ACABADORAKN": "KN",
  "ACABADORAPOSIGRAF": "POSIGRAF",
  "ACABADORAFELKMANUSEIOLTDA": "FELK",
  "SAOBERNARDO": "CD SBC",
  "SAOBERNARDODOCAMPO": "CD SBC",
  "SBC": "CD SBC",
  "ACABADORAGRAFICAOCEANO":"OCEANO",
  "GRAFICAATHOS":"ATHOS",
  "GRAFICAMIDIOGRAF":"MIDIOGRAF",
  "GRAFICAWALPRINT":"WALPRINT",
  "GRAFICALOGPRINT":"LOGPRINT",
  "GRAFICAANTILHAS":"ANTILHAS",
  "GRAFICAFORMACERTA":"FORMA CERTA",
  "ACABADORAFELKPRESTACAODESERVICOSDEMANUSEIOEMEMBALAGENS":"FELK",
  "ACABADORATRATTOMANUSEIOLTDA":"KN",
  "ACABADORALOGPRINT":"LOGPRINT",
  "ACABADORALOGPRINTGRAFICADADOSVARIAVEIS":"LOGPRINT",
  "ACABADORAWALTPRINTGRAFICAEEDITORAEIRELLI":"WALPRINT",
  "ACABADORAHRACABAMENTOSGRAFICOSEIRELIAVENIDAPRESTESMAIA1419CENTRO09930270SAOPAULO":"HR",
  "ACABADORAEIKOU":"EIKOU"
});
function pgChCanon_(v,map){const k=pgChToken_(v);return Object.prototype.hasOwnProperty.call(map,k)?map[k]:k;}
function pgChMarca_(v){return pgChCanon_(v,PG_CH_DEPARA_MARCA);}
function pgChNumero_(v){
  const raw=pgChTexto_(v),match=/^(\d+)(?:[.,]0+)?$/.exec(raw);
  return match?match[1].replace(/^0+(?=\d)/,''):raw;
}
function pgChNumerosMapa_(values){
  return pgChUnicos_(values.flatMap(v=>pgChTexto_(v).replace(/\b(\d+)[.,]0+(?=\s|$|[;|])/g,'$1').match(/\b\d+\b/g)||[]).map(pgChNumero_).filter(n=>n!=='0'));
}
function pgChSku_(v){
  return pgChNormal_(v).replace(/^(\d+)[.,]0+$/,'$1').replace(/[‐‑‒–—−]/g,'-').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ');
}
function pgChEnvio_(v){return pgChToken_(v).replace(/^V(?=\d)/,'').replace(/^0+(?=\d)/,'');}
function pgChCodigoMapa_(v){return pgChNormal_(v).replace(/[‐‑‒–—−]/g,'-').replace(/\s*-\s*/g,'-').replace(/^MP-?/,'');}
function pgChChaveChamadoDestino_(n,cd){
  const number=pgChNumero_(n),dest=pgChCD_(cd);
  return number&&dest?JSON.stringify([number,dest]):'';
}
function pgChRefsMapa_(v){
  return (pgChNormal_(v).replace(/[‐‑‒–—−]/g,'-').replace(/\s*-\s*/g,'-').match(/(?:MP-?)?\d{6}(?:-[A-Z0-9]+)*/g)||[]).map(pgChCodigoMapa_);
}
function pgChGraf_(v){return pgChCanon_(v,PG_CH_DEPARA_GRAF);}
function pgChCD_(v){const raw=pgChToken_(v);return PG_CH_DEPARA_DESTINO[raw]||pgChCanon_(pgChNormal_(v).replace(/\s*-\s*(SP|CE|PR)$/,''),PG_CH_DEPARA_DESTINO);}
function pgChGrafNome_(v){return PG_CH_DEPARA_GRAF[pgChToken_(v)]||pgChTexto_(v);}
function pgChCDNome_(v){const s=pgChNormal_(v).replace(/\s*-\s*(SP|CE|PR)$/,'');return PG_CH_DEPARA_DESTINO[pgChToken_(v)]||PG_CH_DEPARA_DESTINO[pgChToken_(s)]||pgChTexto_(v);}
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
const PG_CH_ETAPAS = ['Envio de arquivo','Boneco recebido','Boneco aprovado','Impressão','Acabamento','Formação de kit',
  'Produção concluída','Custo validado','OC emitida','Mapa solicitado','Coleta real','Entrega no CD'];
function pgChEtapa_(plan,real,fonte,andamento) {
  return {p:pgChData_(plan), r:pgChData_(real), f:fonte, a:andamento || ''};
}
// Somente setembro de 2026; exclui o número inteiro se existir em qualquer linha SPG.
function pgChImportarPainelSetembro_(spg,panel){
 const present=new Set((spg||[]).map(r=>pgChNumero_(r.n)).filter(Boolean)),seen=new Set(),out=[];
 const today=new Date().toISOString().slice(0,10);
 for(const r of panel||[]){
  const n=pgChNumero_(r.n),created=pgChData_(r.created);
  if(!/^\d+$/.test(n)||present.has(n)||created<'2026-09-01'||created>'2026-09-30')continue;
  const type=pgChNormal_(r.category),cat=type.includes('REENTRADA')?'REENTRADA':type.includes('MANUSEIO')?'MANUSEIO':type.includes('SPOT')?'SPOT':/INCLUSIV|BRAILLE|AMPLIAD/.test(type)?'INCLUSIVOS':type||'SEM CATEGORIA';
  const key=JSON.stringify([n,pgChMarca_(r.brand),pgChGraf_(r.printer),pgChCD_(r.cd),pgChTexto_(r.description),pgChQtd_(r.qty),created,pgChData_(r.pickup),pgChData_(r.delivered),pgChNormal_(r.status)]);
  if(seen.has(key))continue;seen.add(key);
  const closed=/^CONCLUID[OA]$|^ENTREGUE$/.test(pgChNormal_(r.status)),candidate=pgChData_(r.pickup),pick=closed&&candidate>=created&&candidate<=today?candidate:'';
  const cost=pgChData_(r.costDate),prod=pgChData_(r.endR);
  out.push({...r,id:'PAINEL-'+n,n,cat,created,desired:r.desired,brand:r.brand,shipment:r.shipment,description:r.description,qty:r.qty,sku:'',kit:'',status:pgChNormal_(r.status),pick,pickPlan:r.pickup,deliveryPlan:r.delivered,delivery:'',formal:r.formal,cost:cost&&cost>=created&&cost<=today?cost:'',produced:prod&&prod>=created&&prod<=today?prod:'',oc:r.oc,ocStatus:r.ocStatus,legacy:true,legacyKey:key,edition:r.shipment+'-'+String(r.cycle||'').slice(-2),row:r.row});
 }
 return out;
}
function pgChIndiceTransportes_(rows) {
  const index=new Map();
  for(const row of rows){
    const code=pgChCodigoMapa_(row.map);
    if(!code || code==='-')continue;
    const pick=pgChData_(row.pick), delivery=pgChData_(row.delivery);
    if(!pick && !delivery)continue;
    if(!index.has(code))index.set(code,{picks:[],delivery:'',deliveryRow:0});
    const dates=index.get(code);
    if(pick)dates.picks.push({date:pick,row:row.row});
    if(delivery>dates.delivery){dates.delivery=delivery;dates.deliveryRow=row.row;}
  }
  for(const dates of index.values())dates.picks.sort((a,b)=>b.date.localeCompare(a.date));
  return index;
}

function pgChDataRealChamado_(value,created) {
  const date=pgChData_(value);
  return date && (!created || date>=created)?date:'';
}
function pgChDatasMapa_(transport,originalPick,originalDelivery,created) {
  const valid=v=>pgChDataRealChamado_(v,created);
  const dates={pick:valid(originalPick),delivery:valid(originalDelivery),tpPickRow:undefined,tpDeliveryRow:undefined};
  if(transport){
    const tpDelivery=valid(transport.delivery),limit=tpDelivery||dates.delivery;
    const pick=transport.picks.find(p=>valid(p.date) && (!limit || p.date<=limit));
    if(pick){dates.pick=pick.date;dates.tpPickRow=pick.row;}
    if(tpDelivery && (!dates.pick || dates.pick<=tpDelivery)){
      dates.delivery=tpDelivery;dates.tpDeliveryRow=transport.deliveryRow;
    }
  }
  if(dates.pick && dates.delivery && dates.pick>dates.delivery){dates.pick='';dates.tpPickRow=undefined;}
  return dates;
}

function pgChModelo_(dados) {
  const sla=pgChRotasSLA_(dados.sla||[]);
  const transport=pgChIndiceTransportes_(dados.tp||[]);
  const tickets = new Map(), numeros = new Map(), porSKU = new Map(), porOP = new Map();
  const porChamadoDestino=new Map(), mapaRefs=new Map();
  const rotaKey = (sku,marca,grafica,cd) => [pgChSku_(sku),pgChMarca_(marca),pgChGraf_(grafica),pgChCD_(cd)].join('|');
  const kitKey = (r) => [r.id || pgChNumero_(r.n),pgChSku_(r.sku),pgChMarca_(r.brand||r.brandName),pgChCD_(r.cd),r.kit,r.legacy?r.legacyKey:''].join('|');
  const lotes = new Map();
  const imported=pgChImportarPainelSetembro_(dados.spg,dados.panel);
  (dados.spg||[]).concat(imported).forEach(r => {
    if (!r.n || !r.cat) return;
    const id = r.id || 'SPG-'+pgChNumero_(r.n);
    let t = tickets.get(id);
    if (!t) {
      t = {id,n:r.n,cat:r.cat,legacy:!!r.legacy,brand:pgChMarcaNome_(r.brand||r.brandName),shipment:r.shipment,status:r.status,priority:r.priority,
        owner:r.owner,created:pgChData_(r.created),desired:pgChData_(r.desired),goal:pgChData_(r.goal),op:r.op,
        edition:r.edition,why:r.why,obs:r.obs,reason:r.reason,steps:{},issues:[],panel:[],items:[],alerts:[],refs:[],_groups:new Map()};
      tickets.set(id,t); pgChAdd_(numeros,pgChNumero_(r.n),t);
    }
    const opening=pgChData_(r.created);
    if(opening&&(!t.created||opening<t.created))t.created=opening;
    if(r.legacy&&!/CONCLU|ENTREGUE/.test(r.status))t.status=r.status;
    if(!t.op&&r.op)t.op=r.op;
    if(!t.edition&&r.edition)t.edition=r.edition;
    if (r.map && !t.refs.includes(r.map)) t.refs.push(r.map);
    if (r.issue && !t.issues.includes(r.issue)) t.issues.push(r.issue);
    const stages = {Abertura:r.created,Aceite:r.accepted,Liberação:r.released,Alocação:r.allocated,
      'Validação de custo':r.cost,'OC aberta':r.ocOpen,'OC aprovada':r.ocDone,Produzido:r.produced,Conclusão:r.closed,Cancelamento:r.canceled};
    for (const nome in stages) {
      const real=pgChData_(stages[nome]), plan=nome==='Validação de custo'?pgChData_(r.costPlan):'';
      if (real || plan) {
        const prev=t.steps[nome] || {};
        t.steps[nome]=pgChEtapa_(pgChUltima_([plan,prev.p]),pgChUltima_([real,prev.r]),r.legacy?'Painel de produção':'SPG');
      }
    }
    const k=kitKey(r); if (!lotes.has(k)) lotes.set(k,[]);
    lotes.get(k).push({t,r});
  });
  function addItem(t,r,qty,printer) {
    const key=rotaKey(r.sku,t.brand,printer,r.cd);
    let it=t._groups.get(key);
    if (!it) {
      it={id:t.id,legacy:!!r.legacy,sku:r.sku,desc:r.description,brand:t.brand,printer:pgChGrafNome_(printer),cd:pgChCDNome_(r.cd),qty:0,kits:[],rows:[],spg:[],cal:[],pcp:[],maps:[],stages:[],evidence:[]};
      t._groups.set(key,it); t.items.push(it);
      const ticketDest=pgChChaveChamadoDestino_(t.n,it.cd);
      if(ticketDest)pgChAdd_(porChamadoDestino,ticketDest,it);
      if (r.sku) pgChAdd_(porSKU,pgChSku_(r.sku),it);
      if (t.op) pgChAdd_(porOP,pgChToken_(t.op),it);
    }
    // Referências sem número no mapa só comprovam o item/destino que as informou.
    for(const code of pgChRefsMapa_(r.map))pgChAdd_(mapaRefs,code,it);
    it.qty+=qty; it.rows.push(r.row);
    if (r.kit && !it.kits.includes(r.kit)) it.kits.push(r.kit);
    const real=pgChDatasMapa_(null,r.pick,r.delivery,t.created);
    it.spg.push({q:qty,legacy:!!r.legacy,cut:r.cut,kit:r.kit,stock:pgChQtd_(r.stock),sub:pgChQtd_(r.sub),oc:r.oc,ocStatus:r.ocStatus,ocValue:r.ocValue,nf:r.nf,map:r.map,
      kitCreated:pgChData_(r.kitCreated),productCreated:pgChData_(r.productCreated),productLink:pgChData_(r.productLink),paginationDate:pgChData_(r.paginationDate),
      formal:pgChData_(r.formal),pickP:pgChData_(r.pickPlan),pick:real.pick,deliveryP:pgChData_(r.deliveryPlan),
      delivery:real.delivery,produced:pgChData_(r.produced),cost:pgChData_(r.cost),costP:pgChData_(r.costPlan),ocOpen:pgChData_(r.ocOpen),ocDone:pgChData_(r.ocDone),row:r.row});
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
  const envio=pgChEnvio_;
  const graf=pgChGraf_;
  dados.cal.forEach(c=>{
    if (pgChNormal_(c.kind).includes('PRINCIPAL') || !c.sku) return;
    const ts=numeros.get(pgChNumero_(c.n))||[];
    if (ts.length!==1) return;
    const t=ts[0];
    if (!comp(c.brand,t.brand,pgChMarca_) || !comp(c.shipment,t.shipment,envio)) return;
    const matches=(porSKU.get(pgChSku_(c.sku))||[]).filter(it=>it.id===t.id && comp(c.printer,it.printer,graf));
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
    const eligible=(porOP.get(pgChToken_(r.op))||[]).filter(it=>pgChSku_(it.sku)===pgChSku_(r.sku)
      && graf(it.printer)===graf(r.printer) && pgChCD_(it.cd)===pgChCD_(r.cd) && pgChMarca_(it.brand)===pgChMarca_(r.brand)
      && comp(tickets.get(it.id).shipment,r.shipment,envio));
    if (eligible.length===1) eligible[0].pcp.push(r);
  });
  dados.panel.forEach(r=>{
    const ts=numeros.get(pgChNumero_(r.n))||[];
    if (ts.length!==1 || !comp(r.brand,ts[0].brand,pgChMarca_) || !comp(r.shipment,ts[0].shipment,envio)) return;
    ts[0].panel.push({row:r.row,cd:pgChCDNome_(r.cd),printer:pgChGrafNome_(r.printer),status:r.status,note:r.note,responsible:r.responsible,criticality:r.criticality,risk:r.risk,cause:r.cause,
      startP:pgChData_(r.startP),startR:pgChData_(r.startR),endP:pgChData_(r.endP),endR:pgChData_(r.endR)});
  });
  const seen=new Map();
  dados.map.forEach(m=>{
    const code=m.map||m.code;
    if (!code || !m.sku || /^(SIM|TRUE|1)$/.test(pgChNormal_(m.canceled)) || /CANCEL/.test(pgChNormal_(m.state+' '+m.collection))) return;
    // Normaliza todos os domínios antes de procurar chamado e destino.
    const outCD=pgChCD_(m.cd),colCD=pgChCD_(m.colCD),cd=outCD||colCD;
    const printer=graf(m.printer||m.org),brand=pgChMarca_(m.brand);
    if(!cd||!printer)return;
    const generic=new Set(['ACABADORA','GRAFICA','CD','DESTINO']);
    const sameCol=!outCD||!colCD||outCD===colCD||generic.has(colCD);
    const allRaw=pgChUnicos_([m.n,m.nCol,m.nInc].filter(v=>v && !/^(0|-|não|false)$/i.test(v)));
    const raw=pgChUnicos_([m.n,m.nInc,sameCol?m.nCol:''].filter(v=>v && !/^(0|-|não|false)$/i.test(v)));
    const ns=pgChNumerosMapa_(raw);
    const codeKey=pgChCodigoMapa_(code),num=(codeKey.match(/^(\d{6})(?:-|$)/)||[])[1];
    // Número explícito + destino canônico, ou referência explícita do próprio item/destino.
    const candidates=allRaw.length?pgChUnicos_(ns.flatMap(n=>porChamadoDestino.get(pgChChaveChamadoDestino_(n,cd))||[])):
      pgChUnicos_([...(mapaRefs.get(codeKey)||[]),...(mapaRefs.get(num)||[])]).filter(it=>pgChCD_(it.cd)===cd);
    const named=allRaw.length?pgChUnicos_(pgChNumerosMapa_(allRaw).flatMap(n=>numeros.get(n)||[])):pgChUnicos_(candidates.map(it=>tickets.get(it.id)));
    if(!named.length)return;
    const sameRoute=it=>pgChCD_(it.cd)===cd&&(!brand||pgChMarca_(it.brand)===brand)&&comp(tickets.get(it.id).shipment,m.shipment,envio);
    const compatible=it=>it.printer&&graf(it.printer)===printer&&sameRoute(it);
    const skuRoutes=candidates.filter(it=>it.sku&&pgChSku_(it.sku)===pgChSku_(m.sku)&&sameRoute(it));
    let opts=skuRoutes.filter(compatible);
    // Gráfica ausente no SPG não é gráfica divergente. Aceita somente a
    // rota única do SKU, com marca explícita e vínculo inequívoco ao chamado
    // (número no mapa ou código completo registrado no próprio item).
    // Não realoca demanda nem altera a gráfica do SPG.
    let missingPrinter=false;
    if(!opts.length&&skuRoutes.length===1&&!skuRoutes[0].printer&&brand&&pgChMarca_(skuRoutes[0].brand)===brand){
      const candidate=skuRoutes[0],ticket=tickets.get(candidate.id);
      const explicit=raw.length&&ns.includes(pgChNumero_(ticket.n));
      const exactRef=!allRaw.length&&codeKey!==num&&(mapaRefs.get(codeKey)||[]).includes(candidate);
      if(explicit||exactRef){opts=[candidate];missingPrinter=true;}
    }
    // Legado realmente sem SKU exige número explícito, destino e demais dimensões compatíveis.
    if(!opts.length&&raw.length&&ns.length===1&&named.length===1&&named[0].legacy&&brand){
      opts=candidates.filter(it=>it.legacy&&!it.sku&&pgChMarca_(it.brand)===brand&&compatible(it));
    }
    if (opts.length>1 && m.kit) {
      const ex=opts.filter(it=>it.kits.includes(m.kit)); if(ex.length) opts=ex;
    }
    if (opts.length!==1) {
      const affected=pgChUnicos_(opts.map(it=>tickets.get(it.id)).concat(named));
      affected.forEach(t=>t.alerts.push({src:'map',row:m.row,map:code,sku:m.sku,
        text:opts.length?'Rota compatível com mais de um item ou chamado':'Chamado citado; SKU ou rota divergente'}));
      return;
    }
    const it=opts[0], qty=pgChQtd_(m.qty);
    const dates=pgChDatasMapa_(transport.get(pgChCodigoMapa_(code)),
      pgChDataRealChamado_(m.picked,tickets.get(it.id).created)||(sameCol?pgChDataRealChamado_(m.colPick,tickets.get(it.id).created):''),
      pgChDataRealChamado_(m.delivered,tickets.get(it.id).created)||pgChDataRealChamado_(m.checked,tickets.get(it.id).created),tickets.get(it.id).created);
    const hasCount=pgChTexto_(m.received)!=='';
    const event={row:m.row,map:code,kit:m.kit,sku:m.sku,nf:m.nf,qty,created:pgChData_(m.created),book:pgChData_(m.book),
      ...dates,eta:pgChData_(m.eta),
      delivered:dates.delivery?(hasCount?Math.min(qty,pgChQtd_(m.received)):(/^(SIM|TRUE)$/.test(pgChNormal_(m.divergent))?0:qty)):0,
      method:(raw.length?'Número do chamado + destino':'Mapa informado no SPG + destino')+(missingPrinter?' · gráfica ausente no SPG':''),
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
        stage(it.pcp,'finishP','finishR','PCP'),stage(it.pcp,'kitP','kitR','PCP'), stage(it.spg,'','produced',it.legacy?'Painel de produção':'SPG')];
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
      it.mapped=sum(m=>Math.max(0,m.qty));it.deliveryEvidence=pgChEntregaRota_(it);it.delivered=it.deliveryEvidence.delivered;it.collection=pgChColetaRota_(it);it.picked=it.collection.picked;
      const spgForecast=pgChUltima_(it.spg.map(s=>s.deliveryP));
      const days=sla.get(pgChGraf_(it.printer)+'|'+pgChCD_(it.cd));
      function transporte(coleta){
        if(!coleta || days==null)return '';
        const d=new Date(coleta+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
      }
      const outstanding=it.maps.filter(m=>m.delivered<m.qty);
      const fullForecast=pgChMarcoItens_(it.spg.filter(s=>s.q>0),'deliveryP');
      const forecasts=outstanding.map(m=>({date:fullForecast||m.eta||transporte(m.pick||m.book)||spgForecast,source:fullForecast?'SPG':m.eta?'Mapa':transporte(m.pick||m.book)?'Coleta + Matriz SLA':spgForecast?'SPG':''}));
      const saldo=Math.max(0,it.qty-it.delivered);
      if(saldo && it.mapped<it.qty){
        const pickup=pgChUltima_(it.spg.map(s=>s.pick||s.pickP||s.formal));
        forecasts.push({date:spgForecast||transporte(pickup),source:spgForecast?'SPG':transporte(pickup)?'Coleta + Matriz SLA':''});
      }
      it.eta=saldo?(fullForecast||pgChUltima_(forecasts.map(f=>f.date))):'';
      it.etaPartial=!!saldo && !fullForecast && forecasts.some(f=>!f.date);
      it.forecastSource=fullForecast?'SPG':pgChUnicos_(forecasts.map(f=>f.source)).join(' + ');
      const costs=t.costs.filter(c=>pgChSku_(c.sku)===pgChSku_(it.sku) && pgChGraf_(c.printer)===pgChGraf_(it.printer) && pgChCD_(c.cd)===pgChCD_(it.cd));
      const validCosts=costs.filter(c=>/^(CONCLUID[OA]|VALIDAD[OA]|FINALIZAD[OA])$/.test(pgChNormal_(c.status)));
      const costStage=stage(it.spg,'costP','cost',it.legacy?'Painel de produção':'SPG');
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
        ocStage.f=matchedCost.length?'BD OC + validação de custos':it.legacy?'Painel de produção':'SPG';
        ocStage.a=qtyOC>=it.qty?'OC emitida':'Parcial';
        if(qtyOC>=it.qty){
          const spgDate=pgChMarcoItens_(spgOcs,'ocOpen')||pgChMarcoItens_(spgOcs,'ocDone');
          ocStage.r=spgDate||pgChUltima_(orders.filter(o=>matchedCost.some(c=>pgChNormal_(c.lot)===pgChNormal_(o.id)||c.oc===o.oc)||spgOcs.some(s=>s.oc===o.oc)).map(o=>o.sent));
          if(spgDate)ocStage.f=it.legacy?'Painel de produção':'SPG';
        }
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
        it.collection.date),log(it.delivered,spgForecast||it.eta,it.deliveryEvidence.date));
      if(it.collection.source)it.stages[10].f=it.collection.source;
      if(it.deliveryEvidence.source)it.stages[11].f=it.deliveryEvidence.source;
      const formal=pgChMarcoItens_(it.spg.filter(s=>s.q>0),'formal');
      if(formal){it.stages[10].agreed=formal;it.stages[10].agreedSource=it.legacy?'Painel de produção':'SPG · Coleta formalizada';}
      if(dados.agreements)pgChAplicarAcordo_(it,t,dados.agreements);
      totals.qty+=it.qty;totals.balance+=saldo;
      for(const k of ['mapped','picked','delivered']) totals[k]+=Math.min(it.qty,it[k]);
      it.coverage=it.stages.map((s,i)=>Math.max(0,Math.min(it.qty,i>=9?[it.mapped,it.picked,it.delivered][i-9]:s.units!=null?s.units:s.r?it.qty:0)));
      pgChValidarFunilRota_(t,it);
      it.productionStatus=pgChStatusRota_(t,it,painel);it.target=pgChPrazoRota_(t,it,leadProfile,days);
      it.coverage.forEach((v,i)=>{totals.coverage[i]+=v;});
      if(saldo){if(it.eta)pendingEtas.push(it.eta);if(!it.eta||it.etaPartial)missingEta=true;}
    }
    t.totals=totals;t.production=pgChResumoStatus_(t.items);t.target=pgChPrazoResumo_(t.items);
    summaries.push({id:t.id,n:t.n,cat:t.cat,legacy:t.legacy,brand:t.brand,shipment:t.shipment,status:t.status,priority:t.priority,created:t.created,
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
