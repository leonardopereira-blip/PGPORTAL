const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname,'..');
const BASELINE = 'COLETA/INTERNALIZAÇÃO FIM BASELINE';
const REPLAN = 'Coleta/Internalização de estoque final (re) plan';
const plain = value => JSON.parse(JSON.stringify(value));
const row = (id,extra={}) => ({_SOURCE:'PCP',_ROW_ID:'PCP:'+id,_PG_TP_LINHA:id,ID:id,
  MARCA_FINAL:'COC',UNIDADE:'COC',GRAFICA_FINAL:'LOGPRINT','GRÁFICA':'LOGPRINT',
  SKU_REAL:'SKU-1',SKU:'SKU-1',ENVIO:'V1',CD_MAPA:'CD JDI',CD_FINAL:'CD JDI','CD DESTINO':'CD JDI',
  KIT:'',TIPO:'ALUNO','SÉRIE':'1º ANO',serie_corrigida:'1º ANO',TIRAGEM:200,'TIRAGEM COLETADA':120,
  Coleta_TP:'2026-10-08',Entrega_TP:'2026-10-16',[BASELINE]:'2026-10-09',[REPLAN]:'2026-10-14',...extra});
const movement = (id,volume,extra={}) => ({eventoTPVersao:1,marca:'COC',grafica:'LOGPRINT',
  sku:'SKU-1',destino:'CD JDI',envio:'V1',linhaMapa:id,codigoMapa:'MP-'+id,chaveMapa:'MAPA-'+id,kit:'',
  volumeColetado:volume,coletaTP:'2026-10-08',entregaTP:'2026-10-10',...extra});

// Os motores, cadastro de responsáveis, SLA, conciliação e apuração são reais.
// Apenas DOM, carregamento assíncrono e relógio do ambiente são simulados.
function portal(rows,events,{today='2026-10-20',sla=2}={}) {
  const element=()=>({value:'',style:{},classList:{add(){},remove(){},toggle(){}},
    appendChild(){},remove(){},addEventListener(){},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];}});
  const controls={filtroReferencia:{value:'replan'},pgFiltroOrigem:{value:'TODOS'},pgFiltroDestino:{value:'CD'}};
  const w={dadosGlobais:rows,MAPA_SAIDA_CACHE:{__agendaTPCompleta:true,__forecastTP:{conferido:true},key:events},
    PG_MAPA_TP_CARGA_CONCLUIDA:true,PG_MATRIZ_SLA:[['FORNECEDOR','CD JDI'],['LOGPRINT',sla]],
    console:{info(){},warn(){},error(){}},arredondar:v=>Math.round(Number(v)||0),formatarBR:String,
    setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},performance:{now:()=>0},
    addEventListener(){},dispatchEvent(){},Event:class{},localStorage:{getItem(){return null;},setItem(){}}};
  w.document={getElementById:id=>controls[id]||null,querySelector:()=>null,querySelectorAll:()=>[],
    addEventListener(){},createElement:element,body:element(),head:element()};
  w.window=w;vm.createContext(w);
  for(const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html','Scripts_Meta_Armazem_Realizado.html',
    'abaMetaArmazem.html','Scripts_Resultados_Analistas.html']) {
    const html=fs.readFileSync(path.join(root,name),'utf8');
    for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script,w,{filename:name});
  }
  vm.runInContext(`dtHojeISO='${today}';dtHoje=new Date('${today}T12:00:00');`,w);
  return {w,apurar(referencia='armazem',corte=today){
    const itens=w.pgMAObterItens({corte,cenario:'com'});
    return {itens,resultado:plain(w.pgRAApurar(itens,{referencia,corte}))};
  }};
}

test('parcelas reais da Meta Armazém alimentam os três prazos e o cadastro compartilhado',()=>{
  const rows=[row(101)],before=plain(rows),app=portal(rows,[movement(2,40),
    movement(3,50,{entregaTP:'2026-10-14'}),movement(4,30,{entregaTP:'2026-10-16'})]);
  const armazem=app.apurar(),baseline=app.apurar('baseline'),replan=app.apurar('replan');
  assert.equal(armazem.itens.length,1);assert.equal(armazem.itens[0].eventosReal.length,3);
  assert.equal(armazem.resultado.detalhes[0].prazo,'2026-10-15');
  assert.equal(baseline.resultado.detalhes[0].prazo,'2026-10-12','SLA 2 em 09/10 cai no domingo e vai para segunda');
  assert.equal(replan.resultado.detalhes[0].prazo,'2026-10-16');
  assert.equal(armazem.resultado.resumo.noPrazo,90);assert.equal(armazem.resultado.resumo.aderencia,45);
  assert.equal(baseline.resultado.resumo.noPrazo,40);assert.equal(baseline.resultado.resumo.aderencia,20);
  assert.equal(replan.resultado.resumo.noPrazo,120);assert.equal(replan.resultado.resumo.aderencia,60);
  for(const {resultado} of [armazem,baseline,replan]) {
    assert.equal(resultado.resumo.total,200);assert.equal(resultado.resumo.entregue,120);
    assert.equal(resultado.resumo.pendente,80);assert.equal(resultado.resumo.analistas,1);
    assert.equal(resultado.analistas[0].analista,'Amanda Costa');assert.equal(resultado.analistas[0].time,'CAMILA');
  }
  assert.deepEqual(rows,before,'Motores não modificam a fonte usada na avaliação');
});

test('corte histórico recorta as mesmas parcelas sem transformar previsão da meta futura em realizado',()=>{
  const app=portal([row(101,{[REPLAN]:'2026-10-12'})],[movement(2,40),movement(3,50,{entregaTP:'2026-10-14'}),
    movement(4,30,{entregaTP:'2026-10-16'})]);
  const historico=app.apurar('armazem','2026-10-13');
  assert.equal(historico.itens[0].realizado,40);
  assert(historico.itens[0].previsto>40,'Motor da meta ainda tem previsão futura nesta data');
  assert.equal(historico.resultado.resumo.entregue,40);assert.equal(historico.resultado.resumo.noPrazo,40);
  assert.equal(historico.resultado.resumo.aVencer,160);assert.equal(historico.resultado.resumo.metaVencida,0);
  assert.equal(historico.resultado.resumo.aderencia,null);
  const encerrado=app.apurar('armazem','2026-10-15').resultado;
  assert.equal(encerrado.resumo.entregue,90);assert.equal(encerrado.resumo.aderencia,45);
  assert.equal(encerrado.resumo.vencido,110);
  const baseline=app.apurar('baseline','2026-10-13').resultado;
  assert.equal(baseline.resumo.metaVencida,200);assert.equal(baseline.resumo.aderencia,20);
});

test('diagnóstico real de identidade incompleta é excluído da nota pessoal, com item saudável preservado',()=>{
  const rows=[row(101,{TIRAGEM:300,ENVIO:'','TIRAGEM COLETADA':200}),
    row(102,{SKU_REAL:'SKU-SAUDAVEL',SKU:'SKU-SAUDAVEL',TIRAGEM:100,'TIRAGEM COLETADA':40,Entrega_TP:'2026-10-13'})];
  const app=portal(rows,[movement(2,150)]),{itens,resultado}=app.apurar();
  const problema=itens.find(i=>i.linha.SKU==='SKU-1');
  assert.equal(problema.realizado,0);assert(problema.conciliacao.diagnosticos.some(d=>d.startsWith('entrega:')));
  assert.equal(resultado.resumo.total,400);assert.equal(resultado.resumo.entregue,40);
  assert.equal(resultado.resumo.naoApurado,300);assert.equal(resultado.resumo.metaVencida,100);
  assert.equal(resultado.resumo.aderencia,40);assert.equal(resultado.analistas[0].aderencia,40);
  const detalhe=resultado.detalhes.find(i=>i.sku==='SKU-1');
  assert.match(detalhe.motivo,/Entrega TP não conferida/);assert.equal(detalhe.vencido,0);
});

test('conciliação real sem KIT preserva volume do grupo e sinaliza divergência de baseline/replan',()=>{
  const rows=[row(101,{TIRAGEM:100,'TIRAGEM COLETADA':250}),
    row(102,{TIRAGEM:200,'TIRAGEM COLETADA':0,[BASELINE]:'2026-10-20',[REPLAN]:'2026-10-20'})];
  const app=portal(rows,[movement(2,250,{entregaTP:'2026-10-13'})]);
  const {itens,resultado}=app.apurar();
  assert.equal(itens.length,1);assert.equal(itens[0].conciliacao.agrupado,true);
  assert.equal(itens[0].conciliacao.linhas.length,2);assert.equal(itens[0].total,300);
  assert.equal(itens[0].linha[BASELINE],'2026-10-20','Agrupamento operacional usa maior data');
  assert.equal(resultado.resumo.entregue,250);assert.equal(resultado.resumo.pendente,50);
  assert.equal(resultado.resumo.noPrazo,250);assert.equal(resultado.resumo.aderencia,250/300*100);
  for(const referencia of ['baseline','replan']) {
    const r=app.apurar(referencia).resultado;
    assert.equal(r.resumo.total,300);assert.equal(r.resumo.entregue,250);
    assert.equal(r.detalhes[0].prazo,null);assert.match(r.detalhes[0].motivo,/Prazos divergentes/);
    assert.equal(r.resumo.semPrazo,300);assert.equal(r.resumo.metaVencida,0);assert.equal(r.resumo.aderencia,null);
  }
});
