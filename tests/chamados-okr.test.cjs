const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','abaCentralChamados.html'),'utf8').split('// CH_OKR_PURE_BEGIN')[1].split('// CH_OKR_PURE_END')[0];
const ctx=vm.createContext({});vm.runInContext(source+';this.rules={chOKR,chFilteredTotals,chAging,chOKRDestinationRows};',ctx);
const {chOKR,chFilteredTotals,chOKRDestinationRows}=ctx.rules;
const t={id:'A',n:1,cat:'REENTRADA',created:'2026-11-17',desired:'2026-12-20',closed:'2026-12-18',pickDone:'2026-12-12',delivered:'2026-12-13',brand:'SAS',shipment:'V4',groups:[],totals:{coverage:[]}};
const f={rule:'fixed',basis:'open',start:'2026-11-01',end:'2026-11-30',asof:'2026-12-31'};
test('25 dias inclusivos, 26 fora do prazo',()=>{assert.equal(chOKR([t],f).num,1);assert.equal(chOKR([{...t,pickDone:'2026-12-13'}],f).late,1)});
test('planning posterior, anterior e ausente',()=>{assert.equal(chOKR([{...t,pickDone:'2026-12-20'}],{...f,rule:'standard'}).num,1);assert.equal(chOKR([{...t,desired:'2026-11-20'}],{...f,rule:'standard'}).num,1);assert.equal(chOKR([{...t,desired:''}],{...f,rule:'desired'}).den,0)});
test('corte histórico e prazo entre anos',()=>{assert.equal(chOKR([t],{...f,asof:'2026-12-01'}).upcoming,1);assert.equal(chOKR([{...t,created:'2026-12-31',desired:'',pickDone:'2027-01-25'}],{...f,start:'2026-12-01',end:'2026-12-31',asof:'2027-01-31'}).num,1)});
test('aging por chamado com faixa e acumulado',()=>{const r=chOKR([t,{...t,id:'B',pickDone:'2026-11-26'}],f);assert.equal(r.bands[0].count,1);assert.equal(r.bands[2].count,1);assert.equal(r.bands[2].cum,100);assert.equal(r.delivery,2)});
test('filtro conjunto não cruza características de rotas diferentes e não duplica chamado',()=>{const g1={printer:'A',cd:'JDI',feature:['Capa dura'],qty:100,mapped:50,picked:50,delivered:0,balance:100,coverage:[50]},g2={printer:'B',cd:'FOR',feature:['Corte e vinco'],qty:30,mapped:30,picked:30,delivered:30,balance:0,coverage:[30]};const r={...t,groups:[g1,g2],totals:{coverage:[80]}};assert.equal(chFilteredTotals(r,{printer:'A',feature:'Corte e vinco'}),null);assert.equal(chFilteredTotals(r,{printer:'A',feature:'Capa dura'}).totals.qty,100);assert.equal(chOKR([r],{...f,printer:'B'}).den,1)});
test('coleta integral: sem formalização não entra no denominador; atraso na rota não é compensado',()=>{assert.equal(chOKR([{...t,pickDone:'2026-12-03',pickDue:'2026-12-04',pickLate:true}],{...f,rule:'pick'}).late,1);assert.equal(chOKR([{...t,pickDone:'2026-12-03',pickDue:''}],{...f,rule:'pick'}).den,0)});

test('tiragem pondera classificação integral e exporta atraso, coleta e mapa',()=>{
 const x={...t,totals:{qty:100,coverage:[]},pickDone:'2026-12-03',pickSource:'Mapa',pickMaps:['MP-123456']};
 const y={...t,id:'B',n:2,pickDone:'2026-12-13',totals:{qty:300,coverage:[]}};
 const a=chOKR([x,y],{...f,unit:'qty'});assert.equal(a.num,100);assert.equal(a.den,400);assert.equal(a.pct,25);assert.equal(a.items[1].days,1);assert.equal(a.items[0].actual,'2026-12-03');assert.equal(a.items[0].maps[0],'MP-123456');
});
test('coleta histórica usa apenas eventos até o corte e respeita cada rota',()=>{
 const route=(date,due)=>({qty:100,collection:{parts:[{qty:100,kit:'K',due}],events:[{date,qty:100,kit:'K',source:'SPG · Coleta real'}],maps:[]}});
 const x={...t,totals:{qty:200,coverage:[]},okrRoutes:[route('2026-11-28','2026-11-27'),route('2026-12-04','2026-12-05')]};
 const a=chOKR([x],{...f,rule:'pick'});assert.equal(a.late,1);assert.equal(a.items[0].days,1);
 const b=chOKR([x],{...f,rule:'pick',asof:'2026-12-03'});assert.equal(b.upcoming,0);assert.equal(b.pending,1);assert.equal(b.late,1);assert.equal(b.items[0].pick,'');
});

test('destinos separados sem duplicar peso de chamados nem tiragem',()=>{
 const g=(cd,qty)=>({printer:'A',cd,qty,mapped:0,picked:0,delivered:0,balance:qty,coverage:[0]});
 const x={...t,groups:[g('CD FOR',30),g('CD JDI',100)],totals:{qty:130,coverage:[0]}};
 for(const unit of ['tickets','qty']){const opts={...f,unit},d=chOKR([x],opts),lines=chOKRDestinationRows(d,opts,[x]);assert.equal(lines.length,2);assert.equal(lines.reduce((n,x)=>n+x.qty,0),130);assert.equal(lines.reduce((n,x)=>n+x.den,0),d.den);assert.equal(lines.reduce((n,x)=>n+x.num,0),d.num);}
});

test('coletado antes do vencimento conta no prazo, ainda que encerramento SPG ocorra depois',()=>{
 const x={...t,created:'2026-11-06',desired:'2026-12-20',pickDone:'2026-11-09',closed:''};
 const z=chOKR([x],{...f,rule:'standard',asof:'2026-11-19'});assert.equal(z.num,1);assert.equal(z.den,1);assert.equal(z.upcoming,0);assert.equal(z.items[0].actual,'2026-11-09');
});
test('coleta determina realizado no critério de 25 dias e ignora encerramento',()=>{
 const x={...t,created:'2026-10-23',pickDone:'2026-11-05',closed:'2026-11-18'};
 const z=chOKR([x],{...f,start:'2026-09-05',end:'2026-12-06',asof:'2026-11-19'});assert.equal(z.num,1);assert.equal(z.items[0].due,'2026-11-17');assert.equal(z.items[0].actual,'2026-11-05');
});
test('categoria é configurável',()=>{const x={...t,cat:'SPOT'};assert.equal(chOKR([x],{...f,cat:['SPOT']}).num,1);assert.equal(chOKR([x],{...f,cat:['REENTRADA']}).num,0);});

test('OKR exclui abertos no prazo e contabiliza vencidos abertos como fora, nas duas unidades',()=>{
 const base={...t,created:'2026-11-01',desired:'',pickDone:'',closed:'',totals:{qty:100,coverage:[]}};
 const rows=[{...base,id:'A',pickDone:'2026-11-20'},{...base,id:'B',pickDone:'2026-11-28',totals:{qty:200,coverage:[]}},{...base,id:'C',totals:{qty:300,coverage:[]}},{...base,id:'D',created:'2026-11-20',totals:{qty:400,coverage:[]}}];
 for(const [unit,num,den,late,pending,upcoming] of [['tickets',1,3,2,1,1],['qty',100,600,500,300,400]]){
   const r=chOKR(rows,{...f,unit,asof:'2026-11-30'});assert.equal(r.num,num);assert.equal(r.den,den);assert.equal(r.late,late);assert.equal(r.pending,pending);assert.equal(r.upcoming,upcoming);assert.equal(r.den,r.num+r.late);assert.equal(r.items[2].status,'Não coletado');assert.equal(r.items[3].den,0);
 }
});
test('aberto no próprio dia do vencimento ainda não está atrasado',()=>{
 const x={...t,pickDone:'',closed:''};const r=chOKR([x],{...f,asof:'2026-12-12'});assert.equal(r.den,0);assert.equal(r.upcoming,1);assert.equal(r.late,0);
 const next=chOKR([x],{...f,asof:'2026-12-13'});assert.equal(next.den,1);assert.equal(next.late,1);assert.equal(next.items[0].days,1);
});

test('situação de coleta depende apenas da data observada, mesmo sem prazo de comparação',()=>{
  const base={...t,desired:'',pickDue:'',closed:'',totals:{qty:80,coverage:[]}};
  const rows=[{...base,id:'A',pickDone:'2026-11-19'},{...base,id:'B',pickDone:''},
    {...base,id:'C',pickDone:'2026-12-01'},{...base,id:'D',canceled:'2026-11-19'}];
  for(const rule of ['fixed','standard','desired','pick']){
    for(const unit of ['tickets','qty']){
      const opts={...f,rule,unit,asof:'2026-11-30'},result=chOKR(rows,opts),w=unit==='qty'?80:1;
      assert.deepEqual(Array.from(result.items,r=>r.status),['Coletado','Não coletado','Não coletado']);
      assert.equal(result.actual,w);assert.equal(result.notCollected,2*w);assert.equal(result.canceled,w);
      for(const [scope,state] of [['abertos','Não coletado'],['concluidos','Coletado']]){
        const filtered=chOKR(rows,{...opts,scope});
        assert.equal(filtered.items.length,scope==='abertos'?2:1);
        assert.ok(filtered.items.every(r=>r.status===state));
      }
    }
  }
  const earlier=chOKR([{...base,pickDone:'2026-11-16'}],f);
  assert.equal(earlier.items[0].actual,'');assert.equal(earlier.items[0].status,'Não coletado');
  assert.equal(earlier.den,1);assert.equal(earlier.items[0].age,null);
});
test('data integral de um destino aparece mesmo quando outro CD do chamado aguarda coleta',()=>{
  const group=cd=>({printer:'A',cd,qty:10,coverage:[]});
  const route=(cd,pick)=>({cd,printer:'A',qty:10,pick,collection:{parts:[{qty:10}],events:[]}});
  const x={...t,groups:[group('FOR'),group('JDI')],totals:{qty:20,coverage:[]},
    okrRoutes:[route('JDI','2026-11-20'),route('FOR','')]};
  const opts={...f,rule:'pick'},d=chOKR([x],opts),rows=chOKRDestinationRows(d,opts,[x]);
  assert.equal(d.items[0].status,'Não coletado');
  assert.deepEqual(Array.from(rows,r=>[r.cds[0],r.actual,r.localStatus,r.status]),[
    ['FOR','','Não coletado','Não coletado'],['JDI','2026-11-20','Coletado','Não coletado']]);
  x.okrRoutes[1].pick='2026-11-23';
  assert.equal(chOKR([x],opts).items[0].status,'Coletado');
});

test('JSON usa a versão exigida pelo servidor, sem número fixo na interface',()=>{
  assert.equal(ctx.chJsonCompativel({calculationVersion:11,requiredCalculationVersion:11}),true);
  assert.equal(ctx.chJsonCompativel({calculationVersion:12,requiredCalculationVersion:12}),true);
  assert.equal(ctx.chJsonCompativel({calculationVersion:9,requiredCalculationVersion:11}),false);
  assert.equal(ctx.chJsonCompativel({calculationVersion:11}),false);
});

test('corte histórico mantém exclusões documentadas apenas em V1, sem restaurar datas inválidas',()=>{
 const opts={...f,rule:'standard',start:'2026-09-05',end:'2026-12-06',asof:'2026-11-24'};
 const ids=['08fe0ec3-5eb8-4214-af87-57125c47b8a5','93483f9d-5805-4359-b089-e3c07ad42fb4','c2e91f37-e93b-45b1-a86c-604dbc0ae28b'];
 const rows=ids.map(id=>({...t,id,shipment:'V1',created:'2026-10-28',desired:'',pickDone:'',closed:''}));
 const ok=Array.from({length:21},(_,i)=>({...rows[0],id:'OK'+i,pickDone:'2026-11-02'}));
 const late=Array.from({length:10},(_,i)=>({...rows[0],id:'LATE'+i}));
 const historical=chOKR([...rows,...ok,...late],opts);
 assert.equal(historical.num,21);assert.equal(historical.den,31);assert.equal(historical.historicalExcluded,3);assert.equal(historical.items[0].actual,'');assert.equal(historical.items[0].status,'Não coletado');
 assert.equal(chOKR([...rows,...ok,...late],{...opts,end:'2026-12-07'}).den,34);
 assert.equal(chOKR([{...rows[0],pickDone:'2026-11-02'}],opts).num,1);
 assert.equal(chOKR([{...rows[0],shipment:'V4'}],opts).den,1);
 assert.equal(chOKR(rows,{...opts,rule:'pick'}).historicalExcluded,0);
 assert.equal(chOKR(rows,{...opts,rule:'fixed'}).historicalExcluded,3);
});
