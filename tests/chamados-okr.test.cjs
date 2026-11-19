const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','abaCentralChamados.html'),'utf8').split('// CH_OKR_PURE_BEGIN')[1].split('// CH_OKR_PURE_END')[0];
const ctx=vm.createContext({});vm.runInContext(source+';this.rules={chOKR,chFilteredTotals,chAging,chOKRDestinationRows};',ctx);
const {chOKR,chFilteredTotals,chOKRDestinationRows}=ctx.rules;
const t={id:'A',n:1,cat:'REENTRADA',created:'2026-11-17',desired:'2026-12-20',closed:'2026-12-12',delivered:'2026-12-13',brand:'SAS',shipment:'V4',groups:[],totals:{coverage:[]}};
const f={rule:'fixed',basis:'open',start:'2026-11-01',end:'2026-11-30',asof:'2026-12-31'};
test('25 dias inclusivos, 26 fora do prazo',()=>{assert.equal(chOKR([t],f).num,1);assert.equal(chOKR([{...t,closed:'2026-12-13'}],f).late,1)});
test('planning posterior, anterior e ausente',()=>{assert.equal(chOKR([{...t,closed:'2026-12-20'}],{...f,rule:'standard'}).num,1);assert.equal(chOKR([{...t,desired:'2026-11-20'}],{...f,rule:'standard'}).num,1);assert.equal(chOKR([{...t,desired:''}],{...f,rule:'desired'}).missing,1)});
test('corte histórico e prazo entre anos',()=>{assert.equal(chOKR([t],{...f,asof:'2026-12-01'}).upcoming,1);assert.equal(chOKR([{...t,created:'2026-12-31',desired:'',closed:'2027-01-25'}],{...f,start:'2026-12-01',end:'2026-12-31',asof:'2027-01-31'}).num,1)});
test('aging por chamado com faixa e acumulado',()=>{const r=chOKR([t,{...t,id:'B',delivered:'2026-11-26'}],f);assert.equal(r.bands[0].count,1);assert.equal(r.bands[3].count,1);assert.equal(r.bands[3].cum,100);assert.equal(r.delivery,2)});
test('filtro conjunto não cruza características de rotas diferentes e não duplica chamado',()=>{const g1={printer:'A',cd:'JDI',feature:['Capa dura'],qty:100,mapped:50,picked:50,delivered:0,balance:100,coverage:[50]},g2={printer:'B',cd:'FOR',feature:['Corte e vinco'],qty:30,mapped:30,picked:30,delivered:30,balance:0,coverage:[30]};const r={...t,groups:[g1,g2],totals:{coverage:[80]}};assert.equal(chFilteredTotals(r,{printer:'A',feature:'Corte e vinco'}),null);assert.equal(chFilteredTotals(r,{printer:'A',feature:'Capa dura'}).totals.qty,100);assert.equal(chOKR([r],{...f,printer:'B'}).den,1)});
test('coleta integral: sem formalização não entra no denominador; atraso na rota não é compensado',()=>{assert.equal(chOKR([{...t,pickDone:'2026-12-03',pickDue:'2026-12-04',pickLate:true}],{...f,rule:'pick'}).late,1);assert.equal(chOKR([{...t,pickDone:'2026-12-03',pickDue:''}],{...f,rule:'pick'}).missing,1)});

test('tiragem pondera classificação integral e exporta atraso, coleta e mapa',()=>{
 const x={...t,totals:{qty:100,coverage:[]},pickDone:'2026-12-03',pickSource:'Mapa',pickMaps:['MP-123456']};
 const y={...t,id:'B',n:2,closed:'2026-12-13',totals:{qty:300,coverage:[]}};
 const a=chOKR([x,y],{...f,unit:'qty'});assert.equal(a.num,100);assert.equal(a.den,400);assert.equal(a.pct,25);assert.equal(a.items[1].days,1);assert.equal(a.items[0].pick,'2026-12-03');assert.equal(a.items[0].maps[0],'MP-123456');
});
test('coleta histórica usa apenas eventos até o corte e respeita cada rota',()=>{
 const route=(date,due)=>({qty:100,collection:{parts:[{qty:100,kit:'K',due}],events:[{date,qty:100,kit:'K',source:'SPG · Coleta real'}],maps:[]}});
 const x={...t,totals:{qty:200,coverage:[]},okrRoutes:[route('2026-11-28','2026-11-27'),route('2026-12-04','2026-12-05')]};
 const a=chOKR([x],{...f,rule:'pick'});assert.equal(a.late,1);assert.equal(a.items[0].days,1);
 const b=chOKR([x],{...f,rule:'pick',asof:'2026-12-03'});assert.equal(b.upcoming,1);assert.equal(b.items[0].pick,'');
});

test('destinos separados sem duplicar peso de chamados nem tiragem',()=>{
 const g=(cd,qty)=>({printer:'A',cd,qty,mapped:0,picked:0,delivered:0,balance:qty,coverage:[0]});
 const x={...t,groups:[g('CD FOR',30),g('CD JDI',100)],totals:{qty:130,coverage:[0]}};
 for(const unit of ['tickets','qty']){const opts={...f,unit},d=chOKR([x],opts),lines=chOKRDestinationRows(d,opts,[x]);assert.equal(lines.length,2);assert.equal(lines.reduce((n,x)=>n+x.qty,0),130);assert.equal(lines.reduce((n,x)=>n+x.den,0),d.den);assert.equal(lines.reduce((n,x)=>n+x.num,0),d.num);}
});
