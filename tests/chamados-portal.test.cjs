const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ctx=vm.createContext({});
for(const name of ['ChamadosModelo','ChamadosIndicadores','ChamadosFinanceiro','ChamadosPortal']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),ctx);
}
const a={n:'101',id:'74b79202-798e-4b12-b7da-b7dffa1e01f1',sku:'A',kit:'K',cat:'REENTRADA',brand:'SAS',printer:'Alpha',cd:'CJUN',qty:'100',
  status:'ALOCADO',edition:'V1-27-SAS-REENTRADA',shipment:'V1',created:'2026-09-01',row:2,op:'OP-A'};
const b={...a,n:'102',id:'30fdba9a-0210-4b89-b201-53d02ea89734',sku:'B',row:3};
const map={map:'MP-123456-SAS-V1-ALPHA',sku:'A',kit:'K',qty:'40',brand:'SAS',printer:'Alpha',cd:'Jundiaí - SP',n:'101 e 102',created:'2026-10-01',picked:'2026-10-02',delivered:'2026-10-04',received:'30',row:2};
const cost={lotId:'Validação_de_Custo_Reentrada_V1-27_SAS_ALPHA_Lote101_Jundiaí',lot:'101',type:'Reentrada',cycle:'V1-27',sku:'A',brand:'SAS',printer:'Alpha',cd:'Jundiaí',qty:'100',status:'Concluído',oc:'450001',row:4};
const order={id:cost.lotId,oc:'450001',req:'888888',brand:'SAS',printer:'Alpha',cd:'CD JUNDIAI',type:'Reentrada',row:10};
const build=(input={})=>ctx.pgChModelo_({spg:[a,b],map:[],cal:[],pcp:[],panel:[],oc:[],cost:[],...input});
test('TP usa o código inteiro e a última coleta até a última entrega, inclusive no mesmo dia',()=>{
  const tp=[
    {map:map.map,pick:'05/10/2026',delivery:'07/10/2026',row:11},
    {map:' '+map.map.toLowerCase()+' ',pick:'08/10/2026',row:12},
    {map:map.map,pick:'09/10/2026',delivery:'08/10/2026',row:13},
    {map:map.map.replace('SAS','SAE'),pick:'10/10/2026',delivery:'12/10/2026',row:14}
  ];
  for(const rows of [tp,tp.slice().reverse()]){
    const result=build({spg:[{...a,pick:'03/10/2026'}],map:[{...map,qty:'100',received:'100'}],tp:rows});
    const item=result.tickets.get(a.id).items[0], event=item.maps[0], summary=result.summaries[0];
    assert.equal(event.pick,'2026-10-08');assert.equal(event.delivery,event.pick);
    assert.equal(event.tpPickRow,12);assert.equal(event.tpDeliveryRow,13);
    assert.equal(item.stages[10].r,event.pick);assert.equal(item.stages[11].r,event.delivery);
    assert.equal(summary.pickDone,event.pick);assert.equal(summary.delivered,event.delivery);
    assert.equal(summary.pickSource,'Transportes');assert.equal(summary.deliverySource,'Transportes');
    assert.equal(item.picked,100);assert.equal(item.delivered,100);assert.equal(item.maps.length,1);
  }
});
test('TP mantém o valor anterior em cada campo ausente, inválido ou incompatível',()=>{
  const event=tp=>build({map:[map],tp}).tickets.get(a.id).items[0].maps[0];
  const base=event([]);
  for(const r of [{map:'MP-123456'},{map:map.map+'-X'},{map:'-'}]){
    assert.deepEqual(event([{...r,pick:'03/10/2026',delivery:'04/10/2026',row:2}]),base);
  }
  for(const [pick,delivery,expectedPick,expectedDelivery] of [
    ['03/10/2026','','2026-10-03',base.delivery],
    ['','06/10/2026',base.pick,'2026-10-06'],
    ['06/10/2026','',base.pick,base.delivery],
    ['','01/10/2026',base.pick,base.delivery],
    ['10/10/2026','07/10/2026',base.pick,'2026-10-07'],
    ['31/02/2026','PENDENTE',base.pick,base.delivery]
  ]){
    const m=event([{map:map.map,pick,delivery,row:2}]);
    assert.equal(m.pick,expectedPick);assert.equal(m.delivery,expectedDelivery);assert.ok(m.pick<=m.delivery);
    assert.equal(m.delivered,30);
  }
});
test('TP parcial substitui só a parcela do mapa; o saldo mantém a coleta do SPG',()=>{
  const result=build({spg:[{...a,pick:'01/10/2026'},b],map:[map,{...map,row:8}],
    tp:[{map:map.map,pick:'03/10/2026',row:2}]});
  const it=result.tickets.get(a.id).items[0], events=it.collection.events;
  assert.equal(it.collection.date,'2026-10-03');assert.equal(it.picked,100);
  assert.equal(events.find(e=>e.source==='Transportes').qty,40);
  assert.equal(events.find(e=>e.source.startsWith('SPG')).qty,60);
  assert.equal(result.tickets.get(b.id).totals.picked,0);
});
test('parcelas com e sem TP mantêm suas datas; TP não preenche uma parcela sem evidência',()=>{
  const second={...map,map:'MP-999999-OUTRO',qty:'60',picked:'06/10/2026',delivered:'07/10/2026',received:'60'};
  const tp=[{map:map.map,pick:'03/10/2026',delivery:'04/10/2026',row:6}];
  const item=maps=>build({spg:[a],map:maps,tp}).tickets.get(a.id).items[0];
  const partial=item([map]);assert.equal(partial.collection.date,'');assert.equal(partial.picked,40);
  const full=item([map,second]);assert.equal(full.collection.date,'2026-10-06');
  assert.equal(full.maps[1].delivery,'2026-10-07');assert.equal(full.delivered,90);
});
test('leitura em lote de C, G e Z preserva as linhas mesmo com datas vazias',()=>{
  const prev=ctx.Sheets;
  try{
    ctx.Sheets={Spreadsheets:{Values:{batchGet(id,request){
      assert.deepEqual(Array.from(request.ranges),["'Base Fechada'!C1:C","'Base Fechada'!G1:G","'Base Fechada'!Z1:Z"]);
      assert.equal(request.valueRenderOption,'FORMATTED_VALUE');
      return {valueRanges:[['MAPA ','A','','B'],['DATA DA COLETA','01/10/2026'],['ENTREGUE','','','04/10/2026']].map(c=>({values:[c]}))};
    }}}};
    const {rows}=ctx.pgChLerTransportes_();
    assert.equal(rows.length,2);assert.equal(rows[0].row,2);assert.equal(rows[0].pick,'01/10/2026');
    assert.equal(rows[1].row,4);assert.equal(rows[1].delivery,'04/10/2026');assert.equal(rows[1].pick,undefined);
  }finally{ctx.Sheets=prev;}
});
test('um mapa compartilhado credita apenas o SKU compatível e mantém a entrega parcial',()=>{
  const m=build({map:[map,{...map,row:3}]}),t=m.tickets.get(a.id);
  assert.equal(t.totals.picked,40);assert.equal(t.totals.delivered,30);assert.equal(t.totals.balance,70);
  assert.equal(m.tickets.get(b.id).totals.mapped,0);assert.equal(t.items[0].maps.length,1);
});
test('coleta integral pode confirmar produção sem inventar data real nem gerar OC',()=>{
  const t=build({map:[{...map,qty:'150'}],spg:[a,{...a,sku:'C',qty:'25'}]}).tickets.get(a.id);
  assert.equal(t.totals.picked,100);assert.equal(t.totals.coverage[3],100);assert.equal(t.items[0].stages[3].r,'');assert.equal(t.totals.coverage[8],0);
});
test('mapa sem vínculo explícito não alimenta chamados mesmo com rota única',()=>{
  const fallback={...map,n:''};
  const good=build({map:[fallback,{...map,canceled:'TRUE',map:'MP-888888'},{...map,n:'999',map:'MP-777777'}]});
  assert.equal(good.tickets.get(a.id).items[0].maps.length,0);
  assert.equal(build({spg:[{...a,map:map.map},b],map:[fallback]}).tickets.get(a.id).items[0].maps.length,1);
  assert.equal(build({spg:[{...a,map:map.map+'-OUTRO'},b],map:[fallback]}).tickets.get(a.id).items[0].maps.length,0);
  const ambiguous=build({spg:[a,{...b,sku:'A'}],map:[fallback]});
  for(const t of ambiguous.tickets.values()){assert.equal(t.totals.mapped,0);assert.equal(t.alerts.length,0);}
});
test('calendário e PCP não emprestam eventos do principal e SLA zero é uma rota válida',()=>{
  const c={n:'101',sku:'A',brand:'SAS',printer:'Alpha',shipment:'1',fileR:'05/10/2026'};
  const t=build({spg:[{...a,pickPlan:'2026-10-15'}],cal:[{...c,kind:'PRINCIPAL'},c],pcp:[{...a,op:'OUTRA',printR:'2026-10-05'}],sla:[['Fornecedor','CD JDI'],['Alpha','0']]}).tickets.get(a.id);
  assert.equal(t.items[0].cal.length,1);assert.equal(t.items[0].stages[0].r,'2026-10-05');assert.equal(t.items[0].pcp.length,0);
  assert.equal(t.items[0].eta,'2026-10-15');assert.equal(t.items[0].forecastSource,'Coleta + Matriz SLA');
});
test('lote completo, SKU e rota validam custo e OC; requisição coincidente não identifica PG',()=>{
  const t=build({cost:[cost],oc:[order,{...order,id:'SEM ID PG',req:'101',oc:'789999'},
    {...order,brand:'COC'},{...order,cd:'CD CE'},{...order,oc:'999999'}]}).tickets.get(a.id);
  assert.equal(t.costs.length,1);assert.equal(t.orders.length,1);assert.equal(t.orders[0].req,'888888');
  assert.equal(t.alerts.filter(x=>x.src==='oc').length,3);
});
test('um chamado aceita várias OCs com chaves de lote e CDs independentes',()=>{
  const second={...cost,lotId:cost.lotId.replace('Jundiaí','Fortaleza'),cd:'Fortaleza',oc:'450002'};
  const t=build({spg:[a,{...a,cd:'CITA'}],cost:[cost,second],oc:[order,{...order,id:second.lotId,oc:'450002',cd:'CD CE'}]}).tickets.get(a.id);
  assert.equal(t.costs.length,2);assert.equal(t.orders.length,2);
});
test('registro manual mantém histórico, reenvio idempotente e proteção contra edição concorrente',()=>{
  const rows=[],sheet={getLastRow:()=>rows.length+1,getRange:()=>({getDisplayValues:()=>rows})};
  ctx.pgArquivoObservacoesGiro_=()=>({getSheetByName:()=>sheet,getId:()=>'fake'});
  ctx.pgGiroEventoId_=v=>v;ctx.pgChSnapshot_=()=>({rows:[a]});ctx.Session={getActiveUser:()=>({getEmail:()=>'equipe@example.org'})};
  ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  ctx.Sheets={Spreadsheets:{Values:{append(body,id,range,options){assert.equal(options.valueInputOption,'RAW');rows.push(body.values[0]);}}}};
  const save=(base,id,note)=>ctx.salvarTratativaChamadoPortal(a.id,'Em análise',note,base,id);
  assert.equal(save('','evento-001','=observação').ok,true);assert.equal(save('','evento-001','=observação').ok,true);
  assert.equal(rows.length,1);assert.equal(save('','evento-002','outra').conflict,true);
  assert.equal(save('evento-001','evento-002','outra').ok,true);assert.equal(rows.length,2);
});

test('coleta parcial propaga somente a própria quantidade e SKU',()=>{
 const t=build({spg:[a,{...a,sku:'C',qty:'60'}],map:[map]}).tickets.get(a.id);assert.equal(t.totals.coverage[0],40);assert.equal(t.totals.coverage[3],40);assert.equal(t.totals.coverage[6],40);assert.equal(t.totals.coverage[7],0);assert.equal(t.items.find(x=>x.sku==='C').coverage[3],0);assert.equal(t.totals.balance,130);
});
test('entrega sem coleta datada confirma apenas unidades recebidas',()=>{
 const t=build({spg:[a],map:[{...map,picked:'',received:'30'}]}).tickets.get(a.id);assert.equal(t.totals.picked,30);assert.equal(t.totals.delivered,30);assert.equal(t.totals.coverage[3],30);
});
test('mapa com número explícito não cobre SKU sem gráfica ou CD divergente',()=>{
 assert.equal(build({spg:[{...a,printer:''}],map:[map]}).tickets.get(a.id).totals.picked,0);
 assert.equal(build({spg:[a],map:[{...map,cd:'Fortaleza'}]}).tickets.get(a.id).totals.picked,0);
});
test('status por SKU preserva saldo e rotas divergentes',()=>{
 const t=build({spg:[a,{...a,sku:'C',printer:'',qty:'25'}],map:[{...map,qty:'100',received:'100'}]}).tickets.get(a.id);assert.equal(t.production.find(p=>p.label==='Entregue integralmente').qty,100);assert.equal(t.production.find(p=>p.label==='Em alocação').qty,25);
});
test('PCP posterior confirma etapas anteriores sem inventar datas',()=>{
 const t=build({spg:[a],pcp:[{...a,finishR:'2026-10-02'}]}).tickets.get(a.id);assert.equal(t.totals.coverage[0],100);assert.equal(t.totals.coverage[3],100);assert.equal(t.totals.coverage[4],100);assert.equal(t.totals.coverage[5],0);
});

test('de-para oficial PCP: todos os 64 pares normalizam na dimensão correta',()=>{
 const check=(rows,fn)=>rows.forEach(([x,y])=>{assert.equal(fn(x),fn(y));assert.equal(fn(x),y==='RAIZES'?'RAÍZES':y);});
 check([["COAN","COAN"],["MIDIOGRAF","MIDIOGRAF"],["MAXIGRAFICA","MAXI"],["RICARGRAF","RICARGRAF"],["RONA","RONA"],["REPROSET","REPROSET"],["IPSIS","IPSIS"],["PIFFERPRINT","PIFFER"],["BERCROM","BERCROM"],["STAR7","STAR7"],["LOGPRINT","LOGPRINT"],["WALPRINT","WALPRINT"],["POSIGRAF","POSIGRAF"],["META","META"],["IMOS","IMOS"],["LEOGRAF","LEOGRAF"],["SAO FRANCISCO","SÃO FRANCISCO"],["OCEANO","OCEANO"],["FORMA CERTA","FORMA CERTA"],["ZIT","ZIT"],["MARGRAF","MARGRAF"]],ctx.pgChGraf_);check([["Maralto","MAR"],["Geekie","GEE"],["Gênio","GEN"],["PES","PES"],["POSITIVO","SPE"],["Mestre","MES"],["SAS","SAS"],["COC","COC"],["CQT","CQT"],["EI","EI"],["Pleno","PLE"],["SAE","SAE"],["SAS ADAPT","SAS ADAPT"],["SELO NEUTRO","NEU"],["WAYS","WAYS"],["Nave à Vela","NAV"],["Piá","PIA"],["IS","IS"],["SAS-BRADESCO","SAS - BRADESCO"]],ctx.pgChMarca_);check([["CSJR","RAÍZES"],["CRPR","CD RP"],["CCWB","POSIGRAF"],["CJUN","CD JDI"],["CITA","CD FOR"],["CLOV","KN"],["ANTILHAS","ANTILHAS"],["KN","KN"],["POSIGRAF","POSIGRAF"],["RICARGRAF","RICARGRAF"],["LEOGRAF","LEOGRAF"],["MAXIGRAFICA","MAXIGRAFICA"],["RONA","RONA"],["PIFFERPRINT","PIFFER"],["STAR7","STAR7"],["RAIZES","RAIZES"],["FORMA CERTA","FORMA CERTA"],["ATHOS","ATHOS"],["LOGPRINT","LOGPRINT"],["IMOS","IMOS"],["BERCROM","BERCROM"],["TRATTO MANUSEIO","KN"],["HR","HR"],["EMBALARTE","EMBALARTE"]],ctx.pgChCD_);
 assert.equal(ctx.pgChGraf_('MAXIGRAFICA'),'MAXI');assert.equal(ctx.pgChCD_('MAXIGRAFICA'),'MAXIGRAFICA');assert.equal(ctx.pgChCD_('POSIGRAF'),'POSIGRAF');
});
test('de-para permite cruzamento exato de chamado, SKU, marca, gráfica e CD sem emprestar para outra rota',()=>{
 const base={...a,brand:'Maralto',printer:'MAXIGRAFICA',cd:'CITA'},other={...base,cd:'CJUN'};
 const t=build({spg:[base,other],map:[{...map,brand:'MAR',printer:'MAXI',cd:'CD FOR',n:'101',qty:'150',received:'100'}]}).tickets.get(a.id);
 assert.equal(t.brand,'MAR');assert.equal(t.items.find(x=>x.cd==='CD FOR').printer,'MAXI');assert.equal(t.items.find(x=>x.cd==='CD FOR').coverage[3],100);assert.equal(t.items.find(x=>x.cd==='CD JDI').coverage[3],0);assert.equal(t.totals.balance,100);
});

test('estoque ou subcontratação não quebra a sequência física nem confirma custo ou OC',()=>{
 const x=build({spg:[{...a,stock:'100'}],map:[{...map,picked:'',qty:'60',received:'40'}]}).tickets.get(a.id);
 assert.equal(x.totals.picked,40);assert.equal(x.totals.delivered,40);assert.equal(x.totals.coverage[3],40);assert.equal(x.totals.coverage[7],0);assert.equal(x.totals.coverage[8],0);assert.equal(x.totals.balance,60);
});
test('produção concluída de SKU sem gráfica não cria buraco no funil nem vira coleta',()=>{
 const x=build({spg:[{...a,printer:'',produced:'2026-10-03'}]}).tickets.get(a.id);
 assert.equal(x.totals.coverage[3],100);assert.equal(x.totals.coverage[6],100);assert.equal(x.totals.picked,0);
});
test('cada rota é monotônica mesmo com excedente de outro SKU',()=>{
 const x=build({spg:[a,{...a,sku:'C',qty:'75'}],map:[{...map,qty:'300',received:'300'}]}).tickets.get(a.id);
 assert.equal(x.totals.coverage[3],100);assert.equal(x.totals.picked,100);assert.equal(x.totals.delivered,100);assert.equal(x.totals.balance,75);
});

test('fallback de Coleta real SPG sem mapa, não cria mapa nem OC',()=>{
 const x=build({spg:[{...a,pick:'2026-09-15',formal:'2026-09-16'}]}).tickets.get(a.id);
 assert.equal(x.totals.picked,100);assert.equal(x.totals.mapped,0);assert.equal(x.totals.coverage[3],100);assert.equal(x.items[0].collection.source,'SPG · Coleta real');
});
test('Coleta real do SPG prevalece sobre mapa parcial sem baixar outro SKU',()=>{
 const x=build({spg:[{...a,pick:'2026-09-15'},{...a,sku:'C',qty:'60'}],map:[map]}).tickets.get(a.id);
 assert.equal(x.totals.picked,100);assert.equal(x.items.find(i=>i.sku==='C').picked,0);assert.equal(x.items[0].collection.date,'2026-09-15');
});

test('de-para de destinos informado: 55 variantes',()=>{for(const [x,y] of [["CD","CD"],["Posigraf","POSIGRAF"],["CD JDI","CD JDI"],["CD FOR","CD FOR"],["KN","KN"],["DEIGO","Deigo"],["RIBEIRÃO PRETO","CD RP"],["Raízes","RAÍZES"],["CD SBC","CD SBC"],["ATHOS","ATHOS"],["RP","CD RP"],["Athos - Osasco","ATHOS"],["IS","CD SBC"],["Fortaleza_CE","CD FOR"],["Jundiaí_SP","CD JDI"],["KN_SP","KN"],["Ribeirão_Preto_SP","CD RP"],["São_Bernardo_SP","CD SBC"],["Raízes_SP","RAÍZES"],["Fortaleza","CD FOR"],["Destino","Destino"],["Jundiaí","CD JDI"],["Ribeirão_Preto","CD RP"],["Acabadora - H.R ACABAMENTOS","HR"],["São José do Rio Preto - SP","RAÍZES"],["Jundiaí - SP","CD JDI"],["Acabadora - HR ACABAMENTOS","HR"],["Louveira - SP","KN"],["Ribeirão Preto - SP","CD RP"],["Acabadora - EMBALARTE","EMBALARTE"],["Curitiba - PR","POSIGRAF"],["Itaitinga - CE","CD FOR"],["Acabadora - KN em LOUVEIRA","KN"],["Fortaleza - CE","CD FOR"],["Acabadora - ANTILHAS","ANTILHAS"],["CD RP","CD RP"],["Antilhas","ANTILHAS"],["HR","HR"],["EMBALARTE","EMBALARTE"],["Acabadora - Tratto | Felk","FELK"],["Acabadora - ATHOS","ATHOS"],["Acabadora - ATHOS MANUSEIO E ARMAZENAGEM LTDA - FILIAL","ATHOS"],["Acabadora - HR ACABAMENTO","HR"],["Acabadora - ANTILHAS LOGISTICA E DEPOSITO DE MERCADORIAS PARA TERCEIROS LTDA","ANTILHAS"],["Acabadora - HR","HR"],["Acabadora - ATHOS - RUA: URBANO SANTOS, 901 SITIO BRITOS / SP","ATHOS"],["Acabadora - ATHOS RUA: URBANO SANTOS, 901 SITIO BRITOS / SP","ATHOS"],["Acabadora - RAÍZES","RAÍZES"],["Acabadora - HR Acabamentos Gráficos Eireli","HR"],["Acabadora - ANTILHAS LOGISTICA E DEPOSITO DE MERCADORIAS PARA TERCEIROS LTD","ANTILHAS"],["Acabadora - HR ACABAMENTOS EIRELI","HR"],["Acabadora - ATHOS GUARULHOS","ATHOS"],["Acabadora - KN","KN"],["Acabadora - POSIGRAF","POSIGRAF"],["Acabadora - FELK MANUSEIO LTDA","FELK"]])assert.equal(ctx.pgChCD_(x),ctx.pgChCD_(y));});
test('SPG confirma a própria rota mesmo que o mapa seja parcial ou tenha data diferente',()=>{const x=build({spg:[{...a,pick:'2026-09-15'},{...a,cd:'CITA',qty:'50'}],map:[map]}).tickets.get(a.id);assert.equal(x.items.find(i=>i.cd==='CD JDI').collection.date,'2026-09-15');assert.equal(x.items.find(i=>i.cd==='CD FOR').picked,0);assert.equal(x.totals.picked,100);});

test('mapa integral da própria rota confirma coleta mesmo com SPG parcial e kit sem correspondência',()=>{
 const result=ctx.pgChColetaRota_({qty:100,spg:[{q:40,pick:'2026-09-10',kit:'A'},{q:60,kit:'B'}],maps:[{qty:40,pick:'2026-09-11',map:'MP-1'},{qty:60,pick:'2026-09-12',map:'MP-2'}]});
 assert.equal(result.picked,100);assert.equal(result.date,'2026-09-12');assert.equal(result.events.reduce((n,e)=>n+e.qty,0),100);
});
test('mapa parcial e sem data integral não inventa data de coleta',()=>{
 const result=ctx.pgChColetaRota_({qty:100,spg:[{q:100}],maps:[{qty:40,pick:'2026-09-11'}]});assert.equal(result.date,'');assert.equal(result.picked,40);
});

test('importa exclusivamente setembro sem repetir chamado existente no SPG',()=>{
 const r={n:'900',brand:'SAS',shipment:'V1',category:'Reentrada, Preventiva',printer:'Alpha',cd:'CJUN',qty:'100',created:'2026-09-05',pickup:'2026-09-20',status:'Concluído',row:7};
 const model=build({panel:[r,{...r,row:8},{...r,cd:'CITA',qty:'40',row:9},{...r,n:'101'},{...r,n:'901',created:'2026-10-01'},{...r,n:'902',created:'2026-08-30'}]});
 const x=model.tickets.get('PAINEL-900');assert.equal(x.totals.qty,140);assert.equal(x.totals.picked,140);assert.equal(x.totals.delivered,0);assert.equal(x.items.length,2);assert.equal(model.tickets.size,3);assert.equal(x.items[0].collection.source,'Painel de produção · Histórico');
});
test('painel aberto não converte previsão em coleta e mapa exige vínculo explícito',()=>{
 const r={n:'900',brand:'SAS',shipment:'V1',category:'Reentrada',printer:'Alpha',cd:'CJUN',qty:'100',created:'2026-09-05',pickup:'2026-09-20',status:'Em produção',row:7};
 const x=build({panel:[r],map:[{...map,n:'900',qty:'100',received:'100'}]}).tickets.get('PAINEL-900');assert.equal(x.totals.picked,100);assert.equal(x.totals.delivered,100);assert.equal(x.items[0].collection.date,'2026-10-02');assert.equal(x.items[0].collection.source,'Mapa');
 const y=build({panel:[r],map:[{...map,n:'',qty:'100',received:'100'}]}).tickets.get('PAINEL-900');assert.equal(y.totals.picked,0);
});
test('histórico com data anterior à abertura não confirma coleta',()=>{
 const x=build({panel:[{n:'900',brand:'SAS',shipment:'V1',category:'SPOT',printer:'Alpha',cd:'CJUN',qty:'100',created:'2026-09-05',pickup:'2026-08-30',status:'Concluído'}]}).tickets.get('PAINEL-900');assert.equal(x.totals.picked,0);
});

test('coleta anterior à abertura não entra no SPG nem no mapa/TP; igualdade é válida',()=>{
  const ticket={...a,created:'2026-10-02',pick:'2026-10-01'};
  const before={...map,n:'101',qty:'100',received:'100',picked:'2026-10-01',delivered:'2026-10-01'};
  const x=build({spg:[ticket],map:[before],tp:[{map:map.map,pick:'2026-10-01',delivery:'2026-10-01',row:3}]}).summaries[0];
  assert.equal(x.pickDone,'');assert.equal(x.delivered,'');assert.equal(x.totals.picked,0);
  const y=build({spg:[ticket],map:[{...before,picked:'2026-10-02',delivered:'2026-10-02'}]}).summaries[0];
  assert.equal(y.pickDone,'2026-10-02');assert.equal(y.delivered,'2026-10-02');
});
test('TP seleciona coleta entre a abertura e entrega inclusive',()=>{
  const date=ctx.pgChDatasMapa_({picks:[{date:'2026-10-04',row:1},{date:'2026-10-03',row:2},{date:'2026-10-01',row:3}],delivery:'2026-10-03',deliveryRow:4},'','', '2026-10-02');
  assert.equal(date.pick,'2026-10-03');assert.equal(date.delivery,'2026-10-03');
});

test('número e destino normalizados isolam a coleta de cada CD do mesmo chamado e de outros chamados',()=>{
  const x={...a,n:'000101',brand:'Maralto',printer:'MAXIGRAFICA',cd:'CJUN',qty:'100'};
  const forRoute={...x,cd:'CITA'};
  const another={...x,n:'102',id:b.id};
  const route=(cd,date,n,code)=>({...map,brand:'MAR',printer:'MAXI',cd,n,map:code,qty:'100',received:'100',picked:date,delivered:date});
  const jdi=route('Jundiaí_SP','2026-10-02','101.0','MP-111111-MAR');
  const fort=route('Itaitinga - CE','2026-10-04','000101','MP-222222-MAR');
  const first=build({spg:[x,forRoute,another],map:[jdi]});
  const ticket=first.tickets.get(a.id);
  assert.equal(ticket.items.find(i=>i.cd==='CD JDI').collection.date,'2026-10-02');
  assert.equal(ticket.items.find(i=>i.cd==='CD FOR').collection.date,'');
  assert.equal(first.tickets.get(b.id).totals.picked,0);
  assert.equal(first.summaries.find(s=>s.id===a.id).pickDone,'');
  const both=build({spg:[x,forRoute,another],map:[jdi,fort]});
  assert.equal(both.summaries.find(s=>s.id===a.id).pickDone,'2026-10-04');
  assert.equal(both.summaries.find(s=>s.id===a.id).delivered,'2026-10-04');
});
test('mapa informado em um destino não vira referência para outro destino do mesmo chamado',()=>{
  const x={...a,map:map.map};
  const y={...a,cd:'CITA',map:''};
  const wrong={...map,n:'',cd:'Fortaleza_CE',qty:'100',received:'100'};
  const result=build({spg:[x,y],map:[wrong]}).tickets.get(a.id);
  assert.equal(result.totals.mapped,0);
  const correct=build({spg:[x,y],map:[{...wrong,cd:'Jundiaí - SP'}]}).tickets.get(a.id);
  assert.equal(correct.items.find(i=>i.cd==='CD JDI').collection.date,'2026-10-02');
  assert.equal(correct.items.find(i=>i.cd==='CD FOR').collection.date,'');
});
test('destino de coleta divergente não empresta chamado ou data à saída',()=>{
  const x={...a,cd:'CJUN'},y={...a,cd:'CITA'};
  const divergent={...map,n:'',nCol:'101',cd:'CITA',colCD:'Jundiaí_SP',qty:'100',received:'100'};
  assert.equal(build({spg:[x,y],map:[divergent]}).tickets.get(a.id).totals.mapped,0);
  const valid={...divergent,cd:'CJUN'};
  assert.equal(build({spg:[x,y],map:[valid]}).tickets.get(a.id).items.find(i=>i.cd==='CD JDI').collection.date,'2026-10-02');
  assert.equal(build({spg:[x,y],map:[{...divergent,n:'101',picked:'',colPick:'2026-10-02',delivered:'',received:''}]}).tickets.get(a.id).items.find(i=>i.cd==='CD FOR').collection.date,'');
});
test('normaliza formato de SKU, envio, número, marca, gráfica, destino e mapa antes de cruzar',()=>{
  const x={...a,n:'000101',sku:'12345.0',brand:'GKI',printer:'SDI GRAFICA',cd:'CITA',shipment:'V01',map:'MP-123456-GEK-V1-SDI'};
  const y={...map,n:'101',sku:'12345',brand:'GEK',printer:'SDI',cd:'Itaitinga - CE',shipment:'1',map:'MP – 123456 – GEK – V1 – SDI',qty:'100',received:'100'};
  const z=build({spg:[x],map:[y],tp:[{map:'mp-123456-gek-v1-sdi',pick:'2026-10-03',delivery:'2026-10-03',row:5}]}).summaries[0];
  assert.equal(z.pickDone,'2026-10-03');assert.equal(z.delivered,'2026-10-03');assert.equal(z.pickSource,'Transportes');
  assert.equal(ctx.pgChCD_('Acabadora - GRAFICA OCEANO'),'OCEANO');
  assert.equal(ctx.pgChCD_('Gráfica - LOG PRINT'),'LOGPRINT');
});

test('resumo devolve a mesma versão exigida pelo gerador JSON',()=>{
  const snapshot=ctx.pgChSnapshot_,events=ctx.pgChEventos_,manual=ctx.pgChColetasManuais_,logger=ctx.console;
  try{ctx.console={log(){}};ctx.pgChSnapshot_=()=>({calculationVersion:11,rows:[]});ctx.pgChEventos_=()=>[];ctx.pgChColetasManuais_=()=>new Map();
    const r=ctx.getChamadosPortal(false);assert.equal(r.calculationVersion,11);assert.equal(r.requiredCalculationVersion,11);
    ctx.pgChSnapshot_=()=>({calculationVersion:9,rows:[]});const old=ctx.getChamadosPortal(false);assert.equal(old.calculationVersion,9);assert.equal(old.requiredCalculationVersion,11);
  }finally{ctx.pgChSnapshot_=snapshot;ctx.pgChEventos_=events;ctx.pgChColetasManuais_=manual;ctx.console=logger;}
});

test('próxima etapa não volta para mapa, custo ou OC após coleta integral, sem inventar cobertura',()=>{
  const dates=Array.from({length:12},(_,i)=>'2026-11-'+String(i+1).padStart(2,'0'));
  const target={dates,deadline:dates[11],nextStage:9,next:dates[9]},coverage=[100,100,100,100,100,100,100,0,0,0,100,0];
  const inTransit=ctx.pgChProximaEtapa_(target,100,coverage);assert.equal(inTransit.nextStage,11);assert.equal(inTransit.next,dates[11]);assert.equal(coverage[9],0);
  assert.equal(ctx.pgChProximaEtapa_(target,100,[...coverage.slice(0,11),100]).nextStage,-1);
  assert.equal(ctx.pgChProximaEtapa_(target,100,[...coverage.slice(0,10),50,0]).nextStage,7);
});
test('leitura de JSON já publicado corrige próxima etapa por grupo sem nova geração',()=>{
 const snapshot=ctx.pgChSnapshot_,events=ctx.pgChEventos_,manual=ctx.pgChColetasManuais_,logger=ctx.console;
 const dates=Array.from({length:12},(_,i)=>'2026-11-'+String(i+1).padStart(2,'0')),target={dates,deadline:dates[11],nextStage:9,next:dates[9]},coverage=[100,100,100,100,100,100,100,0,0,0,100,0];
 try{ctx.console={log(){}};ctx.pgChSnapshot_=()=>({calculationVersion:11,rows:[{id:a.id,groups:[{qty:100,coverage,target}],totals:{qty:100,coverage},target}]});ctx.pgChEventos_=()=>[];ctx.pgChColetasManuais_=()=>new Map();
 const r=ctx.getChamadosPortal(false).rows[0];assert.equal(r.target.nextStage,11);assert.equal(r.groups[0].target.nextStage,11);assert.equal(r.groups[0].coverage[9],0);
 }finally{ctx.pgChSnapshot_=snapshot;ctx.pgChEventos_=events;ctx.pgChColetasManuais_=manual;ctx.console=logger;}
});
