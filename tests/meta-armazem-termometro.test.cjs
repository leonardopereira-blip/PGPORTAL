const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','abaMetaArmazem.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
if(!script)throw new Error('Motor de Meta Armazém não encontrado');
const inicio='Coleta/Internalização de estoque inicial (re) plan';
const fim='Coleta/Internalização de estoque final (re) plan';

function portal(hoje){
  const w={
    pgLinhasUnicas:linhas=>linhas,
    pgUnirTotalSemDuplicidade:linhas=>linhas,
    pgMAPrepararLinhas:linhas=>linhas,
    pgEhFonteAcabadora:()=>false,
    pgSolicitacaoCancelada:()=>false,
    pgNormalizarDataColeta:v=>v||'',
    pgCampoColeta:(linha,campo)=>linha[campo],
    pgDataPlanoEntregaSLA:(_linha,data)=>data,
    pgDiasSLALinha:()=>0,
    filtrosGeraisIniciados:true,aplicarFiltros(){}
  };
  w.pgVolumesColetaUnificadosV37=(linha,corte)=>{
    const eventos=(linha.eventos||[]).filter(e=>e.data<=corte);
    return {entrega:eventos.reduce((sum,e)=>sum+e.volume,0),
      eventosEntregaTP:eventos,coleta:0,eventosColetaTP:[]};
  };
  vm.runInNewContext(script,{window:w,document:{},console,dtHojeISO:hoje});
  return {w,itens:(linhas,opcoes={})=>Array.from(w.pgMAObterItens({base:linhas,...opcoes}))};
}
function linha(dataFim,eventos=[],extra={}){
  return {MARCA_FINAL:'SAS',UNIDADE:'SAS',GRAFICA_FINAL:'LOGPRINT',
    CD_FINAL:'CD JDI',_SOURCE:'PCP',TIRAGEM:100,'SÉRIE':'9º ANO',
    [inicio]:'',[fim]:dataFim,eventos,...extra};
}
const data16={MARCA_FINAL:'EI',UNIDADE:'EI',GRAFICA_FINAL:'LEOGRAF'};

test('15/10 fecha só no realizado a partir de 16/10 e uma entrega tardia não reabre a meta',()=>{
  const app=portal('2026-10-16');
  const pedido=linha('2026-10-15',[{data:'2026-10-14',volume:70}]);
  const atual=app.itens([pedido])[0];
  assert.equal(atual.total,100);
  assert.equal(atual.previsto,70);
  assert.equal(atual.real,70);
  assert.equal(atual.pos,30);
  assert.equal(atual.realCD,70);
  assert.equal(atual.corteEventos,'2026-10-16');
  assert.equal(app.itens([pedido],{corte:'2026-10-15'})[0].previsto,100,
    'na data da meta ainda pode considerar o saldo previsto para aquele dia');
  const tardio=portal('2026-10-20').itens([linha('2026-10-15',[
    {data:'2026-10-14',volume:50},{data:'2026-10-18',volume:20}])])[0];
  assert.equal(tardio.previsto,50);
  assert.equal(tardio.real,50);
  assert.equal(tardio.realCD,70,'entrega atrasada segue no quadro de Entregas');
  assert.equal(tardio.pos,50);
});

test('meta de hoje mantém previsão de hoje, mas descarta planejamentos vencidos',()=>{
  const app=portal('2026-10-16');
  const valido=app.itens([linha('2026-10-16',[{data:'2026-10-15',volume:40}],data16)])[0];
  assert.equal(valido.previsto,100);
  assert.equal(valido.real,40);
  const vencido=app.itens([linha('2026-10-15',[{data:'2026-10-14',volume:30}],data16)])[0];
  assert.equal(vencido.previsto,30);
  assert.equal(vencido.pos,70);
});

test('rateio da meta usa só dias vigentes, sem mudar parcelas brutas compartilhadas',()=>{
  const app=portal('2026-10-16');
  const row=linha('2026-10-16',[{data:'2026-10-15',volume:20}],{
    ...data16,[inicio]:'2026-10-14'
  });
  const item=app.itens([row])[0];
  assert.ok(Math.abs(item.previsto-(20+80/3))<1e-8);
  assert.ok(Math.abs(item.pos-(80-80/3))<1e-8);
  assert.equal(item.rateio.dias,3);
  const eventos=Array.from(app.w.pgMADiasEntrega(item));
  assert.deepEqual(eventos.map(e=>e.data),
    ['2026-10-15','2026-10-14','2026-10-15','2026-10-16'],
    'API de parcelas é compartilhada com a eficiência e não muda');
  assert.equal(eventos[0].realizado,true);
  assert.equal(eventos[1].realizado,undefined);
});

test('meta futura não aceita planejamento vencido; acordo Posi permanece independente',()=>{
  const app=portal('2026-10-16');
  const ways={MARCA_FINAL:'WAYS',UNIDADE:'WAYS'};
  assert.equal(app.itens([linha('2026-10-15',[],ways)])[0].previsto,0);
  assert.equal(app.itens([linha('2026-10-20',[],ways)])[0].previsto,100);
  const spe=linha('2026-10-20',[],{
    MARCA_FINAL:'SPE',UNIDADE:'SPE',GRAFICA_FINAL:'POSIGRAF',
    CD_FINAL:'POSIGRAF',SEGMENTO:'ENSINO MEDIO','SÉRIE':'1ª SÉRIE'
  });
  assert.equal(app.itens([spe])[0].previsto,100,'acordo SPE Ensino Médio 12/11');
  app.w.pgMACenario('sem');
  assert.equal(app.itens([spe])[0].previsto,0,'meta original de 15/10 já fechou');
});

test('sem previsão permanece sem data e não é transformada em realizado',()=>{
  const item=portal('2026-10-16').itens([linha('')])[0];
  assert.equal(item.previsto,0);
  assert.equal(item.real,0);
  assert.equal(item.semData,100);
  assert.equal(item.pos,0);
});