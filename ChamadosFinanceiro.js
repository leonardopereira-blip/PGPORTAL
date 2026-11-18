function pgChFinanceiro_(dados,tickets,numeros) {
  const lotes=new Map(), ordensSPG=new Map();
  function refs(v) { return (pgChTexto_(v).match(/\b\d{3,}\b/g)||[]); }
  function rota(t,r,sku) {
    return t.items.filter(it=>(!sku || pgChNormal_(it.sku)===pgChNormal_(sku)) && it.printer && it.cd && r.brand && r.printer && r.cd &&
      pgChMarca_(it.brand)===pgChMarca_(r.brand) && pgChGraf_(it.printer)===pgChGraf_(r.printer) && pgChCD_(it.cd)===pgChCD_(r.cd));
  }
  function alerta(ts,r,src,text) {
    pgChUnicos_(ts).forEach(t=>t.alerts.push({src,row:r.row,sku:r.sku||'',map:r.oc||'',text}));
  }
  function ciclo(t) { const m=/\bV\d+[-/](\d{2})(?:\D|$)/i.exec(t.edition||'');return m?'20'+m[1]:''; }
  tickets.forEach(t=>{
    t.costs=[];t.orders=[];
    t.items.forEach(it=>it.spg.forEach(s=>refs(s.oc).forEach(n=>pgChAdd_(ordensSPG,n,t))));
  });
  for(const r of dados.cost||[]){
    if(!r.lotId || !r.sku || pgChNormal_(r.type)==='PRINCIPAL')continue;
    const explicit=/(?:^|_)LOTE\s*(\d+)(?:_|$)/.exec(pgChNormal_(r.lotId));
    if(!explicit || explicit[1]!==pgChTexto_(r.lot) || !/REENTRADA|INCLUSIV|SPOT|MANUSEIO|BRAILLE|AMPLIAD/i.test(r.lotId))continue;
    const candidates=numeros.get(explicit[1])||[];
    if(!candidates.length)continue;
    const valid=candidates.filter(t=>rota(t,r,r.sku).length===1 && (!r.cycle || pgChNormal_(t.edition).startsWith(pgChNormal_(r.cycle))));
    if(valid.length!==1){alerta(candidates,r,'cost','Lote de custo citado; conferir SKU, marca, gráfica, ciclo e CD');continue;}
    const t=valid[0], key=pgChNormal_(r.lotId);
    const detail={row:r.row,lot:r.lotId,sku:r.sku,printer:pgChGrafNome_(r.printer),cd:pgChCDNome_(r.cd),qty:r.qty,value:r.value,
      status:r.status,date:pgChData_(r.end),sent:pgChData_(r.sent),req:r.req,oc:r.oc};
    t.costs.push(detail);
    pgChAdd_(lotes,key,t);
  }
  for(const r of dados.oc||[]){
    if(!r.id || pgChNormal_(r.type)==='PRINCIPAL')continue;
    const key=pgChNormal_(r.id),byLot=lotes.get(key)||[];
    // O ID da linha antiga tem campos delimitados. O número de requisição
    // da coluna N pertence a Compras e nunca identifica um chamado PG.
    const legacy=/^([^_]+)_(20\d{2})_([^_]+)_([^_]+)_(\d+)(?:_.*)?$/.exec(key);
    const named=/^CHAMADO\s+(\d+)\b/.exec(key);
    const lotNumber=/^VALIDACAO_DE_CUSTO_(?:REENTRADA|SPOT|MANUSEIO|INCLUSIVOS)_.+_LOTE(\d+)(?:_|$)/.exec(key);
    const n=legacy?legacy[5]:named?named[1]:lotNumber?lotNumber[1]:'';
    const byId=n?(numeros.get(n)||[]):[];
    const byOC=pgChUnicos_(refs(r.oc).flatMap(o=>ordensSPG.get(o)||[]));
    const candidates=pgChUnicos_(byLot.concat(byId,byOC));
    if(!candidates.length)continue;
    const match=candidates.filter(t=>{
      if(!rota(t,r,'').length)return false;
      if(n && String(t.n)!==n)return false;
      if(byLot.length && !byLot.includes(t))return false;
      if(byOC.length && !byOC.includes(t))return false;
      if(legacy && ((ciclo(t) && legacy[2]!==ciclo(t)) || pgChMarca_(legacy[3])!==pgChMarca_(r.brand) || pgChCD_(legacy[4])!==pgChCD_(r.cd)))return false;
      if(lotNumber && !byLot.includes(t))return false;
      const s=/^V(\d+)(?:[\/-](\d{2,4}))?$/.exec(pgChNormal_(r.shipment));
      if(s && (pgChNormal_(t.shipment)!=='V'+s[1] || (s[2] && ciclo(t) && !ciclo(t).endsWith(s[2]))))return false;
      if(byLot.includes(t)){
        const linhas=t.costs.filter(c=>pgChNormal_(c.lot)===key);
        if(!linhas.some(c=>pgChCD_(c.cd)===pgChCD_(r.cd) && pgChGraf_(c.printer)===pgChGraf_(r.printer)))return false;
        const ocLote=pgChUnicos_(linhas.flatMap(c=>refs(c.oc)));
        if(ocLote.length && refs(r.oc).length && !refs(r.oc).some(o=>ocLote.includes(o)))return false;
      }
      return true;
    });
    if(match.length!==1){alerta(candidates,r,'oc','OC ou requisição com vínculo divergente; conferir ID, marca, fornecedor e CD');continue;}
    match[0].orders.push({row:r.row,id:r.id,req:r.req,oc:r.oc,tri:r.tri,system:r.system,printer:pgChGrafNome_(r.printer),cd:pgChCDNome_(r.cd),value:r.value,
      opened:pgChData_(r.opened),sent:pgChData_(r.sent),approval:r.approval,status:r.status,
      method:byLot.length?'ID completo do lote + rota':n?'Chamado no ID + rota':'OC do SPG + rota'});
  }
}
