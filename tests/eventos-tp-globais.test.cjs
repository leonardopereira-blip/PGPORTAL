const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hoje = '2026-10-08';
const plan = 'Coleta/Internalização de estoque final (re) plan';
const row = extra => ({_SOURCE:'PCP', _ROW_ID:'PCP:2', MARCA_FINAL:'COC', UNIDADE:'COC',
  GRAFICA_FINAL:'FORMA CERTA', 'GRÁFICA':'FORMA CERTA', SKU_REAL:'CCP25PP26111801',
  SKU:'CCP25PP26111801', ENVIO:'V1', CD_MAPA:'ANTILHAS', CD_FINAL:'ANTILHAS',
  'CD DESTINO':'ANTILHAS', TIRAGEM:2000, 'TIRAGEM COLETADA':1403,
  Coleta_TP:'2026-07-31', Entrega_TP:'2026-08-03', 'TIRAGEM VENCIDA':2000,
  DT_Vencido:'2026-07-30', [plan]:'2026-07-30', ...extra});
const movement = (extra = {}) => ({eventoTPVersao:1, marca:'COC', destino:'ANTILHAS',
  grafica:'FORMA CERTA', sku:'CCP25PP26111801', envio:'V1', chaveMapa:'CHAVE-COMPLETA',
  codigoMapa:'MP 95 V1 COC FC', linhaMapa:745, volumeColetado:1280,
  coletaTP:'2026-07-31', entregaTP:'2026-08-03', ...extra});
const mapa = () => ({key:[movement(), movement({codigoMapa:'MP-506731-COC-V1-FORMACERTA',
  linhaMapa:1881, volumeColetado:123, coletaTP:'2026-09-04', entregaTP:'2026-09-04'})]});

// Executa os scripts completos. Somente DOM, pintura e chamadas externas sao simulados.
function portal(rows, cache = mapa()) {
  const controls = {filtroReferencia:{value:'replan'}, pgFiltroOrigem:{value:'TODOS'},
    pgFiltroDestino:{value:'TODOS'}};
  const c = {console:{info(){},warn(){},error(){}}, MAPA_SAIDA_CACHE:cache, dadosGlobais:rows,
    arredondar:v=>Math.round(Number(v)||0), formatarBR:String,
    setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},
    performance:{now:()=>0},addEventListener(){},dispatchEvent(){},
    Event:class{}, Chart:class {constructor(canvas, config){this.config=config; c.chart=config;} destroy(){}}};
  const element = () => ({classList:{add(){},remove(){}},style:{},appendChild(){},addEventListener(){}});
  c.document = {getElementById:id=>controls[id]||null,querySelector:()=>null,
    querySelectorAll:()=>[],addEventListener(){},createElement:element,body:element(),head:element()};
  c.window=c;
  vm.createContext(c);
  for (const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html']) {
    const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    for (const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInContext(script,c);
  }
  vm.runInContext(`dtHojeISO='${hoje}';dtHoje=new Date('${hoje}T12:00:00');`,c);
  c.dadosBaseForecastColeta=rows;
  c.pgMontarFiltrosExtras=()=>{};
  return {w:c, controls};
}

test('Funil e prazos usam parcelas nos dias passados e preservam total, plano e realizado de hoje',()=>{
  const line=row();
  const {w}=portal([line]);
  const atual=w.pgCalcularColetaFunil([line],hoje);
  const legado=portal([row()],{}).w.pgCalcularColetaFunil([row()],hoje);
  for(const k of ['total','realizado','realizadoDatado','mapaSolicitado','esperadoHoje','backlogAtual','semPlano'])
    assert.equal(atual[k],legado[k],k);
  assert.equal(atual.registros.length,1);
  assert.equal(atual.dias.get('2026-07-31').real,1280);
  assert.equal(atual.dias.get('2026-09-04').real,123);
  assert.equal(w.pgVolumesColetaUnificadosV37(line,'2026-08-31').coleta,1280);
  assert.equal(w.pgVolumesColetaUnificadosV37(line,hoje).coleta,1403);
  assert.equal(w.pgSaldoPrazoV35(atual.prazosRegistros[0],'2026-08-31',hoje).vencido,720);
  assert.equal(w.pgSaldoPrazoV35(atual.prazosRegistros[0],hoje,hoje).vencido,597);
  assert.equal(w.pgItensColetaDia(atual,'2026-08-31',hoje,'2026-08-31',true)[0].tiragem,720);
});

test('linhas exclusivas do PCP continuam aceitas; exclusivas do mapa e duplicatas zeradas nao entram',()=>{
  const onlyPCP=row({_ROW_ID:'PCP:3',SKU:'OUTRO',SKU_REAL:'OUTRO','TIRAGEM COLETADA':20});
  const duplicate=row({_ROW_ID:'PCP:4','TIRAGEM COLETADA':0});
  const cache=mapa();cache.onlyMap=[movement({sku:'SEM-PCP',linhaMapa:6000,volumeColetado:999999})];
  const base=[row(),onlyPCP,duplicate];
  const {w}=portal(base,cache);
  const resumo=w.pgCalcularColetaFunil(base,hoje);
  assert.equal(resumo.registros.length,3);
  assert.equal(resumo.realizado,1423);
  assert.equal(w.pgVolumesColetaUnificadosV37(onlyPCP).eventosColetaTP.conciliacao.modo,'legado');
  assert.equal(resumo.registros[2].eventosReal.length,0);
});

test('Sheets, auditoria por ponto e XLSX conciliam o mesmo corte historico',()=>{
  const {w}=portal([row()]);
  const resumo=w.pgObterResumoColeta();
  let pacote;
  w.reCriarSheets=(nome,abas)=>{pacote=abas[0];};
  w.pgExportarVisaoCompletaV37('2026-08-31','Teste',null,resumo);
  const real=pacote.cabecalho.indexOf('Realizado');
  assert.equal(pacote.linhas[0][real],1280);
  assert.equal(pacote.linhas.at(-1)[real],1280);
  assert.equal(pacote.linhas.length,2,'linha fisica unica mais rodape, sem duplicar o planejado');
  const visao={resumo,pontos:['2026-08-31'],inicio:'2026-08-01',fim:'2026-08-31',acumulado:true};
  assert.equal(w.pgMontarAuditoriaPontoColetaV56(visao,0,'real').totais.real,1280);
  const xlsx=w.pgMontarAuditoriaCompletaXlsxV57(visao);
  const item=xlsx.abas[1].linhas.find(r=>r[1]==='Coletado acumulado até corte');
  assert.equal(item[2],1280);
  const dia={...visao,pontos:['2026-09-04'],acumulado:false};
  assert.equal(w.pgMontarAuditoriaPontoColetaV56(dia,0,'real').totais.real,123);
});

test('Curva S distribui por movimento e fecha no realizado atual sem alterar plano',()=>{
  const line=row({CD_MAPA:'CD JDI',CD_FINAL:'CD JDI','CD DESTINO':'CD JDI'});
  const cache=mapa();cache.key.forEach(e=>e.destino='CD JDI');
  const {w,controls}=portal([line],cache);
  controls.graficoCurvaS={};
  const selectors=w.document.querySelectorAll;
  w.document.querySelectorAll=s=>s==='.chk-fase-curva:checked'?[{value:'col_tp'}]:selectors(s);
  w.dadosFasesEstaticas=[line];w.dadosAcabamentoOrigem=[line];w.dadosBaseTPPortal=[line];
  w.pgOrigemAtivaPortal='TODOS';w.pgDestinoAtivoPortal='CD';
  w.pgDadosParaFases=()=>[line];w.pgLinhaNaVisaoDaFase=()=>true;
  w.renderCurvaAcumulada();
  const realizado=w.chart.data.datasets.find(d=>d.label==='[Real] Coleta TP').data;
  assert.deepEqual(Array.from(realizado),['0.0','64.0','70.2']);
});

test('resumo calculado antes do mapa chegar e refeito quando a evidencia nova chega',()=>{
  const {w}=portal([row()],{});
  const antes=w.pgObterResumoColeta();
  assert.equal(antes.dias.get('2026-07-31').real,1403);
  w.MAPA_SAIDA_CACHE=mapa();
  const depois=w.pgObterResumoColeta();
  assert.notEqual(antes,depois);
  assert.equal(depois.realizado,antes.realizado);
  assert.equal(depois.dias.get('2026-07-31').real,1280);
  assert.equal(depois.dias.get('2026-09-04').real,123);
});

test('Report preserva tabela atual e fornece as mesmas parcelas para curva semanal e extracao',()=>{
  const line=row({CD_MAPA:'CD JDI',CD_FINAL:'CD JDI','CD DESTINO':'CD JDI'});
  const cache=mapa();cache.key.forEach(e=>e.destino='CD JDI');
  function report(movimentos){
    const {w,controls}=portal([line],movimentos);
    const simples={querySelectorAll:()=>[],querySelector:()=>null};
    controls.reTabelaMarcas={closest:()=>simples,querySelectorAll:()=>[],innerHTML:''};
    controls.pgReSeletoresV42={querySelector:s=>s.includes('data-re-coluna')?
      {checked:s.includes('marca')}:simples};
    w.pgBaseGeralReportExecutiva=[line];w.dadosAcabamentoOrigem=[];
    w.processarReportExecutiva();
    return {w,html:controls.reTabelaMarcas.innerHTML};
  }
  const atual=report(cache),legado=report({});
  assert.equal(atual.html,legado.html);
  assert.equal(atual.w.reCurvaFonteCDV43.realizadoHoje,1403);
  assert.deepEqual(Array.from(atual.w.reCurvaFonteCDV43.eventosReal,e=>[e.dtReal,e.coletada]),[
    ['2026-07-31',1280],['2026-09-04',123]
  ]);
});
