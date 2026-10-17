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
    pgNormalizarDataColeta:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:'',
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

test('entrega completa antes ou na meta de 15/10 conta dentro com replan anterior, tardio, ausente ou invalido',()=>{
  const app=portal('2026-10-20');
  for(const entrega of ['2026-10-14','2026-10-15']){
    for(const replan of ['2026-10-05','2026-10-30','','data invalida']){
      const pedido=linha(replan,[{data:entrega,volume:100}]);
      const item=app.itens([pedido],{corte:'2026-10-20'})[0];
      const caso=entrega+' / '+(replan||'sem replan');
      assert.equal(item.metaAplicada,'2026-10-15',caso);
      assert.equal(item.real,100,caso);
      assert.equal(item.realCD,100,caso);
      assert.equal(item.previsto,100,caso);
      assert.equal(item.pos,0,caso);
      assert.equal(item.semData,0,caso);
      assert.equal(item.pendentePlanejado,0,caso);
      assert.equal(item.eventosReal.length,1,caso);
      assert.equal(item.eventosReal[0].data,entrega,caso);
      assert.equal(pedido[fim],replan,'A origem permanece intacta: '+caso);
      if(replan===''||replan==='data invalida')assert.equal(item.replanValido,false,caso);
    }
  }
});

test('parcelas realizadas seguem a meta de 15/10 e o saldo parcial nao vira entrega fora da meta',()=>{
  const app=portal('2026-10-20');
  const parcelas=[{data:'2026-10-14',volume:30},{data:'2026-10-15',volume:40},
    {data:'2026-10-16',volume:30}];
  const completo=app.itens([linha('2026-10-30',parcelas)],{corte:'2026-10-20'})[0];
  assert.equal(completo.metaAplicada,'2026-10-15');
  assert.equal(completo.real,70);
  assert.equal(completo.realCD,100);
  assert.equal(completo.previsto,70);
  assert.equal(completo.pos,30);
  assert.equal(completo.realCD-completo.real,30,'Somente a parcela de 16/10 foi entregue fora');
  const parcial=app.itens([linha('2026-10-30',[{data:'2026-10-14',volume:40}])],
    {corte:'2026-10-20'})[0];
  assert.equal(parcial.real,40);
  assert.equal(parcial.realCD,40);
  assert.equal(parcial.previsto,40);
  assert.equal(parcial.pos,60,'Fora na previsao corresponde ao saldo ainda nao entregue');
  assert.equal(parcial.pendentePlanejado,60);
  assert.equal(parcial.realCD-parcial.real,0,'Nao existe entrega realizada fora da meta');
});

test('CQT EI com marco de 16/10 classifica parcelas reais no limite e conserva teto, excedente e saldo de outro SKU',()=>{
  const app=portal('2026-10-20');
  const cqt={MARCA_FINAL:'CQT',UNIDADE:'CQT',GRAFICA_FINAL:'POSIGRAF',
    CD_FINAL:'POSIGRAF',SEGMENTO:'ENSINO INFANTIL','SÉRIE':'INF 3 ANOS',TIPO:'ALUNO'};
  const parcelas=[{data:'2026-10-15',volume:30},{data:'2026-10-16',volume:40},
    {data:'2026-10-17',volume:50}];
  const pedido=linha('2026-10-16',parcelas,{...cqt,SKU:'ENTREGUE'});
  const pendente=linha('2026-10-16',[],{...cqt,SKU:'PENDENTE'});
  const itens=app.itens([pedido,pendente],{cenario:'com',corte:'2026-10-20'});
  const item=itens[0];
  assert.equal(item.metaAplicada,'2026-10-16');
  assert.equal(item.real,70,'15/10 e 16/10 contam dentro do marco aplicado');
  assert.equal(item.realCD,100);
  assert.equal(item.previsto,70);
  assert.equal(item.pos,30);
  assert.equal(item.pendentePlanejado,0);
  assert.equal(item.entregueBruto,120);
  assert.equal(item.excedenteEntrega,20);
  assert.deepEqual(Array.from(item.eventosReal,e=>[e.data,e.volume]),
    [['2026-10-15',30],['2026-10-16',40],['2026-10-17',30]]);
  assert.deepEqual(parcelas,[{data:'2026-10-15',volume:30},{data:'2026-10-16',volume:40},
    {data:'2026-10-17',volume:50}],'Parcelas de origem nao sao alteradas pelo teto');
  assert.equal(itens.reduce((s,i)=>s+i.total,0),200);
  assert.equal(itens.reduce((s,i)=>s+i.realCD,0),100);
  assert.equal(itens.reduce((s,i)=>s+i.previsto,0),70);
  assert.equal(itens.reduce((s,i)=>s+i.pos,0),130,'Excedente nao cobre o SKU pendente');
  const noMarco=app.itens([pedido],{cenario:'com',corte:'2026-10-16'})[0];
  assert.equal(noMarco.metaAplicada,'2026-10-16');
  assert.equal(noMarco.real,70);
  assert.equal(noMarco.realCD,70,'Parcela de 17/10 nao entra no corte de 16/10');
  assert.equal(noMarco.excedenteEntrega,0);
});

test('SPE EF2 Aluno com marco de 12/10 preserva realizado ate o piso de 15/10 e deixa parcela posterior fora',()=>{
  const app=portal('2026-10-20');
  const spe={MARCA_FINAL:'SPE',UNIDADE:'SPE',GRAFICA_FINAL:'POSIGRAF',
    CD_FINAL:'POSIGRAF',SEGMENTO:'ENSINO FUNDAMENTAL 2','SÉRIE':'6º ANO',TIPO:'ALUNO'};
  const parcelas=[{data:'2026-10-14',volume:30},{data:'2026-10-15',volume:40},
    {data:'2026-10-16',volume:30}];
  const pedido=linha('2026-10-12',parcelas,spe);
  const item=app.itens([pedido],{cenario:'com',corte:'2026-10-20'})[0];
  assert.equal(item.metaAplicada,'2026-10-15');
  assert.equal(item.real,70,'A entrega no dia 15/10 continua dentro mesmo com replan em 12/10');
  assert.equal(item.realCD,100);
  assert.equal(item.previsto,70);
  assert.equal(item.pos,30);
  assert.equal(item.semData,0);
  assert.equal(item.excedenteEntrega,0);
  assert.deepEqual(Array.from(item.eventosReal,e=>[e.data,e.volume]),
    [['2026-10-14',30],['2026-10-15',40],['2026-10-16',30]]);
  const noPrazo=app.itens([pedido],{cenario:'com',corte:'2026-10-15'})[0];
  assert.equal(noPrazo.real,70);
  assert.equal(noPrazo.realCD,70);
  assert.equal(noPrazo.realCD-noPrazo.real,0);
  assert.equal(pedido[fim],'2026-10-12');
});
