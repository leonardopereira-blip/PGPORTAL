const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const row = extra => ({
  _SOURCE:'PCP', _PG_TP_LINHA:2, _ROW_ID:'PCP:2', Chave:'OP-SKU',
  MARCA_FINAL:'SAS - BRADESCO', UNIDADE:'SAS - BRADESCO', GRAFICA_FINAL:'RICARGRAF',
  'GRÁFICA_MAPA':'RICARGRAF', 'GRÁFICA':'RICARGRAF', SKU_REAL:'SKU-1', SKU:'SKU-1',
  ENVIO:'V1', CD_MAPA:'CD RP', CD_FINAL:'CD RP', 'CD DESTINO':'CD RP',
  TIRAGEM:200, GIRO_TOTAL_BA:200, 'TIRAGEM COLETADA':200, 'TIRAGEM AGENDADA':0,
  Coleta_TP:'2026-11-05', Entrega_TP:'2026-11-08', ...extra
});
const movement = (r, extra = {}) => ({
  eventoTPVersao:2, linhaMapa:20, codigoMapa:'MP-20', marca:r.MARCA_FINAL,
  grafica:r['GRÁFICA_MAPA'], sku:r.SKU_REAL, destino:r.CD_MAPA, envio:r.ENVIO,
  volumeColetado:100, volumeSolicitado:100, coletaTP:'2026-11-01', entregaTP:'2026-11-03',
  ...extra
});
const map = events => ({__agendaTPCompleta:true, __forecastTP:{conferido:true}, __eventosTPAtuais:events});
function portal(rows, events = [], today = '2026-11-11') {
  const element = () => ({style:{}, classList:{add(){},remove(){}}, appendChild(){},addEventListener(){}});
  const w = {dadosGlobais:rows, MAPA_SAIDA_CACHE:map(events),
    PG_MAPA_TP_CARGA_CONCLUIDA:true, console:{info(){},warn(){},error(){}},
    arredondar:v=>Math.round(Number(v)||0), formatarBR:String,
    setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},
    performance:{now:()=>0}, addEventListener(){}, dispatchEvent(){}, Event:class{},
    document:{getElementById:id=>id==='filtroReferencia'?{value:'replan'}:null,
      querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:element,
      body:element(),head:element()}};
  w.window = w;
  vm.createContext(w);
  for (const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html']) {
    const html = fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script,w,{filename:name});
  }
  const setToday = iso => vm.runInContext(`dtHojeISO='${iso}';dtHoje=new Date('${iso}T12:00:00');`,w);
  setToday(today);
  return {w,setToday};
}
const pairs = events => Array.from(events,e=>[e.data,e.volume]);

test('ajustes de quantidade e datas no mesmo objeto atualizam coleta, entrega e cortes históricos', () => {
  const r = row(), {w} = portal([r],[movement(r)]);
  const before = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(before.coleta,200);
  assert.equal(before.entrega,200);
  r['TIRAGEM COLETADA'] = 250;
  r.Coleta_TP = '2026-11-06';
  r.Entrega_TP = '2026-11-09';
  const after = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(after.bruto,250);
  assert.equal(after.coletaTP,'2026-11-06');
  assert.equal(after.entregaTP,'2026-11-09');
  assert.deepEqual(pairs(after.eventosColetaTP),[['2026-11-01',100],['2026-11-06',150]]);
  assert.deepEqual(pairs(after.eventosEntregaTP),[['2026-11-03',100],['2026-11-09',150]]);
  assert.equal(w.pgVolumesColetaUnificadosV37(r,'2026-11-05').coleta,100);
  assert.equal(w.pgVolumesColetaUnificadosV37(r,'2026-11-08').entrega,100);
  assert.equal(w.getVolFase(r,{id:'col_tp'},200),250);
  assert.equal(w.getVolFase(r,{id:'ent_tp'},200),250);
  const repeated = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(repeated.eventosColetaTP,after.eventosColetaTP,'o motor reaproveita parcelas sem nova mudança');
  assert.equal(repeated.eventosEntregaTP,after.eventosEntregaTP);
});

test('zerar tiragem elimina realizado; apagar data manual preserva somente as parcelas confirmadas no mapa', () => {
  const r = row(), {w} = portal([r],[movement(r)]);
  w.pgVolumesColetaUnificadosV37(r);
  r['TIRAGEM COLETADA'] = 0;
  let v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.bruto,0);assert.equal(v.mapa,0);assert.equal(v.coleta,0);assert.equal(v.entrega,0);
  r['TIRAGEM COLETADA'] = 200;
  r.Coleta_TP = '';
  v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.coletaTP,null);assert.equal(v.coleta,100);assert.equal(v.entrega,200);
  r.Entrega_TP = '';
  v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.entregaTP,null);assert.equal(v.entrega,100);
  r.Coleta_TP = '2026-11-05';
  r.Entrega_TP = '2026-11-08';
  assert.equal(w.pgVolumesColetaUnificadosV37(r).entrega,200);
});

test('trocar o mapa após editar a mesma linha usa os valores PCP atuais', () => {
  const r = row(), {w} = portal([r],[movement(r)]);
  const before = w.pgVolumesColetaUnificadosV37(r);
  r['TIRAGEM COLETADA'] = 260;
  r.Coleta_TP = '2026-11-06';r.Entrega_TP = '2026-11-09';
  w.MAPA_SAIDA_CACHE = map([movement(r,{volumeColetado:120})]);
  const after = w.pgVolumesColetaUnificadosV37(r);
  assert.notEqual(after.eventosColetaTP,before.eventosColetaTP);
  assert.deepEqual(pairs(after.eventosColetaTP),[['2026-11-01',120],['2026-11-06',140]]);
  assert.deepEqual(pairs(after.eventosEntregaTP),[['2026-11-03',120],['2026-11-09',140]]);
});

test('mudanças de identidade e Forecast não ficam escondidas pelo cache compartilhado', () => {
  const r = row(), {w} = portal([r],[movement(r)]);
  const before = w.pgVolumesColetaUnificadosV37(r);
  r._PG_TP_FORECAST = true;
  let v = w.pgVolumesColetaUnificadosV37(r);
  assert.deepEqual(pairs(v.eventosColetaTP),[['2026-11-05',200]]);
  assert.equal(v.eventosColetaTP.conciliacao.motivo,'forecast-soberano');
  delete r._PG_TP_FORECAST;
  assert.deepEqual(pairs(w.pgVolumesColetaUnificadosV37(r).eventosColetaTP),pairs(before.eventosColetaTP));
  r.SKU_REAL = 'OUTRO-SKU';r.SKU = 'OUTRO-SKU';
  v = w.pgVolumesColetaUnificadosV37(r);
  assert.deepEqual(pairs(v.eventosColetaTP),[['2026-11-05',200]]);
  assert.deepEqual(pairs(v.eventosEntregaTP),[['2026-11-08',200]]);
  assert.equal(v.eventosColetaTP.conciliacao.motivo,'realizado-sem-parcelas');
});

test('DG e total BA alterados na mesma linha revalidam ano e correção 2x', () => {
  const r = row({DT_ENTREGA_DG:'2026-11-02'});
  const {w} = portal([r],[movement(r,{volumeColetado:200,coletaTP:'2025-11-01',entregaTP:'2025-11-03'})]);
  assert.deepEqual(pairs(w.pgVolumesColetaUnificadosV37(r).eventosEntregaTP),[['2026-11-02',200]]);
  r.DT_ENTREGA_DG = '2026-11-04';
  assert.deepEqual(pairs(w.pgVolumesColetaUnificadosV37(r).eventosEntregaTP),[['2026-11-04',200]]);
  r.GIRO_TOTAL_BA = 100;
  const v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.eventosEntregaTP.conciliacao.fatorDuplicidade,0.5);
  assert.deepEqual(pairs(v.eventosEntregaTP),[['2026-11-04',100],['2026-11-08',100]]);
});

test('tiragem agendada e data EB atuais respeitam agenda soberana do Forecast', () => {
  const r = row({_PG_TP_FORECAST:true,'TIRAGEM AGENDADA':50,Mapa_Agendado:'2026-11-12'});
  const {w} = portal([r]);
  let v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.mapa,250);assert.equal(v.agendado,50);
  r['TIRAGEM AGENDADA'] = 80;r.Mapa_Agendado = '2026-11-13';
  v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.agendadaPCP,80);assert.equal(v.mapaAgendado,'2026-11-13');
  assert.equal(v.mapa,280);assert.deepEqual(pairs(v.eventosAgendados),[['2026-11-13',80]]);
  r['TIRAGEM AGENDADA'] = 0;r.Mapa_Agendado = '';
  v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.agendado,0);assert.equal(v.mapaAgendado,null);assert.equal(v.mapa,200);
});

test('virada do dia reavalia parcelas realizadas e agenda sem trocar a linha ou o mapa', () => {
  const r = row({Coleta_TP:'2026-11-11',Entrega_TP:'2026-11-11'});
  const {w,setToday} = portal([r],[movement(r,{coletaTP:'2026-11-10',entregaTP:'2026-11-10'})],'2026-11-09');
  assert.equal(w.pgVolumesColetaUnificadosV37(r).coleta,0);
  setToday('2026-11-11');
  const v = w.pgVolumesColetaUnificadosV37(r);
  assert.equal(v.coleta,200);assert.equal(v.entrega,200);
  assert.deepEqual(pairs(v.eventosEntregaTP),[['2026-11-10',100],['2026-11-11',100]]);
  const agenda = row({'TIRAGEM COLETADA':0,'TIRAGEM AGENDADA':100,Mapa_Agendado:'2026-11-12'});
  const p = portal([agenda],[movement(agenda,{volumeColetado:0,dataAgendada:'2026-11-12'})]);
  assert.equal(p.w.pgVolumesColetaUnificadosV37(agenda).agendado,100);
  p.setToday('2026-11-13');
  assert.equal(p.w.pgVolumesColetaUnificadosV37(agenda).agendado,0);
});

test('atualizar a primeira linha não atribui a agenda à duplicata da mesma chave', () => {
  const first = row({'TIRAGEM COLETADA':0,'TIRAGEM AGENDADA':100});
  const duplicate = {...first,_PG_TP_LINHA:3,_ROW_ID:'PCP:3'};
  const {w} = portal([first,duplicate],[movement(first,{volumeColetado:0,dataAgendada:'2026-11-12'})]);
  assert.equal(w.pgVolumesColetaUnificadosV37(first).agendado,100);
  assert.equal(w.pgVolumesColetaUnificadosV37(duplicate).agendado,0);
  first['TIRAGEM AGENDADA'] = 0;
  assert.equal(w.pgVolumesColetaUnificadosV37(first).agendado,0);
  assert.equal(w.pgVolumesColetaUnificadosV37(duplicate).agendado,0);
});
