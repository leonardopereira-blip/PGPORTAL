const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const corte = '2026-11-09';
const row = (n, extra={}) => ({
  _SOURCE:'PCP',_PG_TP_LINHA:n,_ROW_ID:'PCP:'+n,
  MARCA_FINAL:'COC',UNIDADE:'COC',GRAFICA_FINAL:'LOGPRINT','GRÁFICA':'LOGPRINT',
  SKU_REAL:'SKU-A',SKU:'SKU-A',ENVIO:'V1','SÉRIE':'1 ANO',
  CD_MAPA:'CD JDI',CD_FINAL:'CD JDI','CD DESTINO':'CD JDI',
  TIRAGEM:100,'TIRAGEM COLETADA':0,'TIRAGEM AGENDADA':0,
  Coleta_TP:'',Entrega_TP:'',
  'Acbto Final Real':'','Formação de kit/Encaixotamento Final Real':'',...extra
});
const event = (n, volume, extra={}) => ({eventoTPVersao:1,linhaMapa:n,marca:'COC',
  grafica:'LOGPRINT',sku:'SKU-A',destino:'CD JDI',envio:'V1',
  volumeColetado:volume,coletaTP:'2026-11-08',entregaTP:'',...extra});

function portal(rows,events=[]) {
  const elem=()=>({style:{},classList:{add(){},remove(){}},appendChild(){},addEventListener(){}});
  const w={dadosGlobais:rows,MAPA_SAIDA_CACHE:{__agendaTPCompleta:true,
    __forecastTP:{conferido:true},key:events},
    PG_MAPA_TP_CARGA_CONCLUIDA:true,console:{info(){},warn(){},error(){}},
    arredondar:v=>Math.round(Number(v)||0),formatarBR:String,
    setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},
    performance:{now:()=>0},addEventListener(){},dispatchEvent(){},Event:class{},
    document:{getElementById:id=>id==='filtroReferencia'?{value:'replan'}:null,
      querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},
      createElement:elem,body:elem(),head:elem()}};
  w.window=w;vm.createContext(w);
  for(const name of ['Scripts_Eventos_TP.html','Scripts_Conclusao_SKU.html','Scripts_Globais_2.html']) {
    const source=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    for(const[,script]of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script,w,{filename:name});
  }
  vm.runInContext(`dtHojeISO='${corte}';dtHoje=new Date('${corte}T12:00:00');`,w);
  w.pgOrigemAtivaPortal='TODOS';w.pgDestinoAtivoPortal='TODOS';
  return w;
}

function etapas(w,base) {
  const faseAcab=vm.runInContext("FASES.find(f=>f.id==='acab')",w);
  const faseKit=vm.runInContext("FASES.find(f=>f.id==='kit')",w);
  return w.pgREProgressoEtapasSKU(base,corte,faseAcab,faseKit,l=>l.TIRAGEM);
}

test('Report usa a mesma rota final de Coleta CD, sem dobrar PCP e Acabadora',()=>{
  const transferencia=row(2,{CD_MAPA:'HR',CD_FINAL:'HR','CD DESTINO':'HR'});
  const final=row(3,{_SOURCE:'ACABADORA',_ROW_ID:'ACABADORA:3',GRAFICA_FINAL:'HR',
    'GRÁFICA':'HR','GRÁFICA DE ORIGEM':'LOGPRINT'});
  const direto=row(4,{SKU:'SKU-B',SKU_REAL:'SKU-B'});
  const excluida=row(5,{_SOURCE:'ACABADORA',_ROW_ID:'ACABADORA:5',
    GRAFICA_FINAL:'ATHOS','GRÁFICA':'ATHOS',SKU:'SKU-C',SKU_REAL:'SKU-C'});
  const w=portal([transferencia,final,direto,excluida]);
  const base=w.pgREBaseEtapasCD(w.dadosGlobais);
  assert.equal(base.length,2);
  assert.equal(base.includes(transferencia),false);
  assert.equal(base.includes(excluida),false);
  assert.equal(base.includes(final),true);
  assert.equal(base.includes(direto),true);
});

test('Coleta parcial completa Acabamento e Kit só no próprio SKU, sem alterar Coleta TP',()=>{
  const a=row(2,{'TIRAGEM COLETADA':90,Coleta_TP:'2026-11-08'});
  const b=row(3,{SKU:'SKU-B',SKU_REAL:'SKU-B',Coleta_TP:''});
  const w=portal([a,b],[event(2,90)]);
  const resultado=etapas(w,w.pgREBaseEtapasCD(w.dadosGlobais));
  assert.equal(resultado.find(r=>r.linha===a).acabado,90);
  assert.equal(resultado.find(r=>r.linha===a).kit,90);
  assert.equal(resultado.find(r=>r.linha===b).acabado,0);
  assert.equal(resultado.find(r=>r.linha===b).kit,0);
  assert.equal(w.pgVolumesColetaUnificadosV37(a,corte).coleta,90);
  assert.equal(w.pgVolumesColetaUnificadosV37(b,corte).coleta,0);
});

test('Kit registrado comprova Acabamento, mas Acabamento não antecipa Kit',()=>{
  const a=row(2,{'Formação de kit/Encaixotamento Final Real':'2026-11-07'});
  const b=row(3,{SKU:'SKU-B',SKU_REAL:'SKU-B','Acbto Final Real':'2026-11-07'});
  const w=portal([a,b]);
  const resultado=etapas(w,w.pgREBaseEtapasCD(w.dadosGlobais));
  assert.equal(resultado.find(r=>r.linha===a).acabado,100);
  assert.equal(resultado.find(r=>r.linha===a).kit,100);
  assert.equal(resultado.find(r=>r.linha===b).acabado,100);
  assert.equal(resultado.find(r=>r.linha===b).kit,0);
});

test('Coleta futura não adianta etapas e lote coletado não soma duas vezes o registrado',()=>{
  const a=row(2,{TIRAGEM:100,'TIRAGEM COLETADA':60,Coleta_TP:'2026-11-08',
    'Formação de kit/Encaixotamento Final Real':'2026-11-07'});
  const b=row(3,{SKU:'SKU-B',SKU_REAL:'SKU-B','TIRAGEM COLETADA':100,
    Coleta_TP:'2026-11-12'});
  const w=portal([a,b],[event(2,60),event(3,100,{sku:'SKU-B',coletaTP:'2026-11-12'})]);
  const resultado=etapas(w,w.pgREBaseEtapasCD(w.dadosGlobais));
  assert.equal(resultado.find(r=>r.linha===a).acabado,100);
  assert.equal(resultado.find(r=>r.linha===a).kit,100);
  assert.equal(resultado.find(r=>r.linha===b).acabado,0);
  assert.equal(resultado.find(r=>r.linha===b).kit,0);
});

test('Coleta da acabadora comprova só a rota final e mantém SAS na fonte Acabadora',()=>{
  const pcp=row(2,{MARCA_FINAL:'SAS',UNIDADE:'SAS',CD_MAPA:'HR',
    CD_FINAL:'HR','CD DESTINO':'HR'});
  const final=row(3,{_SOURCE:'ACABADORA',_ROW_ID:'ACABADORA:3',MARCA_FINAL:'SAS',
    UNIDADE:'SAS',GRAFICA_FINAL:'HR','GRÁFICA':'HR','GRÁFICA DE ORIGEM':'LOGPRINT',
    'TIRAGEM COLETADA':75,Coleta_TP:'2026-11-08'});
  const w=portal([pcp,final],[event(4,75,{marca:'SAS',grafica:'HR'})]);
  const resultado=etapas(w,w.pgREBaseEtapasCD(w.dadosGlobais));
  assert.equal(resultado.length,1);
  assert.equal(resultado[0].linha,final);
  assert.equal(resultado[0].acabado,75);
  assert.equal(resultado[0].kit,75);
});

test('Acabamento registrado no PCP chega à rota final somente com pareamento exato',()=>{
  const pcp=row(2,{CD_MAPA:'HR',CD_FINAL:'HR','CD DESTINO':'HR',
    'Acbto Final Real':'2026-11-07'});
  const final=row(3,{_SOURCE:'ACABADORA',_ROW_ID:'ACABADORA:3',
    GRAFICA_FINAL:'HR','GRÁFICA':'HR','GRÁFICA DE ORIGEM':'LOGPRINT'});
  const w=portal([pcp,final]);
  const faseAcab=vm.runInContext("FASES.find(f=>f.id==='acab')",w);
  const faseKit=vm.runInContext("FASES.find(f=>f.id==='kit')",w);
  const base=w.pgREBaseEtapasCD(w.dadosGlobais);
  const link=w.pgREAcabamentoPCPNaRotaFinal(w.dadosGlobais,base,corte,faseAcab);
  assert.equal(link.get(final),100);
  const progresso=w.pgREProgressoEtapasSKU(base,corte,faseAcab,faseKit,l=>l.TIRAGEM,link);
  assert.equal(progresso[0].acabado,100);
  assert.equal(progresso[0].kit,0);

  for(const divergencia of [{ENVIO:'V2'},{'SÉRIE':'2 ANO'},
    {'GRÁFICA DE ORIGEM':'LEOGRAF'},{TIRAGEM:90}]) {
    const alterada={...final,...divergencia,_ROW_ID:'ACABADORA:9'};
    const teste=portal([pcp,alterada]);
    const f=vm.runInContext("FASES.find(f=>f.id==='acab')",teste);
    const chave=teste.pgREAcabamentoPCPNaRotaFinal(teste.dadosGlobais,[alterada],corte,f);
    assert.equal(chave.size,0,JSON.stringify(divergencia));
  }
});

test('Tabela executiva agrega Acabamento, Kit e Coleta na mesma base sem mudar a coleta',()=>{
  const a=row(2,{'TIRAGEM COLETADA':90,Coleta_TP:'2026-11-08'});
  const b=row(3,{SKU_REAL:'SKU-B',SKU:'SKU-B',
    'Formação de kit/Encaixotamento Final Real':'2026-11-08'});
  const w=portal([a,b],[event(2,90)]);
  const table={querySelector(){return null;},querySelectorAll(){return [];}};
  const tbody={innerHTML:'',closest:()=>table};
  const grupos={querySelectorAll(){return [];}};
  const seletor={querySelectorAll(){return [];},querySelector(){return {textContent:''};}};
  const painel={
    querySelector(sel){
      if(sel==='[data-pg-re-grupos-v58]')return grupos;
      if(sel==='[data-pg-re-corte-v57]')return seletor;
      if(sel.includes('data-re-coluna'))return {checked:sel.includes('marca')};
      return null;
    }
  };
  w.document.getElementById=id=>({
    reTabelaMarcas:tbody,pgReSeletoresV42:painel,
    filtroReferencia:{value:'replan'}
  })[id]||null;
  w.document.querySelector=()=>table;
  w.pgREFixarAgrupamento=()=>{};
  w.reAtivarCliquesTabela=()=>{};
  w.renderReportExecutivaCurvaSemanal=()=>{};
  w.pgBaseGeralReportExecutiva=[a,b];
  w.processarReportExecutiva();

  assert.equal(w.pgReportAuditoriaPortal.acabamento.total.den,200);
  assert.equal(w.pgReportAuditoriaPortal.kit.total.den,200);
  assert.equal(w.pgReportAuditoriaPortal.coletaCD.total.den,200);
  assert.equal(w.pgReportAuditoriaPortal.acabamento.total.real,190);
  assert.equal(w.pgReportAuditoriaPortal.kit.total.real,190);
  assert.equal(w.pgReportAuditoriaPortal.coletaCD.total.real,90);
  assert.match(tbody.innerHTML, /data-re-chave="COC"/);
  const linha=tbody.innerHTML.match(/<tr class="" data-re-chave="COC">([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(linha);
  assert.match(linha, /<td class="re-group-acab">95%<\/td>/);
  assert.match(linha, /<td class="re-group-kit">95%<\/td>/);
  assert.match(linha, /<td class="re-group-entcd">45%<\/td>/);
});
