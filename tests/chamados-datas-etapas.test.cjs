const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ctx=vm.createContext({});
for(const name of ['ChamadosModelo','ChamadosIndicadores','ChamadosFinanceiro']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),ctx);
}
const base={n:'101',cat:'REENTRADA',sku:'A',kit:'K-A',brand:'SAS',printer:'ALPHA',
  cd:'CJUN',qty:'100',created:'2026-10-01',status:'ALOCADO',shipment:'V1'};
const build=input=>ctx.pgChModelo_({spg:[base],map:[],tp:[],cal:[],pcp:[],panel:[],cost:[],oc:[],spec:[],sla:[],...input});

test('resumo e grupos preservam previsão por fase, meta desejada e realização parcial',()=>{
  const spg=[base,{...base,sku:'B',kit:'K-B',qty:'50'},
    {...base,sku:'C',kit:'K-C',cd:'CITA',qty:'25'}];
  const cal=[
    {n:'101',sku:'A',brand:'SAS',printer:'ALPHA',shipment:'V1',fileP:'05/10/2026',fileR:'04/10/2026'},
    {n:'101',sku:'B',brand:'SAS',printer:'ALPHA',shipment:'V1',fileP:'07/10/2026'},
    {n:'101',sku:'C',brand:'SAS',printer:'ALPHA',shipment:'V1',fileP:'08/10/2026',fileR:'08/10/2026'}
  ];
  const result=build({spg,cal}),summary=result.summaries[0];
  assert.equal(summary.stages.length,12);
  assert.equal(summary.stages[0].p,'2026-10-08');
  assert.equal(summary.stages[0].r,'');
  assert.equal(summary.stages[0].a,'Parcial');
  assert.equal(summary.stages[0].f,'Calendário');
  assert.notEqual(summary.target.dates[0],summary.stages[0].p,'meta e previsão continuam campos distintos');
  const jdi=summary.groups.find(g=>g.cd==='CD JDI'),fortaleza=summary.groups.find(g=>g.cd==='CD FOR');
  assert.equal(jdi.stages[0].p,'2026-10-07');assert.equal(jdi.stages[0].r,'');assert.equal(jdi.stages[0].a,'Parcial');
  assert.equal(fortaleza.stages[0].p,'2026-10-08');assert.equal(fortaleza.stages[0].r,'2026-10-08');
  assert.equal(jdi.qty,150);assert.equal(fortaleza.qty,25);assert.equal(summary.totals.qty,175);
  for(const g of summary.groups){
    assert.equal(g.stages.length,12);assert.equal('stageItems' in g,false);assert.equal('targetItems' in g,false);
  }
  assert.doesNotThrow(()=>JSON.stringify(summary));
});

test('data real integral exige todas as rotas positivas e ignora rotas sem tiragem',()=>{
  const routes=[
    {qty:10,stages:[{p:'05/10/2026',r:'04/10/2026',f:'SPG + Mapa'}]},
    {qty:20,stages:[{p:'07/10/2026',r:'06/10/2026',f:'Mapa + Transportes'}]},
    {qty:0,stages:[{p:'31/12/2026',r:'',f:'Sem tiragem'}]}
  ];
  const stage=ctx.pgChDatasEtapas_(routes)[0];
  assert.equal(stage.p,'2026-10-07');assert.equal(stage.r,'2026-10-06');
  assert.equal(stage.f,'SPG + Mapa + Transportes');
  routes[1].stages[0].r='31/02/2026';
  assert.equal(ctx.pgChDatasEtapas_(routes)[0].r,'');assert.equal(ctx.pgChDatasEtapas_(routes)[0].a,'Parcial');
  const empty=ctx.pgChDatasEtapas_([]);
  assert.equal(empty.length,12);assert.ok(empty.every(s=>!s.p&&!s.r&&!s.a&&!s.f));
});

test('cobertura física inferida por coleta não inventa datas reais das fases anteriores',()=>{
  const summary=build({spg:[{...base,pick:'2026-10-08'}]}).summaries[0];
  assert.equal(summary.totals.coverage[3],100);
  assert.equal(summary.stages[3].r,'');assert.equal(summary.groups[0].stages[3].r,'');
  assert.equal(summary.stages[10].r,'2026-10-08');assert.equal(summary.pickDone,'2026-10-08');
  assert.equal(summary.totals.picked,100);assert.equal(summary.totals.mapped,0);
});

test('andamento sem realização mantém indicação da etapa e não se torna data',()=>{
  const stages=ctx.pgChDatasEtapas_([
    {qty:10,stages:[{p:'2026-10-05',a:'Em andamento',f:'Painel de produção'}]},
    {qty:20,stages:[{p:'2026-10-07',f:'PCP'}]}
  ]);
  assert.equal(stages[0].p,'2026-10-07');assert.equal(stages[0].r,'');
  assert.equal(stages[0].a,'Em andamento');assert.equal(stages[0].f,'Painel de produção + PCP');
});
