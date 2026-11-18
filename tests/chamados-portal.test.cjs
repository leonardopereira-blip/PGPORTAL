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
test('um mapa compartilhado credita apenas o SKU compatível e mantém a entrega parcial',()=>{
  const m=build({map:[map,{...map,row:3}]}),t=m.tickets.get(a.id);
  assert.equal(t.totals.picked,40);assert.equal(t.totals.delivered,30);assert.equal(t.totals.balance,70);
  assert.equal(m.tickets.get(b.id).totals.mapped,0);assert.equal(t.items[0].maps.length,1);
});
test('coleta integral pode confirmar produção sem inventar data real nem gerar OC',()=>{
  const t=build({map:[{...map,qty:'150'}],spg:[a,{...a,sku:'C',qty:'25'}]}).tickets.get(a.id);
  assert.equal(t.totals.picked,100);assert.equal(t.totals.coverage[3],100);assert.equal(t.items[0].stages[3].r,'');assert.equal(t.totals.coverage[8],0);
});
test('vínculo por rota rejeita ambiguidade, cancelamento do mapa e número explícito divergente',()=>{
  const fallback={...map,n:''};
  const good=build({map:[fallback,{...map,canceled:'TRUE',map:'MP-888888'},{...map,n:'999',map:'MP-777777'}]});
  assert.equal(good.tickets.get(a.id).items[0].maps.length,1);
  const ambiguous=build({spg:[a,{...b,sku:'A'}],map:[fallback]});
  for(const t of ambiguous.tickets.values()){assert.equal(t.totals.mapped,0);assert.equal(t.alerts.length,1);}
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
