const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const global = fs.readFileSync(path.join(root,'Scripts_Globais_2.html'),'utf8');
const hoje = '2026-11-11';
const plan = 'Coleta/Internalização de estoque final (re) plan';
const row = extra => ({_SOURCE:'PCP',_PG_TP_LINHA:2,_ROW_ID:'PCP:2',MARCA_FINAL:'SAS',UNIDADE:'SAS',
  GRAFICA_FINAL:'BRADESCO','GRÁFICA_MAPA':'BRADESCO','GRÁFICA':'BRADESCO',CD_MAPA:'CD RP',
  CD_FINAL:'CD RP','CD DESTINO':'CD RP',SKU_REAL:'SKU-1',SKU:'SKU-1',ENVIO:'V1',
  TIRAGEM:100,GIRO_TOTAL_BA:100,'TIRAGEM COLETADA':100,Coleta_TP:'2026-11-10',
  Entrega_TP:'2026-11-11',[plan]:'2026-11-04',TIPO:'ALUNO',SERIE:'1',...extra});
const movement = extra => ({eventoTPVersao:2,linhaMapa:2,codigoMapa:'MP-1',marca:'SAS',
  grafica:'BRADESCO',destino:'CD RP',sku:'SKU-1',envio:'V1',volumeColetado:40,
  coletaTP:'2026-11-05',entregaTP:'2026-11-06',...extra});
const phases = [
  {id:'col_tp',nome:'Coleta TP',colPlan:plan,colReal:'Coleta_TP'},
  {id:'ent_tp',nome:'Entrega TP',colPlan:plan,colReal:'Entrega_TP'}
];
const element = () => ({value:'',innerHTML:'',innerText:'',style:{},classList:{add(){},remove(){},toggle(){}},
  options:Array(5).fill({}),addEventListener(){}});
function portal(rows, movements=[movement()]) {
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[hoje+'T12:00:00Z']));}}
  const controls = {};
  const c = {Date:FixedDate,dtHojeISO:hoje,FASES:phases,console,
    dadosFiltrados:rows,dadosGlobais:rows,dadosTotalCanonico:rows,graficos:{},
    MAPA_SAIDA_CACHE:{__agendaTPCompleta:true,__forecastTP:{conferido:true},__eventosTPAtuais:movements},
    pgNumeroPrazoV35:v=>Number(v)||0,pgCampoPrazoV35:(l,n)=>l[n]??'',
    pgNormalizarDataColeta:v=>v?String(v).slice(0,10):null,
    pgDadosParaFases:()=>rows,pgLinhaNaVisaoDaFase:()=>true,belongsToPhase:()=>true,
    pgDataPlanoEntregaSLA:(l,dt)=>dt||l[plan],getCols:f=>({plan:f.colPlan,real:f.colReal}),
    extrairDataISO:v=>v?String(v).slice(0,10):null,
    arredondar:v=>Math.round(Number(v)||0),formatarBR:v=>String(Math.round(Number(v)||0)),
    document:{getElementById:id=>controls[id]||null},
    Chart:class {constructor(canvas,config){this.config=config;c.chart=config;}destroy(){}},
    pgIdentidadeOperacionalTPLinha:undefined,
    pgComplementosParciaisSKUFunil:()=>new Map(),pgSerieCorrigidaFunil:l=>l.SERIE,
    pgLinhasUnicas:rows=>rows,pgMAObterItens:()=>rows.map(l=>({linha:l,total:l.TIRAGEM})),
    pgOrigemAtivaPortal:'TODOS',pgDestinoAtivoPortal:'TODOS',
    calcDiffDiasISO:(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)};
  c.window=c;vm.createContext(c);
  const events=fs.readFileSync(path.join(root,'Scripts_Eventos_TP.html'),'utf8');
  vm.runInContext(events.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),c);
  vm.runInContext(global.slice(global.indexOf('const pgCacheVolumesColetaV37 ='),
    global.indexOf('window.pgTiragemColetadaBruta =')),c);
  c.getVolFase=(l,f)=>c.pgVolumesColetaUnificadosV37(l)[f.id==='ent_tp'?'entrega':'coleta'];
  c.dataFoiPreenchida=(l,f)=>c.getVolFase(l,f)>0;
  return {c,controls,control(id,value=''){const e=controls[id]=element();e.value=value;return e;}};
}
function aging(rows,movements) {
  const p=portal(rows,movements);
  const source=fs.readFileSync(path.join(root,'Scripts_Eficiencia_Aging.html'),'utf8');
  vm.runInContext(source.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),p.c);
  return p.c;
}
test('Aging calcula as parcelas reais nas datas distintas de coleta e entrega',()=>{
  const c=aging([row()]);
  const result=c.pgEficienciaAgingModelo({base:'replan',modo:'real',corte:hoje});
  const values=id=>Array.from(result.fases.find(f=>f.id===id).registros,r=>[r.dataObservada,r.volume]);
  assert.deepEqual(values('col_tp'),[['2026-11-05',40],['2026-11-10',60]]);
  assert.deepEqual(values('ent_tp'),[['2026-11-06',40],['2026-11-11',60]]);
  assert.equal(c.pgEficienciaAgingResumo(result.entrega).total,100);
});
test('Aging soma o denominador do mesmo SKU e prazo antes de limitar o owner manual',()=>{
  const rows=[row({TIRAGEM:60}),row({_PG_TP_LINHA:3,_ROW_ID:'PCP:3',TIRAGEM:40,'TIRAGEM COLETADA':0})];
  const c=aging(rows,[]),real=c.pgEficienciaAgingModelo({base:'replan',modo:'real',corte:hoje});
  assert.equal(c.pgEficienciaAgingResumo(real.entrega).total,100);
  const aberto=c.pgEficienciaAgingModelo({base:'replan',modo:'aberto',corte:hoje});
  assert.equal(c.pgEficienciaAgingResumo(aberto.entrega).total,0);
});
test('Aging nao compensa outro SKU nem distribui entre prazos distintos',()=>{
  for(const extra of [{SKU_REAL:'SKU-2',SKU:'SKU-2'},{[plan]:'2026-11-09'}]) {
    const rows=[row({TIRAGEM:60}),row({_PG_TP_LINHA:3,_ROW_ID:'PCP:3',TIRAGEM:40,
      'TIRAGEM COLETADA':0,...extra})];
    const c=aging(rows,[]),real=c.pgEficienciaAgingModelo({base:'replan',modo:'real',corte:hoje});
    assert.equal(c.pgEficienciaAgingResumo(real.entrega).total,60);
    const aberto=c.pgEficienciaAgingModelo({base:'replan',modo:'aberto',corte:hoje});
    assert.equal(c.pgEficienciaAgingResumo(aberto.entrega).total,40);
  }
});
test('Aging historico nao antecipa complemento manual posterior ao corte',()=>{
  const c=aging([row()]),result=c.pgEficienciaAgingModelo({base:'replan',modo:'real',corte:'2026-11-07'});
  assert.equal(c.pgEficienciaAgingResumo(result.entrega).total,40);
});
for(const fase of ['col_tp','ent_tp']) test('Evolucao '+fase+' renderiza cada parcela na sua data e exporta o mesmo volume',()=>{
  const p=portal([row()]),{c}=p;
  const source=global.slice(global.indexOf('window.processarEvolucao = function()'),global.indexOf('// Função do Botão de Exportar CSV'));
  for(const match of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g))p.control(match[1]);
  for(const id of ['tbEvoGrafica','tbEvoMarca','tbEvoGM'])p.control(id);
  p.controls.evoPeriodo.value='tudo';p.controls.evoGranul.value='dia';p.controls.evoFase.value=fase;
  p.controls.filtroReferencia.value='replan';
  vm.runInContext(source,c);c.processarEvolucao();
  const first=fase==='ent_tp'?'06/11':'05/11',last=fase==='ent_tp'?'11/11':'10/11';
  const real=c.chart.data.datasets.slice(1);
  const at=label=>real.reduce((sum,d)=>sum+d.data[c.chart.data.labels.indexOf(label)],0);
  assert.equal(at(first),40);assert.equal(at(last),60);
  assert.equal(c.dadosExportacaoEvoSku[0].realDoPlan,100);
  assert.match(p.controls.tbEvoSku.innerHTML,/>100<\/td>/);
});
test('tabela analitica do Funil usa realizado central com PCP manual sem aliases DATA_DZ',()=>{
  const p=portal([row()]),{c}=p;
  p.control('thFunilNovaTabela');p.control('tbFunilNovaTabela');p.control('selectFaseNovaTabela','col_tp');
  c.pgSerieCorrigidaFunil=l=>l.SERIE;
  const source=global.slice(global.indexOf('window.renderTabelaMarcaSerieTipo = function'),
    global.indexOf('window.processarFunil = function'));
  vm.runInContext(source,c);c.renderTabelaMarcaSerieTipo();
  assert.match(p.controls.tbFunilNovaTabela.innerHTML,/100\.0%/);
  assert.doesNotMatch(p.controls.tbFunilNovaTabela.innerHTML,/>0\.0%</);
});
test('calculo OnePage preserva zero TP com data preenchida sem promover tiragem total',()=>{
  const p=portal([row({'TIRAGEM COLETADA':0})]),{c}=p;
  const start=global.indexOf('    function pgCalcularEtapa(');
  const end=global.indexOf('    function pgCorPct(',start);
  c.pgSpecAplicavel=()=>true;c.pgChave=()=> 'linha';
  c.pgDatasSpec=()=>({plan:'2026-11-04',real:'2026-11-10'});
  c.pgVolumeReal=()=>0;c.pgFase=id=>phases.find(f=>f.id===id);
  c.pgDiff=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
  vm.runInContext(global.slice(start,end),c);
  const result=c.pgCalcularEtapa([row({'TIRAGEM COLETADA':0})],{id:'col_tp'},'replan',hoje);
  assert.equal(result.completoVol,0);assert.equal(result.completosSku,0);assert.equal(result.producao,0);
});
