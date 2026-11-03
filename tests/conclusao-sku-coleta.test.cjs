const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hoje = '2026-11-03';
const row = (n, extra={}) => ({_SOURCE:'PCP',_PG_TP_LINHA:n,_ROW_ID:'PCP:'+n,ID:n,
  MARCA_FINAL:'COC',UNIDADE:'COC',GRAFICA_FINAL:'LOGPRINT','GRÁFICA_MAPA':'LOGPRINT','GRÁFICA':'LOGPRINT',
  SKU_REAL:'SKU-A',SKU:'SKU-A',ENVIO:'V1',CD_MAPA:'CD JDI',CD_FINAL:'CD JDI','CD DESTINO':'CD JDI',
  TIRAGEM:100,'TIRAGEM COLETADA':0,'TIRAGEM AGENDADA':0,
  Coleta_TP:'2026-11-01',Entrega_TP:'2026-11-02',
  'ENV ARQUIVO REAL':'','Acbto Final Real':'','Formação de kit/Encaixotamento Final Real':'',...extra});
const event = (n, volume, extra={}) => ({eventoTPVersao:1,linhaMapa:n,marca:'COC',grafica:'LOGPRINT',
  sku:'SKU-A',destino:'CD JDI',envio:'V1',volumeColetado:volume,
  coletaTP:'2026-11-01',entregaTP:'2026-11-02',...extra});
function portal(rows,events=[]) {
  const element=()=>({style:{},classList:{add(){},remove(){}},appendChild(){},addEventListener(){}});
  const w={dadosGlobais:rows,MAPA_SAIDA_CACHE:{__agendaTPCompleta:true,__forecastTP:{conferido:true},key:events},
    PG_MAPA_TP_CARGA_CONCLUIDA:true,console:{info(){},warn(){},error(){}},
    arredondar:v=>Math.round(Number(v)||0),formatarBR:String,setTimeout(){},clearTimeout(){},
    setInterval(){},clearInterval(){},performance:{now:()=>0},addEventListener(){},dispatchEvent(){},Event:class{},
    document:{getElementById:id=>id==='filtroReferencia'?{value:'replan'}:null,
      querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},createElement:element,
      body:element(),head:element()}};
  w.window=w;vm.createContext(w);
  for(const name of ['Scripts_Eventos_TP.html','Scripts_Conclusao_SKU.html','Scripts_Globais_2.html']) {
    const source=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    for(const[,script]of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))vm.runInContext(script,w,{filename:name});
  }
  vm.runInContext(`dtHojeISO='${hoje}';dtHoje=new Date('${hoje}T12:00:00');`,w);
  w.pgOrigemAtivaPortal='TODOS';w.pgDestinoAtivoPortal='TODOS';
  return w;
}
const state=(w,r,cut=hoje)=>w.pgConclusaoSKUColeta(r,cut);

test('SKU completo com quantidade concentrada conclui todas as linhas, inclusive Custo e OC',()=>{
  const rows=[row(150,{TIRAGEM:544,'TIRAGEM COLETADA':610}),row(2903,{TIRAGEM:66,Coleta_TP:'',Entrega_TP:''})];
  const before=JSON.stringify(rows),w=portal(rows,[event(2,610)]);
  for(const r of rows) {
    const s=state(w,r);assert.equal(s.concluido,true);assert.equal(s.total,610);assert.equal(s.coletado,610);
    assert.equal(s.dataConfirmacaoColeta,'2026-11-01');
    for(const fase of ['env','rec','apv','imp','cus','oc','tra','rec_acab','acab','kit','col'])
      assert.equal(w.pgConclusaoFasePorColeta(r,fase,hoje).concluido,true,fase);
    for(const fase of ['col_tp','col_mapa','ent_tp','ent_cd','int_cd'])
      assert.equal(w.pgConclusaoFasePorColeta(r,fase,hoje),null,fase);
  }
  assert.equal(JSON.stringify(rows),before,'Não grava datas nem quantidades nas fontes');
  // O recorte de apresentação não pode esconder a prova existente no universo.
  w.dadosFiltrados=[rows[1]];w.dadosTotalCanonico=[rows[1]];
  assert.equal(state(w,rows[1]).concluido,true);
});

test('owner integral na sua linha não conclui SKU parcialmente coletado',()=>{
  const rows=[row(2,{'TIRAGEM COLETADA':100}),row(3)],w=portal(rows,[event(2,100)]);
  assert.equal(state(w,rows[0]).concluido,false);assert.equal(state(w,rows[1]).total,200);
  assert.equal(state(w,rows[1]).coletado,100);
  assert.equal(w.pgConclusaoFasePorColeta(rows[1],'imp',hoje),null,'Um estado parcial não é uma prova truthy');
});

test('agenda e quantidade bruta sem coleta realizada não concluem etapas',()=>{
  const r=row(2,{'TIRAGEM COLETADA':100,'TIRAGEM AGENDADA':100,Coleta_TP:'2026-11-05'});
  const w=portal([r],[event(2,100,{coletaTP:'2026-11-05'})]);
  assert.equal(state(w,r).coletado,0);assert.equal(state(w,r).concluido,false);
});

test('parcelas, data da conclusão e cortes históricos respeitam o dia em que o grupo alcança 100%',()=>{
  const rows=[row(2,{'TIRAGEM COLETADA':200,GIRO_TOTAL_BA:200}),row(3)];
  const w=portal(rows,[event(2,80),event(3,120,{coletaTP:'2026-11-02'})]);
  assert.equal(state(w,rows[1],'2026-11-01').concluido,false);
  assert.equal(state(w,rows[1],'2026-11-01').coletado,80);
  assert.equal(state(w,rows[1],'2026-11-02').concluido,true);
  assert.equal(state(w,rows[1]).dataConfirmacaoColeta,'2026-11-02');
  const future=portal(rows,[event(2,80),event(3,120,{coletaTP:'2026-11-05'})]);
  assert.equal(state(future,rows[1]).concluido,false);
});

test('excedentes de outro CD, envio, SKU ou fonte não completam o grupo parcial',()=>{
  const partial=row(2,{'TIRAGEM COLETADA':50});
  const others=[row(3,{'TIRAGEM COLETADA':150,CD_MAPA:'CD RP',CD_FINAL:'CD RP','CD DESTINO':'CD RP'}),
    row(4,{'TIRAGEM COLETADA':150,ENVIO:'V2'}),row(5,{'TIRAGEM COLETADA':150,SKU_REAL:'SKU-B',SKU:'SKU-B'}),
    row(6,{'TIRAGEM COLETADA':150,_SOURCE:'ACABADORA',_ROW_ID:'ACAB:6',GRAFICA_FINAL:'HR','GRÁFICA':'HR'})];
  const events=[event(2,50),event(3,150,{destino:'CD RP'}),event(4,150,{envio:'V2'}),
    event(5,150,{sku:'SKU-B'}),event(6,150,{grafica:'HR'})];
  const w=portal([partial,...others],events);
  assert.equal(state(w,partial).total,100);assert.equal(state(w,partial).coletado,50);
  assert.equal(state(w,partial).concluido,false);
});

test('linhas físicas e movimentos repetidos não multiplicam tiragem ou coleta',()=>{
  const r=row(2,{'TIRAGEM COLETADA':100}),duplicate={...r},e=event(2,100);
  const w=portal([r,duplicate],[e,{...e}]);
  assert.equal(state(w,r).total,100);assert.equal(state(w,r).coletado,100);
  assert.equal(state(w,r).concluido,true);
});

test('identidade ausente e quantidade não conciliada nunca produzem conclusão inferida',()=>{
  const r=row(2,{'TIRAGEM COLETADA':200}),w=portal([r],[event(2,100)]);
  assert.equal(state(w,r).concluido,false);assert.match(state(w,r).motivo,/nao-concilia/);
  assert.equal(state(w,{...r,CD_MAPA:''}).concluido,false);
  assert.match(state(w,{...r,CD_MAPA:''}).motivo,/incompleta/);
  assert.equal(state(w,r,'2026-02-31').concluido,false);
});

test('tiragens fracionadas somam antes do arredondamento da prova de 100%',()=>{
  const rows=[row(2,{TIRAGEM:7.5,'TIRAGEM COLETADA':15,GIRO_TOTAL_BA:15}),row(3,{TIRAGEM:7.5})];
  const w=portal(rows,[event(2,15)]);
  assert.equal(state(w,rows[0]).total,15);assert.equal(state(w,rows[1]).concluido,true);
  assert.equal(w.getVolFase(rows[0],{id:'imp'},8),8,'Volume da fase conserva o arredondamento vigente');
});

test('cópias da mesma linha física com quantidades divergentes invalidam a prova',()=>{
  const r=row(2,{'TIRAGEM COLETADA':100}),w=portal([r,{...r,'TIRAGEM COLETADA':50}],[event(2,100)]);
  assert.equal(state(w,r).concluido,false);assert.equal(state(w,r).motivo,'linha-fisica-divergente');
});

test('transferência PCP completa fases iniciais e financeiras, preservando fases da acabadora',()=>{
  const r=row(2,{'TIRAGEM COLETADA':100,CD_MAPA:'HR',CD_FINAL:'HR','CD DESTINO':'HR'});
  const w=portal([r],[event(2,100,{destino:'HR'})]);
  for(const fase of ['env','rec','apv','imp','cus','oc','tra'])
    assert.equal(w.pgConclusaoFasePorColeta(r,fase,hoje).concluido,true,fase);
  for(const fase of ['rec_acab','acab','kit'])assert.equal(w.pgConclusaoFasePorColeta(r,fase,hoje),null,fase);
});

test('invalidação explícita reconstrói denominador após alteração da base',()=>{
  const r=row(2,{'TIRAGEM COLETADA':100}),w=portal([r],[event(2,100)]);
  assert.equal(state(w,r).concluido,true);
  r.TIRAGEM=200;w.pgInvalidarConclusaoSKUColeta();
  assert.equal(state(w,r).concluido,false);assert.equal(state(w,r).total,200);
});

test('integração central reconhece fases sem gravar datas e alimenta acabamento V46',()=>{
  const r=row(2,{'TIRAGEM COLETADA':100}),w=portal([r],[event(2,100)]);
  for(const id of ['env','imp','cus','oc','acab','kit']) {
    const f=vm.runInContext(`FASES.find(f=>f.id==='${id}')`,w);
    assert(f,id);assert.equal(w.dataFoiPreenchida(r,f),true,id);
    assert.equal(w.getVolFase(r,f,100),100,id);
    assert.equal(w.pgDataRealFaseFunil(r,f),'2026-11-01',id);
  }
  w.dadosAcabamentoOrigem=[r];
  const metric=w.pgMetricasAcabamentoRealV46('replan',hoje,()=> 'COC',hoje);
  assert.equal(metric.total.den,100);assert.equal(metric.total.real,100);
  assert.equal(r['Acbto Final Real'],'');
});
