const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz=path.join(__dirname,'..');
const global=fs.readFileSync(path.join(raiz,'Scripts_Globais_2.html'),'utf8');
const html=fs.readFileSync(path.join(raiz,'Scripts_Resultados_Analistas.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script,'Motor por analista');
function portal(matriz) {
  const w={
    pgCampoColeta:(l,n)=>l[n],
    pgNormalizarDataColeta:v=>v,
    PG_MATRIZ_SLA:matriz
  };
  const a=global.indexOf('window.pgDiasSLALinha =');
  const b=global.indexOf('// Fonte única para Mapa Solicitado',a);
  assert.ok(a>=0 && b>a,'SLA real do portal');
  new Function('window',global.slice(a,b))(w);
  vm.runInNewContext(script,{window:w,Date,dtHojeISO:'2026-11-16'});
  return w;
}
const linha=(meta)=>({
  _SOURCE:'PCP',GRAFICA_FINAL:'OCEANO',CD_MAPA:'FELK',
  CD_FINAL:'CD JDI','CD DESTINO':'CD JDI',
  SKU_REAL:'SKU-1',KIT:'K1',UNIDADE:'SAS',
  'META DE ENTREGA NO CD':meta
});
const item=(linhas,eventosColeta)=>({
  fluxo:'acabadora',trajeto:'entrada',grafica:'OCEANO',marca:'SAS',
  total:100,linha:linhas[0],conciliacao:{linhas,diagnosticos:[]},
  eventosColeta
});
function apurar(w,i,etapa='coleta_matriz') {
  return JSON.parse(JSON.stringify(w.pgRAApurar([i],
    {corte:'2026-11-16',destino:'acabadora',trajeto:'entrada',etapa})));
}
test('a maior META DE ENTREGA NO CD define o prazo do grupo, sem somar ou perder volume',()=>{
  const w=portal([['FORNECEDOR','FELK','CD JDI'],['OCEANO',2,7]]);
  const linhas=[linha('2026-10-15'),linha('2026-10-17'),linha('2026-10-16')];
  const anterior=JSON.stringify(linhas);
  const r=apurar(w,item(linhas,[{data:'2026-10-14',volume:100}]));
  assert.equal(r.detalhes[0].prazo,'2026-10-17');
  assert.equal(r.resumo.semPrazo,0);
  assert.equal(r.resumo.metaVencida,100);
  assert.equal(r.resumo.aderencia,100);
  assert.equal(r.resumo.entregue,100);
  assert.equal(r.detalhes[0].parcelasColeta[0].projetada,'2026-10-16');
  assert.equal(JSON.stringify(linhas),anterior,'a origem não foi alterada');
});
test('a rota de entrada usa CD_MAPA e não o CD final que tem outro SLA',()=>{
  const w=portal([['FORNECEDOR','FELK','CD JDI'],['OCEANO',2,7]]);
  const r=apurar(w,item([linha('2026-10-17')],[{data:'2026-10-14',volume:100}]));
  assert.equal(r.detalhes[0].parcelasColeta[0].projetada,'2026-10-16');
  assert.equal(r.resumo.noPrazoVencido,100);
});
test('SLA ausente mantém a meta válida e exibe diagnóstico único e compreensível',()=>{
  const w=portal([['FORNECEDOR','CD JDI'],['OCEANO',7]]);
  const r=apurar(w,item([linha('2026-10-15'),linha('2026-10-17')],
    [{data:'2026-10-14',volume:40},{data:'2026-10-15',volume:60}]));
  assert.equal(r.detalhes[0].prazo,'2026-10-17');
  assert.equal(r.resumo.semPrazo,0);
  assert.equal(r.resumo.naoApurado,100);
  assert.equal(r.resumo.aderencia,null);
  assert.equal(r.detalhes[0].diagnosticos.length,1,'não repetir o SLA para cada parcela');
  assert.match(r.detalhes[0].motivo,/OCEANO.*FELK/);
  assert.equal(r.resumo.entregue,100,'realizado conhecido não é apagado');
});
test('meta parcialmente ausente usa maior data válida sem confundir SLA com falta de meta',()=>{
  const w=portal([['FORNECEDOR','FELK'],['OCEANO',0]]);
  const r=apurar(w,item([linha(''),linha('2026-10-18')],
    [{data:'2026-10-16',volume:100}]),'coleta');
  assert.equal(r.detalhes[0].prazo,'2026-10-18');
  assert.equal(r.resumo.semPrazo,0);
  assert.match(r.detalhes[0].motivo,/1 linha/);
});
