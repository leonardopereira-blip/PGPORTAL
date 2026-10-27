const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const repo=path.join(__dirname,'..');
const fimPlan='Coleta/Internalização de estoque final (re) plan';
const totalCD='TIRAGEM A ENTREGAR (total por CD)';
const plain=x=>JSON.parse(JSON.stringify(x));
const row=(id,extra={})=>({_SOURCE:'PCP',_ROW_ID:'PCP:'+id,_PG_TP_LINHA:id,ID:id,
  MARCA_FINAL:'COC',UNIDADE:'COC',GRAFICA_FINAL:'FORMA CERTA','GRÁFICA':'FORMA CERTA',
  SKU:'SKU-1',SKU_REAL:'SKU-1',ENVIO:'V1',CD_MAPA:'CD JDI',CD_FINAL:'CD JDI','CD DESTINO':'CD JDI',
  KIT:'',TIPO:'ALUNO','SÉRIE':'1º ANO',serie_corrigida:'1º ANO',TIRAGEM:100,'TIRAGEM COLETADA':0,
  Coleta_TP:'2026-10-10',Entrega_TP:'2026-10-13',[fimPlan]:'2026-10-24',...extra});
const movement=(id,volume,extra={})=>({eventoTPVersao:1,marca:'COC',grafica:'FORMA CERTA',sku:'SKU-1',
  destino:'CD JDI',envio:'V1',linhaMapa:id,codigoMapa:'MP-'+id,chaveMapa:'CHAVE-'+id,kit:'',
  volumeColetado:volume,coletaTP:'2026-10-10',entregaTP:'2026-10-13',...extra});
function portal(rows,{cache={},today='2026-10-20'}={}){
  const controls={filtroReferencia:{value:'replan'},pgFiltroOrigem:{value:'TODOS'},pgFiltroDestino:{value:'TODOS'}};
  const el=()=>({value:'',innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},remove(){},
    addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];}});
  const w={dadosGlobais:rows,MAPA_SAIDA_CACHE:{__agendaTPCompleta:true,__forecastTP:{conferido:true},...cache},
    PG_MAPA_TP_CARGA_CONCLUIDA:true,PG_MATRIZ_SLA:[['FORNECEDOR','CD JDI'],['FORMA CERTA',0],['HR',0]],
    console:{info(){},warn(){},error(){}},arredondar:v=>Math.round(Number(v)||0),formatarBR:String,
    setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},performance:{now:()=>0},
    addEventListener(){},dispatchEvent(){},Event:class{},localStorage:{getItem(){return null;},setItem(){}}};
  w.document={getElementById:id=>controls[id]||(id.startsWith('ma')?(controls[id]=el()):null),
    querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>el(),body:el(),head:el()};
  w.window=w;vm.createContext(w);
  for(const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html','Scripts_Meta_Armazem_Realizado.html',
    'abaMetaArmazem.html','Scripts_EntregasCD_Modelo.html'])
    for(const [,script] of fs.readFileSync(path.join(repo,name),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script,w,{filename:name});
  vm.runInContext(`dtHojeISO='${today}';dtHoje=new Date('${today}T12:00:00');`,w);
  w.dadosBaseForecastColeta=rows;w.processarMetaArmazem();
  const m=w.pgEntregasCDModelo;
  const montar=(regs={},base=rows)=>m.montar(w.pgUnirTotalSemDuplicidade(w.pgLinhasUnicas(base)),regs,today,
    {volumeCanonico:true,conciliarRealizado:true,baseOriginal:rows});
  return {w,m,montar,c:(regs={},config={},filtros={})=>m.calendario(montar(regs),
    {hoje:today,inicio:today,fim:'2026-12-02',...config},filtros)};
}
function alinhado(app,c){
  const ref=app.w.pgMAMatrizesSnapshot.realizado.geral;
  assert.equal(c.total.total,ref.total);
  assert.equal(c.total.realCD,ref.realCD);
  assert.equal(c.marcaCD.reduce((s,g)=>s+g.realCD,0),ref.realCD);
  assert.equal(c.marcaSerieCD.reduce((s,g)=>s+g.realCD,0),ref.realCD);
  const abas=app.m.exportarCalendario(c),col=abas[0].cabecalho.indexOf('Entregue');
  assert.equal(abas[0].linhas.at(-1)[col],c.total.entregueAteOntem);
  assert.equal(abas[2].linhas.reduce((s,r)=>s+r[15],0),ref.total);
}
test('ECD preserva TP250 no grupo300 quando owner tem apenas100, igual à Meta Armazém',()=>{
  const rows=[row(101,{'TIRAGEM COLETADA':250}),row(102,{TIRAGEM:200})],antes=plain(rows);
  const app=portal(rows,{cache:{key:[movement(2,250)]}}),itens=app.montar(),c=app.c();
  assert.equal(itens.length,1);assert.equal(itens[0].total,300);assert.equal(itens[0].entregue,250);
  assert.equal(c.total.realCD,250);alinhado(app,c);assert.deepEqual(plain(rows),antes);
  const recorte=app.montar({},[rows[1]]);
  assert.equal(recorte[0].total,300);assert.equal(recorte[0].entregue,250);
  assert(recorte[0].linha._PG_MA.filtroParcial,'owner fora do filtro é conciliado antes do recorte');
});
test('KIT exato mantém linhas e chaves Giro individuais, sem rateio ou perda da previsão manual',()=>{
  const rows=[row(101,{KIT:'KIT-A',GIRO_TOTAL_BA:300,'TIRAGEM COLETADA':200}),row(102,{KIT:'KIT-B',GIRO_TOTAL_BA:0,TIRAGEM:200})];
  const app=portal(rows,{cache:{key:[movement(2,100,{kit:'KIT-A'}),movement(3,100,{kit:'KIT-B',entregaTP:'2026-10-16'})]}});
  const key=app.m.chave(rows[1]),regs={[key]:{dataEntrega:'2026-10-25',versao:2}},itens=app.montar(regs);
  assert.equal(itens.length,2);
  const b=itens.find(i=>i.kit==='KIT-B');assert.equal(b.chave,key);assert.deepEqual(plain(b.chavesOrigem),[key]);
  assert.equal(b.dtEntregaManual,'2026-10-25');assert.equal(b.entregue,100);
  alinhado(app,app.c(regs));
});
test('acabadora usa denominador canônico por CD e TP do grupo, igual à Meta Armazém',()=>{
  const rows=[row(101,{_SOURCE:'ACABADORA',_ROW_ID:'ACAB:101',GRAFICA_FINAL:'HR','GRÁFICA':'HR',
    TIRAGEM:1000,[totalCD]:300,'TIRAGEM COLETADA':250}),row(102,{_SOURCE:'ACABADORA',_ROW_ID:'ACAB:102',
    GRAFICA_FINAL:'HR','GRÁFICA':'HR',TIRAGEM:2000,[totalCD]:200})];
  const app=portal(rows,{cache:{key:[movement(2,250,{grafica:'HR'})]}}),c=app.c();
  assert.equal(c.total.total,500);assert.equal(c.total.realCD,250);alinhado(app,c);
});
test('entregue até hoje concilia Meta enquanto acumulado histórico preserva cada data sem duplicar',()=>{
  const app=portal([row(101,{'TIRAGEM COLETADA':50})],{cache:{key:[
    movement(2,20,{entregaTP:'2026-10-18'}),movement(3,30,{entregaTP:'2026-10-20'})]}});
  const c=app.c({}, {inicio:'2026-10-17',fim:'2026-10-20'});
  assert.equal(c.total.entregue,0);assert.equal(c.total.realCD,50);assert.equal(c.total.entregueHoje,30);
  assert(c.dias.some(d=>d.data==='2026-10-18'),'domingo com entrega real mantém a data histórica');
  const reais=c.parcelas.filter(p=>p.status==='ENTREGUE');
  assert.deepEqual(plain(reais.map(p=>[p.dia,p.volume])),[['2026-10-18',20],['2026-10-20',30]]);
  alinhado(app,c);
  const atual=app.c();assert.equal(atual.total.entregue,20);assert.equal(atual.total.realCD,50);
  const exportado=app.m.exportarCalendario(c)[0];
  assert.equal(exportado.linhas.at(-1)[exportado.cabecalho.indexOf('% acumulado 2026-10-20')],0.5);
});
test('grupo ambíguo conserva todas as chaves e datas individuais diferentes sem inventar rateio',()=>{
  const rows=[row(101,{KIT:'A',OP:'OP-A','TIRAGEM COLETADA':250}),row(102,{KIT:'B',OP:'OP-B',TIRAGEM:200})];
  const app=portal(rows,{cache:{key:[movement(2,250)]}}),keys=rows.map(app.m.chave);
  const regs={[keys[0]]:{dataEntrega:'2026-10-23'},[keys[1]]:{dataEntrega:'2026-10-24',observacao:'Nota-B',versao:5}};
  const i=app.montar(regs)[0];assert.deepEqual(plain(i.chavesOrigem),keys);
  assert.equal(i.previsoesOrigem[keys[1]].dataEntrega,'2026-10-24');assert.equal(i.conflitoEntrega,true);
  assert.equal(i.dtEntregaManual,'');const c=app.c(regs);assert.equal(c.total.realCD,250);assert.equal(c.total.backlog,50);
  assert.equal(i.origemPrevisao,'Previsões divergentes no grupo');
  assert(c.backlog.every(p=>p.motivo==='Previsões divergentes no grupo'));
  const base=app.m.exportarCalendario(c)[2],indice=base.cabecalho.indexOf('Previsões individuais do grupo');
  const audit=JSON.parse(base.linhas[0][indice]);
  assert.deepEqual(audit.map(r=>[r.chave,r.entrega]),keys.map((k,n)=>[k,n?'2026-10-24':'2026-10-23']));
  assert.equal(audit[1].observacao,'Nota-B');assert.equal(audit[1].versao,5);
  const origens=JSON.parse(base.linhas[0][base.cabecalho.indexOf('Linhas de origem')]);
  assert.deepEqual(origens.map(r=>[r.kit,r.op]),[['A','OP-A'],['B','OP-B']]);
  assert(!base.linhas[0][indice].includes('usuario'),'auditoria individual não precisa duplicar dados da sessão');
  const comum=app.montar({[keys[0]]:{dataEntrega:'2026-10-25'},[keys[1]]:{dataEntrega:'2026-10-25'}})[0];
  assert.equal(comum.dtEntregaManual,'2026-10-25');assert.equal(comum.conflitoEntrega,false);
});
test('ocultar100% remove só linhas concluídas e preserva total geral e base completos',()=>{
  const rows=[row(101,{'TIRAGEM COLETADA':100}),row(102,{SKU:'SKU-2',SKU_REAL:'SKU-2',MARCA_FINAL:'SAS',UNIDADE:'SAS',TIRAGEM:200,'TIRAGEM COLETADA':40})];
  const app=portal(rows),full=app.c(),c=app.c({}, {}, {ocultarConcluidos:true});
  assert.equal(full.total.total,300);assert.equal(full.total.realCD,140);
  assert.equal(c.total.total,300);assert.equal(c.total.realCD,140);assert.equal(c.total.entregueAteOntem,140);
  assert(c.parcelas.some(p=>p.sku==='SKU-1'));assert(c.parcelas.some(p=>p.sku==='SKU-2'));
  assert.equal(c.marcaCD.reduce((s,g)=>s+g.total,0),200);assert.equal(c.marcaSerieCD.reduce((s,g)=>s+g.total,0),200);
  const abas=app.m.exportarCalendario(c);
  assert.equal(abas[2].linhas.reduce((s,r)=>s+r[15],0),300);
  assert.equal(abas[0].linhas.at(-1)[abas[0].cabecalho.indexOf('Plano')],300);
  assert.equal(abas[0].linhas.at(-1)[abas[0].cabecalho.indexOf('Entregue')],140);
  assert.throws(()=>app.c({}, {inicio:'2026-10-22',fim:'2026-10-20'}),/período/);
});
test('entregue até ontem independe de datas passadas ou futuras e não inclui TP de hoje',()=>{
  const app=portal([row(101,{'TIRAGEM COLETADA':50})],{cache:{key:[
    movement(2,20,{entregaTP:'2026-10-18'}),movement(3,30,{entregaTP:'2026-10-20'})]}});
  for(const config of [{inicio:'2026-10-01',fim:'2026-10-10'},{inicio:'2026-10-17',fim:'2026-10-20'},
    {inicio:'2026-11-01',fim:'2026-11-03'}]){
    const c=app.c({},config),aba=app.m.exportarCalendario(c)[0];
    assert.equal(c.total.total,100);assert.equal(c.total.entregueAteOntem,20);assert.equal(c.total.realCD,50);
    assert.equal(c.marcaCD[0].entregueAteOntem,20);assert.equal(c.marcaSerieCD[0].entregueAteOntem,20);
    assert.equal(aba.linhas.at(-1)[aba.cabecalho.indexOf('Entregue')],20);
    assert.equal(aba.linhas.at(-1)[aba.cabecalho.indexOf('% entregue')],0.2);
  }
  const domingo=portal([row(101,{'TIRAGEM COLETADA':50})],{today:'2026-10-18',cache:{key:[
    movement(2,20,{entregaTP:'2026-10-17'}),movement(3,30,{entregaTP:'2026-10-18'})]}});
  const c=domingo.m.calendario(domingo.montar(),{hoje:'2026-10-18',fim:'2026-12-02'});
  assert.equal(c.total.entregue,50,'partição legada de domingo continua disponível');
  assert.equal(c.total.entregueAteOntem,20,'domingo de hoje não entra no acumulado até ontem');
  assert.equal(c.total.realCD,50);
});
test('linha concluída só hoje continua visível e grupos mistos mantêm os materiais entregues no total',()=>{
  const rows=[row(101,{'TIRAGEM COLETADA':100}),row(102,{SKU:'SKU-2',SKU_REAL:'SKU-2',serie_corrigida:'2º ANO',TIRAGEM:200,'TIRAGEM COLETADA':40})];
  const app=portal(rows),c=app.c({}, {}, {ocultarConcluidos:true});
  assert.equal(c.total.total,300);assert.equal(c.marcaCD[0].total,300);
  assert.equal(c.marcaSerieCD.length,1);assert.equal(c.marcaSerieCD[0].total,200);
  const atual=portal([row(101,{'TIRAGEM COLETADA':100})],{cache:{key:[movement(2,100,{entregaTP:'2026-10-20'})]}});
  const hoje=atual.c({}, {}, {ocultarConcluidos:true});
  assert.equal(hoje.total.entregueAteOntem,0);assert.equal(hoje.total.realCD,100);
  assert.equal(hoje.marcaCD.length,1,'100% entregue hoje ainda não é 100% até ontem');
});
test('período futuro inicia acumulado com previsão anterior à janela sem alterar o entregue real',()=>{
  const rows=[row(101)],app=portal(rows),key=app.m.chave(rows[0]);
  const c=app.c({[key]:{dataEntrega:'2026-10-21'}},{inicio:'2026-10-22',fim:'2026-10-24'});
  assert.equal(c.total.realCD,0);assert.equal(c.total.entregue,0);assert.equal(c.total.acumuladoAnterior,100);
  assert.equal(c.marcaCD[0].acumuladoAnterior,100);assert.equal(c.marcaSerieCD[0].acumuladoAnterior,100);
  const aba=app.m.exportarCalendario(c)[0];
  assert.equal(aba.linhas.at(-1)[aba.cabecalho.indexOf('% acumulado 2026-10-22')],1);
  assert.equal(aba.linhas.at(-1)[aba.cabecalho.indexOf('Entregue')],0);
});
