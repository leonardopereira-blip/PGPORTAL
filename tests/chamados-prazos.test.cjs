const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const ctx=vm.createContext({});for(const name of ['ChamadosModelo','ChamadosIndicadores'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),ctx);
test('prazo de 25 dias preserva SLA e não depende da categoria',()=>{const p=ctx.pgChLeadProfile_([]);for(const cat of ['REENTRADA','SPOT','MANUSEIO','INCLUSIVOS']){const x=ctx.pgChPrazoRota_({created:'2026-11-18',cat,brand:'SAS'},{printer:'LOGPRINT',cd:'JDI',qty:1,coverage:Array(12).fill(0)},p,3);assert.equal(x.deadline,'2026-12-13');assert.equal(x.dates[10],'2026-12-10');assert.ok(x.dates.every(d=>d<=x.deadline));}});
test('mediana segmentada usa amostra de dez rotas distintas',()=>{const rows=Array.from({length:12},(_,n)=>({n:String(n),status:'Concluído',brand:'SAS',printer:'LOGPRINT',cd:'JDI',created:'2026-10-01',allocated:'2026-10-03',startR:'2026-10-04',endR:'2026-10-14'}));const p=ctx.pgChLeadProfile_(rows.concat(rows));const x=ctx.pgChPrazoRota_({created:'2026-11-18',brand:'SAS'},{printer:'LOGPRINT',cd:'JDI',qty:1,coverage:Array(12).fill(0)},p,3);assert.equal(p.n,12);assert.equal(x.profile[2].v,10);assert.equal(x.profile[2].n,12);});
test('coleta formalizada ancora etapas anteriores e prevalece sobre previsão e SLA',()=>{
 const p=ctx.pgChLeadProfile_([]),t={created:'2026-11-01',brand:'SAS'},base={printer:'LOGPRINT',cd:'JDI',qty:10,coverage:Array(12).fill(0)};
 const x=ctx.pgChPrazoRota_(t,{...base,spg:[{q:5,formal:'2026-11-20',pickP:'2026-11-24'},{q:5,formal:'2026-11-22'}]},p,3);
 assert.equal(x.deadline,'2026-11-26');assert.equal(x.pickupAnchor,'2026-11-20');assert.equal(x.pickupAnchorSource,'Formalizada');
 assert.equal(x.dates[10],'2026-11-20');assert.ok(x.dates.slice(0,10).every(d=>d<'2026-11-20'));
 const y=ctx.pgChPrazoRota_(t,{...base,spg:[{q:10,pickP:'2026-11-22'}]},p,3);
 assert.equal(y.pickupAnchor,'2026-11-22');assert.equal(y.pickupAnchorSource,'Prevista');
 const z=ctx.pgChPrazoRota_(t,{...base,stages:Array.from({length:12},(_,i)=>i===10?{agreed:'2026-11-21'}:{})},p,3);
 assert.equal(z.pickupAnchor,'2026-11-21');
 const sum=ctx.pgChPrazoResumo_([{qty:10,target:x},{qty:10,target:y}]);assert.equal(sum.dates[0],x.dates[0]);assert.equal(sum.deadline,x.deadline);
});
