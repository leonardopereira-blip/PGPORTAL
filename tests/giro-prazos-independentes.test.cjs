const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fonte=fs.readFileSync(path.join(__dirname,'..','Scripts_Globais_2.html'),'utf8');
const inicio=fonte.indexOf('window.pgGiroSaldoPrazosV41 = function(');
const fim=fonte.indexOf('\n};',inicio)+3;
assert(inicio>=0&&fim>inicio);
const trecho=fonte.slice(inicio,fim);
const hoje='2026-10-28';
function calcular(linha) {
 const window={
   PG_ECD_PREVISOES:{K:{dataEntrega:'2026-11-15'}},
   pgEntregasCDModelo:{chave:()=> 'K'},
   pgPrazoLinhaV35:l=>l.p,
   pgCampoColeta:(l,n)=>l[n]??'',
   pgCampoPrazoV35:(l,n)=>l[n]??'',
   pgNumeroPrazoV35:v=>Number(v)||0
 };
 vm.runInNewContext(trecho,{window,Date});
 return window.pgGiroSaldoPrazosV41(linha,hoje);
}
test('nova data altera previsão de entrega, nunca a etapa nem os dias de atraso do Giro',()=>{
 const l={'TIRAGEM TOTAL':100,'TIRAGEM VENCIDA':100,
   p:{vencida:100,aVencer:0,dtVencida:'2026-10-20',coletadaBruta:30,dtColeta:'2026-10-21'}};
 const r=calcular(l);
 assert.equal(r.totalPendente,70);
 assert.equal(r.eventos[0].data,'2026-10-20','mantém o prazo original');
 assert.equal(r.eventos[0].dias,8,'data manual futura não zera atraso');
});
test('excedente do SKU é limitado a 100%, sem abater outro SKU',()=>{
 const a=calcular({'TIRAGEM TOTAL':100,p:{vencida:100,aVencer:0,dtVencida:'2026-10-20',
   coletadaBruta:150,dtColeta:'2026-10-21'}});
 const b=calcular({'TIRAGEM TOTAL':200,p:{vencida:200,aVencer:0,dtVencida:'2026-10-20',
   coletadaBruta:20,dtColeta:'2026-10-21'}});
 assert.equal(a.totalPendente,0);
 assert.equal(b.totalPendente,180);
});
