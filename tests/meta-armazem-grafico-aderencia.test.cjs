const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','abaMetaArmazem.html'),'utf8');
const match=source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
if(!match)throw new Error('Script Meta Armazém indisponível');
function engine(corte){
  const w={};
  vm.runInNewContext(match[1],{window:w,document:{},console,dtHojeISO:corte});
  return w;
}
const linha=(date,total,real,previsto)=>({metaAplicada:date,total,real,previsto});

test('gráfico usa só realizado das metas vencidas e previsão dos marcos futuros',()=>{
  const w=engine('2026-10-17');
  const dados=[
    linha('2026-10-15',100,70,99),linha('2026-10-16',100,90,100),
    linha('2026-10-25',100,20,85),linha('2026-11-10',200,40,170)
  ];
  const v=w.pgMAModeloGraficoAderencia(dados,'2026-10-17');
  assert.deepEqual(Array.from(v,x=>[x.data,x.passada,x.total,x.aderente]),[
    ['2026-10-15',true,100,70],['2026-10-16',true,200,160],
    ['2026-10-25',false,300,245],['2026-11-10',false,500,415]
  ]);
  assert.equal(v[1].pct,80);
  assert.equal(v[3].pct,83);
});

test('gráfico divide ponderando pelas tiragens e muda a fronteira quando vira o dia',()=>{
  const w=engine('2026-10-17');
  const rows=[linha('2026-10-16',100,40,100),linha('2026-10-16',300,120,300),linha('2026-10-17',100,10,80)];
  const v=w.pgMAModeloGraficoAderencia(rows,'2026-10-17');
  assert.equal(v[0].pct,40,'não usa média simples nem plano vencido');
  assert.equal(v[1].pct,48);
  assert.deepEqual(Array.from(v,x=>x.passada),[true,false]);
  const fechado=w.pgMAModeloGraficoAderencia(rows,'2026-10-18');
  assert.deepEqual(Array.from(fechado,x=>x.passada),[true,true]);
  assert.equal(fechado[1].pct,34,'após o prazo usa realizado e não previsão');
});

test('sem dupla contagem entre marcas, sem alteração do denominador e data inválida ignorada',()=>{
  const w=engine('2026-10-17');
  const v=w.pgMAModeloGraficoAderencia([
    linha('2026-10-15',100,130,140),linha('2026-10-15',100,0,0),
    linha('invalida',1000,1000,1000)
  ],'2026-10-17');
  assert.equal(v.length,1);
  assert.equal(v[0].total,200);
  assert.equal(v[0].aderente,100,'excedente não compensa saldo do outro item');
});

test('gráfico e PNG estão isolados das funções de cálculo e usam SVG completo em 3x',()=>{
  assert.match(source,/id="maGraficoAderencia"/);
  assert.match(source,/window\.pgMACapturarGrafico=function\(\)/);
  assert.match(source,/new XMLSerializer\(\)\.serializeToString\(svg\)/);
  assert.match(source,/var canvas=document\.createElement\('canvas'\),escala=3;/);
  assert.match(source,/desenharGraficoAderencia\(items\);/);
  assert.match(source,/fill="#eaf3fc"/);
  assert.match(source,/fill="#f1f3f5"/);
});

test('rótulos do gráfico são inteiros e as porcentagens calculadas preservam as casas decimais',()=>{
  assert.match(source,/var pctTexto=function\(v\)\{return Math\.round\(v\)\+'%';\};/);
  const w=engine('2026-10-17');
  const pontos=w.pgMAModeloGraficoAderencia([
    linha('2026-10-15',1000,795,900),
    linha('2026-10-20',1000,800,843)
  ],'2026-10-17');
  assert.equal(pontos[0].pct,79.5);
  assert.equal(pontos[1].pct,81.9);
  assert.equal(Math.round(pontos[0].pct),80);
  assert.equal(Math.round(pontos[1].pct),82);
  assert.match(source,/Aderência às metas armazém/);
});

test('legendas Realizado e Projeção conservam a série acumulada',()=>{
  assert.ok(source.includes('>Realizado</text>'));
  assert.ok(source.includes('>Projeção</text>'));
  assert.doesNotMatch(source,/Metas já encerradas|Metas de hoje e futuras/);
  const w=engine('2026-10-17');
  const p=w.pgMAModeloGraficoAderencia([
    linha('2026-10-15',100,60,100),
    linha('2026-11-20',100,0,100)
  ],'2026-10-17');
  assert.equal(p[0].pct,60);
  assert.equal(p[1].pct,80);
});

test('auditorias não exibem Série original e usam dados já existentes de personalização',()=>{
  assert.doesNotMatch(source,/'Série original'/);
  assert.match(source,/l\.CAPA_PERSONALIZADA/);
  assert.match(source,/l\.CLIENTE_PERSONALIZADO/);
  const colunas=[...source.match(/var cabecalho=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  assert.equal(colunas.filter(c=>c==='Personalização').length,1);
});
