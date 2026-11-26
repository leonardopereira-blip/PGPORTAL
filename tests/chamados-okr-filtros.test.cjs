const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','abaCentralChamados.html'),'utf8')
  .split('// CH_OKR_PURE_BEGIN')[1].split('// CH_OKR_PURE_END')[0];
const ctx=vm.createContext({});
vm.runInContext(source+';this.rules={chOKR,chFilteredTotals,chOKRDestinationRows,chMatches,chCentralAging};',ctx);
const {chOKR,chFilteredTotals,chOKRDestinationRows,chMatches,chCentralAging}=ctx.rules;
const filters={rule:'fixed',basis:'open',start:'2026-09-05',end:'2026-12-06',
  asof:'2026-11-24',cat:'REENTRADA',shipment:'V1',scope:'ativos',unit:'tickets'};

function ticket(){
  const group=(printer,cd,qty,pick,feature)=>({printer,cd,qty,mapped:0,picked:pick?qty:0,
    delivered:0,balance:qty,coverage:[0],series:['6 ANO'],material:['LIVRO'],feature:[feature],cover:['SIMPLES'],finish:['PUR']});
  const groups=[group('Alpha','CD JDI',100,'2026-11-20','Capa dura'),
    group('Beta','CD FOR',200,'','Corte e vinco')];
  return {id:'A',n:'3148',cat:'REENTRADA',shipment:'V1',brand:'SAS',created:'2026-10-28',
    desired:'',status:'ALOCADO',groups,totals:{qty:300,coverage:[0]},
    okrRoutes:groups.map((g,i)=>({printer:g.printer.toUpperCase(),cd:g.cd,qty:g.qty,
      pick:i?'':'2026-11-20',dimensions:{...g,qty:undefined,coverage:undefined},
      collection:{parts:[{kit:'KIT-'+i,qty:g.qty,due:'2026-11-21'}],
        events:i?[]:[{date:'2026-11-20',qty:g.qty,kit:'KIT-'+i,source:'SPG · Coleta real'}],maps:[]}}))};
}

test('OKR filtra a evidência de coleta pelo CD, sem exigir coleta de outro destino',()=>{
  const t=ticket(),all=chOKR([t],filters);
  assert.equal(all.items[0].actual,'');assert.equal(all.num,0);assert.equal(all.den,1);
  const jdi=chOKR([t],{...filters,cd:'CD JDI'});
  assert.equal(jdi.items[0].actual,'2026-11-20');assert.equal(jdi.items[0].status,'Coletado');
  assert.equal(jdi.items[0].qty,100);assert.equal(jdi.num,1);assert.equal(jdi.den,1);
  const forCd=chOKR([t],{...filters,cd:'CD FOR'});
  assert.equal(forCd.items[0].actual,'');assert.equal(forCd.items[0].qty,200);
  assert.equal(forCd.num,0);assert.equal(forCd.pending,1);
});

test('OKR aplica gráfica e características na mesma rota, usando os rótulos de dimensions',()=>{
  const t=ticket(),f={...filters,printer:'Alpha',feature:'Capa dura'};
  const scoped=chFilteredTotals(t,f);
  assert.equal(scoped.okrRoutes.length,1);assert.equal(scoped.okrRoutes[0].printer,'ALPHA');
  assert.equal(chOKR([t],f).items[0].actual,'2026-11-20');
  assert.equal(chOKR([t],{...f,feature:'Corte e vinco'}).items.length,0);
  const byFeature=chOKR([t],{...filters,feature:['Capa dura']});
  assert.equal(byFeature.items[0].qty,100);assert.equal(byFeature.num,1);
});

test('OKR por tiragem pesa só a rota selecionada e respeita o observado até',()=>{
  const t=ticket(),f={...filters,cd:'CD JDI',unit:'qty'};
  const current=chOKR([t],f);
  assert.equal(current.num,100);assert.equal(current.den,100);assert.equal(current.actual,100);
  const historical=chOKR([t],{...f,asof:'2026-11-19'});
  assert.equal(historical.items[0].actual,'');assert.equal(historical.den,0);assert.equal(historical.upcoming,100);
});

test('linhas por destino conservam evidência local quando o código da gráfica difere do rótulo',()=>{
  const t=ticket();
  for(const unit of ['tickets','qty']){
    const f={...filters,unit},d=chOKR([t],f),rows=chOKRDestinationRows(d,f,[t]);
    assert.deepEqual(Array.from(rows,r=>[r.cds[0],r.actual,r.localStatus]),[
      ['CD FOR','','Não coletado'],['CD JDI','2026-11-20','Coletado']]);
    assert.equal(rows.reduce((s,r)=>s+r.qty,0),300);
    assert.equal(rows.reduce((s,r)=>s+r.den,0),d.den);
    assert.equal(rows.reduce((s,r)=>s+r.num,0),d.num);
  }
});

test('aging do filtro OKR e da Central usa a coleta integral da rota filtrada',()=>{
  const t=ticket(),f={...filters,cd:'CD JDI',min:20,max:25};
  // A coleta da rota ocorre aos 23 dias; a entrega do chamado aos 27.
  t.delivered='2026-11-24';
  const okr=chOKR([t],f);
  assert.equal(okr.items.length,1);assert.equal(okr.items[0].age,23);
  assert.equal(okr.num,1);assert.equal(okr.den,1);
  assert.equal(chMatches(t,f,filters.asof),true,'a Central usa a coleta de 23 dias');
  assert.equal(chCentralAging([chFilteredTotals(t,f)],filters.asof),okr.average);
  assert.equal(chMatches(t,{...f,cd:'CD FOR'},filters.asof),false);
  t.delivered='';
  assert.equal(chOKR([t],f).items.length,1,'a ausência da entrega não apaga o aging real de coleta');
  assert.equal(chOKR([t],{...f,max:22}).items.length,0);
  assert.equal(chOKR([t],{...f,min:24,max:30}).items.length,0);
  assert.equal(chOKR([t],{...f,cd:'CD FOR'}).items.length,0,'uma rota sem coleta não tem aging de coleta');
});

test('Central e OKR ponderam a mesma coleta integral pela tiragem, excluindo pendentes e cancelados',()=>{
  const base={cat:'REENTRADA',shipment:'V1',created:'2026-10-01',status:'ALOCADO',groups:[]};
  const a={...base,id:'A',totals:{qty:100,coverage:[]},pickDone:'2026-10-11'},b={...base,id:'B',totals:{qty:300,coverage:[]},pickDone:'2026-10-31'},c={...base,id:'C',totals:{qty:1000,coverage:[]}},d={...b,id:'D',status:'CANCELADO'},e={...b,id:'E',pickDone:'2026-09-30'};
  const rows=[a,b,c,d,e],f={...filters,unit:'qty',start:'2026-10-01',end:'2026-10-31'};
  assert.equal(chCentralAging(rows,f.asof),25);
  assert.equal(chCentralAging(rows,f.asof),chOKR(rows,f).average);
  assert.equal(chCentralAging([c,d,e],f.asof),null);
});

 test('pesquisa OKR em massa aceita delimitadores mistos e não inclui IDs parecidos',()=>{
 const a=ticket(),b={...ticket(),id:'B',n:'42'},c={...ticket(),id:'C',n:'31480'};
 const rows=[a,b,c],f={...filters,query:'3148, 42;\n\t3148|#0042'};
 const result=chOKR(rows,f);assert.equal(result.items.length,2);assert.equal(result.cohort,2);assert.deepEqual(Array.from(result.items,x=>x.n),['3148','42']);
 assert.equal(chOKR(rows,{...filters,query:'3148'}).items.length,1);
 assert.equal(chOKRDestinationRows(result,f,rows).length,4);
});
