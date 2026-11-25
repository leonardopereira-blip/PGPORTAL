const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const api=new Function(read('ChamadosModelo.js')+'\n'+read('ChamadosAcordos.js')+'\nreturn {pgChMailParse_,pgChMailSelect_,pgChAplicarAcordo_};')();
test('Logprint: datas relativas e prazo respondido',()=>{
 const a=api.pgChMailParse_('Para a data de "Data envio dos bonecos" Considere D-1 da Data de Aprovação\nPara a data de "Data planejada de entrada em máquina" Considere D+1 da Data Lib. Op e Papel\nData Arquivo 23/11\nData Aprovação 24/11\nData Lib. Op e Papel: 25/11\nPrazo Solicitado: 30/11\nPrazo Respondido: 30/11',Date.parse('2026-11-19'));
 assert.equal(a.proof,'2026-11-23');assert.equal(a.machine,'2026-11-26');assert.equal(a.pickup,'2026-11-30');
});
test('Apenas gráfica alocada, ACERVO e início de máquina separados de real',()=>{
 const formal=api.pgChMailParse_('Envio dos arquivos - ACERVO\nEnvio dos bonecos - ACERVO\nAprove dos bonecos - ACERVO\nData planejada de entrada em máquina - 14/11\nDisponibilização para coleta - 23/11',Date.parse('2026-11-04'));
 const a=api.pgChMailSelect_([{n:'3118',vendor:'REPROSET',kind:'request',at:1,thread:'a',dates:{file:'2026-11-05'}},{n:'3118',vendor:'REPROSET',kind:'formal',at:2,thread:'b',dates:formal},{n:'3118',vendor:'META',kind:'request',at:1,thread:'c',dates:{file:'2026-11-03'}}],new Map([['3118',new Set(['REPROSET'])]]));
 assert.deepEqual(Object.keys(a),['3118|REPROSET']);
 const it={printer:'REPROSET',stages:Array.from({length:12},()=>({p:'',r:''}))};api.pgChAplicarAcordo_(it,{n:'3118'},a);
 assert.equal(it.stages[0].agreedStatus,'ACERVO');assert.equal(it.stages[3].agreedStart,'2026-11-14');assert.equal(it.stages[3].r,'');assert.equal(it.stages[10].agreed,'2026-11-23');
});

test('Gmail: base64 sem padding, bytes e recuperação após limite de consultas',()=>{
 let attempts=0;const sleeps=[];
 const f=new Function('Utilities','UrlFetchApp','ScriptApp',read('ChamadosAcordos.js')+'\nreturn {decode:pgChMailDecode_,get:pgChMailGet_};')(
  {base64DecodeWebSafe:v=>Array.from(Buffer.from(v,'base64url')),sleep:v=>sleeps.push(v)},
  {fetch:()=>{const status=++attempts===1?429:200;return {getResponseCode:()=>status,getContentText:()=>status===429?'quota':'{"ok":true}'};}},
  {getOAuthToken:()=>'simulado'});
 assert.deepEqual(f.decode('YWJjZA'),[97,98,99,100]);
 assert.deepEqual(f.decode([65,255,128]),[65,-1,-128]);
 assert.deepEqual(f.get('threads/simulado',{deadline:Date.now()+60000}),{ok:true});
 assert.deepEqual(sleeps,[2000]);
});
