const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const global=fs.readFileSync(path.join(root,'Scripts_Globais_2.html'),'utf8');
const engine=fs.readFileSync(path.join(root,'Scripts_Resultados_Analistas.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'abaResultadosAnalistas.html'),'utf8');
const script=(str)=>[...str.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
function portal(email){
 const w={PG_USER_EMAIL:email};
 const pessoas=global.slice(global.indexOf('    const PG_PESSOAS ='),global.indexOf('    function pgPessoasDoTime('));
 const auth=global.slice(global.indexOf('    function pgEmailAtual()'),global.indexOf('    function pgSelect('));
 assert.ok(pessoas&&auth&&script(engine));
 new Function('window','document',pessoas+'\n'+auth)(w,{getElementById:()=>null});
 vm.runInNewContext(script(engine),{window:w,Date,dtHojeISO:'2026-11-16'});
 return w;
}
const itens=[
 {grafica:'OCEANO',marca:'SAS',total:100,linha:{SKU_REAL:'A'},metaAplicada:'2026-11-10',eventosColeta:[{data:'2026-11-10',volume:100}]},
 {grafica:'POSIGRAF',marca:'SAE',total:200,linha:{SKU_REAL:'B'},metaAplicada:'2026-11-10',eventosColeta:[{data:'2026-11-10',volume:200}]},
 {grafica:'FORMA CERTA',marca:'COC',total:300,linha:{SKU_REAL:'C'},metaAplicada:'2026-11-10',eventosColeta:[{data:'2026-11-10',volume:300}]}
];
const opts={corte:'2026-11-16',etapa:'coleta',destino:'cd'};
test('analista só enxerga a própria carteira em totais, ranking, detalhe e marca',()=>{
 const w=portal('matheus.vasconcelos@arcoeducacao.com.br');
 const r=JSON.parse(JSON.stringify(w.pgRAApurar(itens,opts)));
 assert.equal(r.resumo.total,100);
 assert.equal(r.analistas.length,1);
 assert.equal(r.detalhes.length,1);
 assert.equal(r.graficasMarcas.length,1);
 assert.equal(r.detalhes[0].grafica,'OCEANO');
 assert.equal(r.detalhes[0].analista,'Matheus');
});
test('trocar filtros próprios ou informar nome de colega não amplia o acesso',()=>{
 const w=portal('matheus.vasconcelos@arcoeducacao.com.br');
 for(const op of [{...opts,analista:'João Alberti',time:'CAMILA'}, {...opts,analista:'',time:''}]){
  const r=w.pgRAApurar(itens,op);
  assert.equal(r.resumo.total,100);
  assert.equal(r.analistas[0].analista,'Matheus');
 }
});
test('cada analista recebe sua carteira pelo cadastro já usado no filtro geral',()=>{
 const r=portal('joao.alberti@arcoeducacao.com.br').pgRAApurar(itens,opts);
 assert.equal(r.resumo.total,200);
 assert.equal(r.analistas[0].analista,'João Alberti');
});
test('liderança e gestores continuam visualizando todos os analistas',()=>{
 for(const email of ['leonardo.pereira@arcoeducacao.com.br','jaqueline.melo@arcoeducacao.com.br']){
  const r=portal(email).pgRAApurar(itens,opts);
  assert.equal(r.resumo.total,600);
  assert.equal(r.analistas.length,3);
 }
});
test('sem login cadastrado o resultado nominal permanece bloqueado',()=>{
 for(const email of ['', 'externo@example.com']){
  const r=portal(email).pgRAApurar(itens,opts);
  assert.equal(r.resumo.total,0);
  assert.equal(r.detalhes.length,0);
  assert.equal(r.analistas.length,0);
 }
});
test('interface limita seletores, ranking e exportações sem alterar outras abas',()=>{
 assert.match(ui,/el\('raTime'\)\.parentNode\.hidden=propria/);
 assert.match(ui,/el\('raAnalista'\)\.parentNode\.hidden=propria/);
 assert.match(ui,/if\(!resultadoAutorizado\(\)\)throw new Error/);
 assert.match(ui,/window\.pgRABaixarImagem=function\(botao\)\{\s*if\(!resultadoAutorizado\(\)\)/);
 assert.match(global,/window\.pgRAEscopoUsuario = function/);
 // Não altera a função/definição dos filtros gerais das outras abas.
 assert.match(global,/window\.pgCompilarFiltrosExtras = function/);
 assert.match(global,/window\.pgResponsavelGraficaGiro = function/);
});
