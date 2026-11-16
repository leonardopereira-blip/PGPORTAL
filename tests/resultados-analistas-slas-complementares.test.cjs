const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const global=fs.readFileSync(path.join(root,'Scripts_Globais_2.html'),'utf8');
const html=fs.readFileSync(path.join(root,'Scripts_Resultados_Analistas.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script,'Apuração por analista encontrada');
const inicio=global.indexOf('window.pgDiasSLALinha =');
const fim=global.indexOf('// Fonte única para Mapa Solicitado',inicio);
assert.ok(inicio>=0&&fim>inicio,'Motor SLA oficial encontrado');
const slasOficiais=global.slice(inicio,fim);
const rotas=[
  ['FORMA CERTA','ANTILHAS',0],['IMOS','ANTILHAS',0],['IPSIS','ANTILHAS',0],
  ['LOGPRINT','EMBALARTE',0],['MAXI','ANTILHAS',1],['META','ANTILHAS',0],
  ['PIFFER','ANTILHAS',0],['POSIGRAF','ANTILHAS',1],['RONA','ANTILHAS',0],
  ['SÃO FRANCISCO','HR',0],['WALPRINT','ANTILHAS',2],['WALPRINT','HR',2]
];
function avaliar(origem,destino,matriz,dataColeta='2026-11-11') {
  const w={PG_MATRIZ_SLA:matriz,pgCampoColeta:(l,n)=>l[n],
    pgNormalizarDataColeta:v=>v,
    pgResponsavelGraficaGiro:()=>({analista:'Teste',time:'Teste'})};
  new Function('window',slasOficiais)(w);
  vm.runInNewContext(script,{window:w,Date,dtHojeISO:'2026-11-16'});
  const l={GRAFICA_FINAL:origem,CD_MAPA:destino,CD_FINAL:'CD JDI',
    'CD DESTINO':'CD JDI',SKU_REAL:'SKU-A',KIT:'K1',UNIDADE:'SAS',
    'META DE ENTREGA NO CD':'2026-11-16'};
  const item={linha:l,total:100,marca:'SAS',grafica:origem,fluxo:'acabadora',
    trajeto:'entrada',metaAplicada:'2026-11-16',
    eventosColeta:[{data:dataColeta,volume:100}],
    conciliacao:{linhas:[l],diagnosticos:[]}};
  const r=w.pgRAApurar([item],{corte:'2026-11-16',etapa:'coleta_matriz',
    destino:'acabadora',trajeto:'entrada'});
  return {resumo:r.resumo,detalhe:r.detalhes[0]};
}
function chegada(iso,n) {
  const d=new Date(iso+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+n);
  if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}
for(const [origem,destino,dias] of rotas) {
  test('SLA complementar '+origem+' → '+destino+' = '+dias+' dia(s)',()=>{
    const r=avaliar(origem,destino,[['FORNECEDOR','CD JDI'],[origem,3]]);
    assert.equal(r.detalhe.parcelasColeta[0].projetada,chegada('2026-11-11',dias));
    assert.equal(r.resumo.naoApurado,0,'SLA conhecido não pode permanecer não conferido');
    assert.equal(r.resumo.entregue,100,'Volume físico deve permanecer');
  });
}
test('Matriz original prevalece mesmo que SLA complementar seja diferente',()=>{
  const r=avaliar('FORMA CERTA','ANTILHAS',
    [['FORNECEDOR','ANTILHAS'],['FORMA CERTA',4]]);
  assert.equal(r.detalhe.parcelasColeta[0].projetada,chegada('2026-11-11',4));
});
test('Rota não fornecida permanece sem SLA; não aplicar zero genérico',()=>{
  const r=avaliar('DESCONHECIDA','ANTILHAS',[['FORNECEDOR','CD JDI'],['DESCONHECIDA',2]]);
  assert.equal(r.detalhe.parcelasColeta[0].projetada,null);
  assert.equal(r.resumo.naoApurado,100);
});
test('Domingo continua ajustado para segunda em rota com SLA zero',()=>{
  const r=avaliar('FORMA CERTA','ANTILHAS',[['FORNECEDOR','CD JDI']], '2026-11-15');
  assert.equal(r.detalhe.parcelasColeta[0].projetada,'2026-11-16');
});
