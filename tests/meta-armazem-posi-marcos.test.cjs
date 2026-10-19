const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..');
const fim = 'Coleta/Internalização de estoque final (re) plan';
const inicio = 'Coleta/Internalização de estoque inicial (re) plan';
const plain = value => JSON.parse(JSON.stringify(value));
const row = (extra = {}) => ({
  _SOURCE:'PCP', _ROW_ID:'PCP:101', _PG_TP_LINHA:101, ID:101,
  MARCA_FINAL:'CQT', UNIDADE:'CQT', GRAFICA_FINAL:'POSIGRAF', 'GRÁFICA':'POSIGRAF',
  CD_MAPA:'POSIGRAF', CD_FINAL:'POSIGRAF', 'CD DESTINO':'POSIGRAF',
  SEGMENTO:'ENSINO INFANTIL', TIPO:'PROFESSOR', 'SÉRIE':'INF 5 ANOS',
  SKU_REAL:'200105309', SKU:'200105309', KIT:'', ENVIO:'V1',
  TIRAGEM:100, 'TIRAGEM COLETADA':0, [fim]:'2026-10-16', ...extra
});
const spe = (extra = {}) => row({MARCA_FINAL:'SPE', UNIDADE:'SPE',
  SEGMENTO:'ENSINO FUNDAMENTAL 1', 'SÉRIE':'1º ANO', TIPO:'ALUNO', ...extra});
const script = [...fs.readFileSync(path.join(repo, 'abaMetaArmazem.html'), 'utf8')
  .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];

function motor() {
  const w = {filtrosGeraisIniciados:true, aplicarFiltros(){}, console,
    localStorage:{getItem(){return null;}, setItem(){}}};
  vm.runInNewContext(script, {window:w, console, document:{}}, {filename:'abaMetaArmazem.html'});
  return w;
}

// Usa os motores de conciliação e de prazo reais; apenas DOM e relógio são simulados.
function portal(rows, {today = '2026-10-15', cache = {}, sla = 0} = {}) {
  const controls = {filtroReferencia:{value:'replan'}, pgFiltroOrigem:{value:'TODOS'}, pgFiltroDestino:{value:'TODOS'}};
  const element = () => ({value:'', innerHTML:'', textContent:'', style:{},
    classList:{add(){}, remove(){}, toggle(){}}, appendChild(){}, remove(){},
    addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    querySelector(){return null;}, querySelectorAll(){return [];}});
  const w = {dadosGlobais:rows, MAPA_SAIDA_CACHE:{__agendaTPCompleta:true,__forecastTP:{conferido:true},...cache},
    PG_MAPA_TP_CARGA_CONCLUIDA:true,
    PG_MATRIZ_SLA:[['FORNECEDOR','POSIGRAF','CD JDI'],['POSIGRAF',sla,sla],['FORMA CERTA',sla,sla]],
    console:{info(){}, warn(){}, error(){}}, arredondar:v=>Math.round(Number(v)||0), formatarBR:String,
    setTimeout(){}, clearTimeout(){}, setInterval(){}, clearInterval(){}, performance:{now:()=>0},
    addEventListener(){}, dispatchEvent(){}, Event:class{}, Blob, TextEncoder,
    alert:message=>assert.fail(message), localStorage:{getItem(){return null;}, setItem(){}}};
  w.document = {getElementById(id){return controls[id]||(id.startsWith('ma')?(controls[id]=element()):null);},
    querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){},
    createElement:element, body:element(), head:element()};
  w.window = w;
  vm.createContext(w);
  for (const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html','Scripts_Meta_Armazem_Realizado.html','abaMetaArmazem.html']) {
    const html = fs.readFileSync(path.join(repo, name), 'utf8');
    for (const [,code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(code, w, {filename:name});
  }
  vm.runInContext(`dtHojeISO='${today}';dtHoje=new Date('${today}T12:00:00');`, w);
  w.dadosBaseForecastColeta = rows;
  w.processarMetaArmazem();
  return {w, controls, items:w.pgMAVisaoAtual.itens, total:w.pgMAVisaoAtual.total};
}

function value(audit, index, column) {
  const position = audit.cabecalho.indexOf(column);
  assert.notEqual(position, -1, 'Coluna de auditoria: '+column);
  return audit.linhas[index][position];
}

test('Posi: fim (re)Plan que coincide com marco oficial seleciona a meta desse marco', () => {
  const w = motor();
  const cases = [
    [row(), '2026-10-16'],
    [row({[fim]:'2026-11-10'}), '2026-11-10'],
    [row({'SÉRIE':'INF 2 ANOS'}), '2026-10-16'],
    [row({SEGMENTO:'ENSINO FUNDAMENTAL 1','SÉRIE':'3º ANO',[fim]:'2026-10-20'}), '2026-10-20'],
    [spe({[fim]:'2026-10-26'}), '2026-10-26'],
    [spe({[fim]:'2026-11-15'}), '2026-11-16'],
    [spe({'SÉRIE':'4º ANO',[fim]:'2026-11-20'}), '2026-11-20'],
    [spe({'SÉRIE':'5º ANO',TIPO:'PROFESSOR',[fim]:'2026-10-16'}), '2026-10-16'],
    [spe({SEGMENTO:'ENSINO FUNDAMENTAL 2','SÉRIE':'6º ANO',[fim]:'2026-10-12'}), '2026-10-15'],
    [spe({SEGMENTO:'ENSINO MEDIO','SÉRIE':'1ª SERIE',[fim]:'2026-10-25'}), '2026-10-26'],
    [spe({SEGMENTO:'PRE VESTIBULAR','SÉRIE':'EXTENSIVO',[fim]:'2026-10-25'}), '2026-10-26']
  ];
  for (const [source, expected] of cases)
    assert.equal(w.pgMAMetaAplicadaDaLinha(source), expected, JSON.stringify(source));
  assert.equal(w.pgMAMetaAplicadaDaLinha(row({[inicio]:'16/10/2026',[fim]:'16/10/2026'})), '2026-10-16');
});

test('Posi: sem correspondência exata ou intervalo confiável preserva prazo final anterior', () => {
  const w = motor();
  const cases = [
    {[fim]:''}, {[fim]:'sem data'}, {[fim]:'2026-02-31'},
    {[fim]:'2026-10-15'}, {[fim]:'2026-10-20'}, {[fim]:'2026-11-11'},
    {[inicio]:'inválido'}, {[inicio]:'2026-10-20'},
    {[inicio]:'2026-11-10',[fim]:'2026-10-16'}
  ];
  for (const extra of cases)
    assert.equal(w.pgMAMetaAplicadaDaLinha(row(extra)), '2026-11-10', JSON.stringify(extra));
  assert.equal(w.pgMAMetaAplicadaDaLinha(spe({[fim]:'2026-11-01'})), '2026-11-16');
});

test('marco intermediário não muda Vários, avaliação, outras rotas nem cenário fere', () => {
  const w = motor();
  assert.equal(w.pgMAMetaAplicadaDaLinha(row({'SÉRIE':'VARIOS'})), '2026-11-10');
  assert.equal(w.pgMAMetaAplicadaDaLinha(spe({'SÉRIE':'VARIOS',[fim]:'2026-10-26'})), '2026-11-20');
  assert.equal(w.pgMAMetaAplicadaDaLinha(row({AVALIACAO:'SIM'})), '2026-10-26');
  assert.equal(w.pgMAMetaAplicadaDaLinha(row({GRAFICA_FINAL:'FORMA CERTA'})), '2026-10-15');
  assert.equal(w.pgMAMetaAplicadaDaLinha(row({CD_FINAL:'CD JDI'})), '2026-10-15');
  assert.equal(w.pgMAMetaAplicadaDaLinha(row({MARCA_FINAL:'EI',UNIDADE:'EI',SEGMENTO:'ENSINO MEDIO','SÉRIE':'1ª SERIE',[fim]:'2026-10-02'})), '2026-10-15');
  w.pgMACenario('sem');
  assert.equal(w.pgMAMetaAplicadaDaLinha(row()), '2026-10-15');
  assert.equal(w.pgMAMetaAplicadaDaLinha(spe({[fim]:'2026-10-26'})), '2026-10-15');
});

test('filtro Meta Aplicada e auditorias usam o marco selecionado pela mesma linha', () => {
  const source = row();
  const app = portal([source]);
  const item = app.items[0];
  assert.equal(item.metaAplicada, '2026-10-16');
  assert.equal(app.w.pgMAMetaAplicadaDaLinha(source), item.metaAplicada);
  assert.deepEqual(Array.from(app.w.pgMAMetasPossiveisDaLinha(source)), ['2026-10-15','2026-10-16']);
  assert.equal(item.previsto, 100);
  assert.equal(item.pos, 0);
  for (const audit of [app.w.pgMAObterAuditoria(), app.w.pgMAObterAuditoriaRealizado(), app.w.pgMAObterAuditoriaColetas()]) {
    assert.equal(value(audit,0,'Meta aplicada'), '2026-10-16');
    const composition = JSON.parse(value(audit,0,'Composição do agrupamento'));
    assert.deepEqual(composition.map(part=>part.meta), ['2026-10-16']);
  }
});

test('piso de 15/10 permite entrega real antes da meta mesmo depois do replan de 12/10', () => {
  const source = spe({SEGMENTO:'ENSINO FUNDAMENTAL 2','SÉRIE':'6º ANO',
    [fim]:'2026-10-12','TIRAGEM COLETADA':100,Coleta_TP:'2026-10-12',Entrega_TP:'2026-10-14'});
  const app = portal([source], {today:'2026-10-17'});
  const item = app.items[0];
  assert.equal(item.metaAplicada, '2026-10-15');
  assert.equal(item.realizado, 100);
  assert.equal(item.real, 100);
  assert.equal(item.previsto, 100);
  assert.equal(item.pos, 0);
  assert.equal(value(app.w.pgMAObterAuditoriaRealizado(),0,'Entregue fora da meta'), 0);
});

test('Posigraf -> Posigraf: SLA 0, coleta domingo 25/10 e meta passa para segunda 26/10', () => {
  const source=spe({SEGMENTO:'ENSINO MEDIO','SÉRIE':'1ª SERIE',
    [inicio]:'2026-10-25',[fim]:'2026-10-25'});
  const app=portal([source],{today:'2026-10-19',sla:1});
  const item=app.items[0];
  assert.equal(item.metaAplicada,'2026-10-26');
  assert.equal(app.w.pgDiasSLALinha(source),0,'rota interna prevalece sobre o 1 da matriz');
  assert.equal(app.w.pgDataPlanoEntregaSLA(source,'2026-10-25'),'2026-10-25');
  assert.equal(item.slaDias,0);
  assert.equal(item.inicioPlan,'2026-10-26');
  assert.equal(item.dtPlan,'2026-10-26','previsão de domingo passa para segunda, mantendo SLA 0');
  assert.equal(item.previsto,100);
  assert.equal(item.pos,0);
  const audit=app.w.pgMAObterAuditoria();
  assert.equal(value(audit,0,'SLA (dias corridos)'),0);
  assert.equal(value(audit,0,'Entrega início prevista'),'2026-10-26');
  assert.equal(value(audit,0,'Entrega fim prevista'),'2026-10-26');
  assert.equal(value(audit,0,'Dentro da meta'),100);
});

test('marcos de domingo são adiados para segunda na Meta Aplicada (sem mudar replan)', () => {
  const w=motor();
  for (const [base,original,esperada] of [
    [spe({SEGMENTO:'ENSINO MEDIO','SÉRIE':'1ª SERIE'}),'2026-10-25','2026-10-26'],
    [spe({SEGMENTO:'ENSINO FUNDAMENTAL 1','SÉRIE':'1º ANO',TIPO:'ALUNO'}),'2026-11-15','2026-11-16']
  ]) {
    for (const fimReplan of [original,esperada]) {
      const source={...base,[inicio]:fimReplan,[fim]:fimReplan};
      assert.equal(w.pgMAMetaAplicadaDaLinha(source),esperada,
        'Marco de domingo e replan na segunda devem apontar a mesma meta');
      assert.equal(source[fim],fimReplan,'a data operacional original não é alterada');
    }
    const app=portal([{...base,[inicio]:original,[fim]:original}],{today:'2026-10-19',sla:1});
    assert.equal(app.items[0].metaAplicada,esperada);
    assert.equal(app.items[0].dtPlan,esperada);
    const audit=app.w.pgMAObterAuditoria();
    assert.equal(value(audit,0,'Meta aplicada'),esperada);
    assert.equal(value(audit,0,'Prazo combinado Posi'),esperada);
    assert.equal(value(audit,0,'Coleta fim (re)plan'),original);
  }
});

test('SLA e ajuste de domingo continuam válidos nas outras rotas', () => {
  const externa=row({CD_FINAL:'CD JDI',CD_MAPA:'CD JDI','CD DESTINO':'CD JDI'});
  const app=portal([externa],{today:'2026-10-15',sla:2});
  assert.equal(app.w.pgDiasSLALinha(externa),2);
  assert.equal(app.items[0].dtPlan,'2026-10-19','16/10 + 2 dias cai no domingo e avança para segunda');
  assert.equal(app.items[0].metaAplicada,'2026-10-15');
  assert.equal(app.items[0].previsto,0);
  assert.equal(app.w.pgDiasSLALinha({...externa,CD_FINAL:'CD FOR','CD DESTINO':'CD FOR'}),null,
    'rota não cadastrada não ganha SLA inventado');
  const externaSLAZero=row({GRAFICA_FINAL:'FORMA CERTA','GRÁFICA':'FORMA CERTA',
    CD_FINAL:'CD JDI',CD_MAPA:'CD JDI','CD DESTINO':'CD JDI',
    [inicio]:'2026-10-25',[fim]:'2026-10-25'});
  const mesmoDomingo=portal([externaSLAZero],{today:'2026-10-19',sla:0});
  assert.equal(mesmoDomingo.items[0].slaDias,0);
  assert.equal(mesmoDomingo.items[0].dtPlan,'2026-10-26',
    'previsão de domingo passa para segunda também em rotas externas');
});

test('sem KIT inequívoco, marcos distintos preservam prazo final e total do agrupamento', () => {
  const rows = [row({'TIRAGEM COLETADA':40}), row({_ROW_ID:'PCP:102',_PG_TP_LINHA:102,ID:102,
    TIRAGEM:100,[fim]:'2026-11-10'})];
  const before = plain(rows);
  const cache = {key:[{eventoTPVersao:1,marca:'CQT',grafica:'POSIGRAF',sku:'200105309',
    destino:'POSIGRAF',envio:'V1',linhaMapa:2,codigoMapa:'MP-2',chaveMapa:'CHAVE-2',kit:'',
    volumeColetado:40,coletaTP:'2026-10-13',entregaTP:'2026-10-14'}]};
  const app = portal(rows, {today:'2026-10-17',cache});
  assert.equal(app.items.length, 1);
  const item = app.items[0];
  assert.equal(item.total, 200);
  assert.equal(item.realizado, 40);
  assert.equal(item.pendentePlanejado, 160);
  assert.equal(item.metaAplicada, '2026-11-10');
  assert.equal(app.w.pgMAMetaAplicadaDaLinha(item.linha), item.metaAplicada);
  assert.deepEqual(Array.from(app.w.pgMAMetasPossiveisDaLinha(item.linha)), ['2026-10-15','2026-11-10']);
  assert.equal(item.dtPlan, '2026-11-10');
  assert.equal(item.previsto, 200);
  for (const audit of [app.w.pgMAObterAuditoria(),app.w.pgMAObterAuditoriaRealizado()]) {
    assert.equal(value(audit,0,'Meta aplicada'), '2026-11-10');
    assert.deepEqual(JSON.parse(value(audit,0,'Composição do agrupamento')).map(part=>part.meta),
      ['2026-11-10','2026-11-10']);
  }
  assert.deepEqual(plain(rows), before);
});

test('helper e filtro do grupo seguem marco comum das origens da mesma coorte', () => {
  const rows = [row({'TIRAGEM COLETADA':40}), row({_ROW_ID:'PCP:102',_PG_TP_LINHA:102,ID:102})];
  const cache = {key:[{eventoTPVersao:1,marca:'CQT',grafica:'POSIGRAF',sku:'200105309',
    destino:'POSIGRAF',envio:'V1',linhaMapa:2,codigoMapa:'MP-2',chaveMapa:'CHAVE-2',kit:'',
    volumeColetado:40,coletaTP:'2026-10-13',entregaTP:'2026-10-14'}]};
  const app = portal(rows, {today:'2026-10-15',cache});
  assert.equal(app.items.length, 1);
  const item = app.items[0];
  assert.equal(item.total, 200);
  assert.equal(item.realizado, 40);
  assert.equal(item.metaAplicada, '2026-10-16');
  assert.equal(app.w.pgMAMetaAplicadaDaLinha(item.linha), item.metaAplicada);
  assert.deepEqual(Array.from(app.w.pgMAMetasPossiveisDaLinha(item.linha)), ['2026-10-15','2026-10-16']);
  assert.equal(item.previsto, 200);
});

test('sem movimento compartilhado, duas parcelas do SKU conservam metas próprias', () => {
  const rows = [row(), row({_ROW_ID:'PCP:102',_PG_TP_LINHA:102,ID:102,[fim]:'2026-11-10'})];
  const app = portal(rows);
  assert.equal(app.items.length, 2);
  assert.deepEqual(Array.from(app.items,item=>item.metaAplicada), ['2026-10-16','2026-11-10']);
  assert.equal(app.total.total, 200);
  assert.equal(app.total.previsto, 200);
});

test('intervalo atravessando marcos mantém rateio existente sem criar metas por parcela', () => {
  const source = row({[inicio]:'2026-10-16',[fim]:'2026-11-10'});
  const app = portal([source]);
  const item = app.items[0];
  assert.equal(item.metaAplicada, '2026-11-10');
  assert.equal(item.previsto, 100);
  const parcelas = app.w.pgMADiasEntrega(item);
  assert(parcelas.length > 1);
  assert.equal(parcelas[0].data, '2026-10-16');
  assert.equal(parcelas[parcelas.length-1].data, '2026-11-10');
  assert(Math.abs(parcelas.reduce((sum,part)=>sum+part.volume,0)-100)<1e-9);
});

test('marco novo igual não apaga conflito anterior entre coortes de grupo sem KIT', () => {
  const rows = [spe({'TIRAGEM COLETADA':40,[fim]:'2026-10-26'}),
    spe({_ROW_ID:'PCP:102',_PG_TP_LINHA:102,ID:102,'SÉRIE':'3º ANO',[fim]:'2026-10-26'})];
  const cache = {key:[{eventoTPVersao:1,marca:'SPE',grafica:'POSIGRAF',sku:'200105309',
    destino:'POSIGRAF',envio:'V1',linhaMapa:2,codigoMapa:'MP-2',chaveMapa:'CHAVE-2',kit:'',
    volumeColetado:40,coletaTP:'2026-10-13',entregaTP:'2026-10-14'}]};
  const app = portal([rows[0]], {today:'2026-10-17',cache});
  assert.throws(()=>app.w.pgMAObterItens({base:rows}), /metas diferentes entre as linhas de origem/);
});

test('filtro aplicado às origens respeita o prazo efetivo depois da conciliação sem KIT', () => {
  const rows = [row({'TIRAGEM COLETADA':40}),
    row({_ROW_ID:'PCP:102',_PG_TP_LINHA:102,ID:102,[fim]:'2026-11-10'})];
  const before = plain(rows);
  const cache = {key:[{eventoTPVersao:1,marca:'CQT',grafica:'POSIGRAF',sku:'200105309',
    destino:'POSIGRAF',envio:'V1',linhaMapa:2,codigoMapa:'MP-2',chaveMapa:'CHAVE-2',kit:'',
    volumeColetado:40,coletaTP:'2026-10-13',entregaTP:'2026-10-14'}]};
  const app = portal(rows, {today:'2026-10-17',cache});
  const checkboxes = ['2026-10-15','2026-10-16','2026-11-10'].map(value=>({value,checked:false}));
  app.w.filtrosGeraisIniciados = true;
  app.w.document.querySelectorAll = selector => {
    if (selector === '.chk-geral-MetaAplicada') return checkboxes;
    if (selector === '.chk-geral-MetaAplicada:checked') return checkboxes.filter(cb=>cb.checked);
    return [];
  };
  function selecionar(meta) {
    checkboxes.forEach(cb=>{cb.checked = cb.value === meta;});
    // Mesmo recorte das linhas cruas feito pelo filtro global antes da conciliação.
    app.w.pgBaseGeralReportExecutiva = rows.filter(source=>
      app.w.pgValorFiltroProducao(source,'Meta Aplicada') === meta);
    return app.w.pgBaseGeralReportExecutiva;
  }

  assert.deepEqual(selecionar('2026-10-16').map(source=>source.ID), [101]);
  assert.equal(app.w.pgMAObterItens({cenario:'com'}).length, 0,
    'Selecionar 16/10 não pode exibir o grupo cuja meta foi preservada em 10/11');
  assert.equal(app.w.pgMAObterItens({cenario:'sem'}).length, 0,
    'A comparação de outro cenário conserva o universo do filtro global ativo');

  const explicit = app.w.pgMAObterItens({base:rows,cenario:'com'});
  assert.equal(explicit.length, 1, 'Base explícita não herda a seleção da tela');
  assert.equal(explicit[0].total, 200);
  assert.equal(explicit[0].metaAplicada, '2026-11-10');

  assert.deepEqual(selecionar('2026-11-10').map(source=>source.ID), [102]);
  const selected = app.w.pgMAObterItens({cenario:'com'});
  assert.equal(selected.length, 1);
  assert.equal(selected[0].total, 200, 'A conciliação recupera o grupo completo');
  assert.equal(selected[0].realizado, 40, 'A parcela compartilhada continua única');
  assert.equal(selected[0].metaAplicada, '2026-11-10');
  assert.equal(selected[0].prazoPosiPreservado, true);
  assert.equal(selected[0].conciliacao.filtroParcial, true);

  const alternative = app.w.pgMAObterItens({cenario:'sem'});
  assert.equal(alternative.length, 1,
    'O cenário alternativo não reaplica sua própria meta à seleção da tela');
  assert.equal(alternative[0].total, 200);
  assert.equal(alternative[0].metaAplicada, '2026-10-15');
  assert.deepEqual(plain(rows), before, 'O recorte e a conciliação preservam a origem');
});
