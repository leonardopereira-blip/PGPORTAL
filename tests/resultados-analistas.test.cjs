const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'Scripts_Resultados_Analistas.html'),'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script,'Motor da avaliação encontrado');
const BASELINE = 'COLETA/INTERNALIZAÇÃO FIM BASELINE';
const REPLAN = 'Coleta/Internalização de estoque final (re) plan';
const snapshot = v => JSON.parse(JSON.stringify(v));

function app() {
  const w = {
    pgCampoColeta:(l,n)=>l[n],
    pgNormalizarDataColeta:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) ? v : null,
    pgDataPlanoEntregaSLA:(l,coleta)=>{
      if (l.sla === null) return null;
      const d = new Date(coleta+'T12:00:00Z');
      d.setUTCDate(d.getUTCDate()+(l.sla||0));
      return d.toISOString().slice(0,10);
    }
  };
  // Usa o cadastro e o resolvedor reais do portal, sem replicar responsáveis.
  const global = fs.readFileSync(path.join(root,'Scripts_Globais_2.html'),'utf8');
  const trecho = (ini,fim) => global.slice(global.indexOf(ini),global.indexOf(fim,global.indexOf(ini)));
  new Function('window',[
    trecho('    const PG_PESSOAS =','    const PG_GESTORES ='),
    trecho('    function pgNorm(v)','    function pgEsc(v)'),
    trecho('    function pgCasaGrafica(','    function pgEmailAtual()')
  ].join('\n'))(w);
  vm.runInNewContext(script,{window:w,Date,dtHojeISO:'2026-11-13'});
  return (itens,opcoes={})=>snapshot(w.pgRAApurar(itens,{corte:'2026-11-13',...opcoes}));
}
function item(extra={}) {
  return {total:100,grafica:'LOGPRINT',marca:'SAS',serie:'1º ANO',metaAplicada:'2026-10-15',
    eventosReal:[],linha:{SKU_REAL:'SKU-1',KIT:'K1',DESCRIÇÃO:'Livro',
      [BASELINE]:'2026-10-10',[REPLAN]:'2026-10-20'},...extra};
}

test('aderência total e por analista é ponderada pela tiragem vencida, sem média de percentuais',()=>{
  const apurar=app();
  const resultado=apurar([
    item({total:100,eventosReal:[{data:'2026-10-10',volume:100}]}),
    item({total:900,grafica:'POSIGRAF',eventosReal:[{data:'2026-10-10',volume:90},{data:'2026-10-16',volume:810}]})
  ]);
  assert.equal(resultado.resumo.total,1000);
  assert.equal(resultado.resumo.entregue,1000);
  assert.equal(resultado.resumo.aderencia,19);
  assert.equal(resultado.resumo.analistas,2);
  assert.equal(resultado.analistas.find(a=>a.analista==='Amanda Costa').aderencia,100);
  assert.equal(resultado.analistas.find(a=>a.analista==='João Alberti').aderencia,10);
});

test('parcelas parciais usam sua data real, corte histórico e teto cronológico sem modificar a origem',()=>{
  const apurar=app();
  const pedido=item({eventosReal:[{data:'2026-10-16',volume:80},{data:'2026-10-14',volume:60},
    {data:'2026-10-20',volume:50},{data:'',volume:100},{data:'2026-10-13',volume:-5}]});
  const original=snapshot(pedido);
  const historico=apurar([pedido],{corte:'2026-10-15'}).resumo;
  assert.equal(historico.entregue,60);assert.equal(historico.noPrazo,60);
  assert.equal(historico.vencido,40);assert.equal(historico.aderencia,60);
  const atual=apurar([pedido]).resumo;
  assert.equal(atual.entregue,100);assert.equal(atual.noPrazo,60);assert.equal(atual.foraPrazo,40);
  assert.equal(atual.pendente,0);assert.equal(atual.aderencia,60);
  assert.deepEqual(pedido,original);
});

test('baseline e replan aplicam SLA e domingo; replan ausente não cai para baseline ou dtPlan',()=>{
  const apurar=app();
  const pedido=item({dtPlan:'2026-10-01',linha:{sla:1,[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-12'},
    eventosReal:[{data:'2026-10-12',volume:100}]});
  const baseline=apurar([pedido],{referencia:'baseline'}).detalhes[0];
  const replan=apurar([pedido],{referencia:'replan'}).detalhes[0];
  assert.equal(baseline.prazo,'2026-10-12','11/10 é domingo; aplica SLA antes do ajuste');
  assert.equal(baseline.noPrazo,100);assert.equal(replan.prazo,'2026-10-13');
  pedido.linha[REPLAN]='';
  const semReplan=apurar([pedido],{referencia:'replan'}).detalhes[0];
  assert.equal(semReplan.prazo,null);assert.equal(semReplan.semPrazo,100);
  assert.equal(semReplan.entregue,100);assert.equal(semReplan.noPrazo,0);assert.equal(semReplan.foraPrazo,0);
  assert.match(semReplan.motivo,/Replan ausente/);
});

test('ausência de SLA não cria prazo e SLA zero é válido',()=>{
  const apurar=app();
  const semSLA=item({linha:{sla:null,[BASELINE]:'2026-10-10'}});
  const zerado=item({linha:{sla:0,[BASELINE]:'2026-10-10'}});
  const resultado=apurar([semSLA,zerado],{referencia:'baseline'});
  assert.equal(resultado.detalhes[0].prazo,null);assert.match(resultado.detalhes[0].motivo,/SLA/);
  assert.equal(resultado.detalhes[1].prazo,'2026-10-10');
  assert.equal(resultado.resumo.semPrazo,100);assert.equal(resultado.resumo.metaVencida,100);
});

test('metas futuras não entram na nota; entregas antecipadas permanecem físicas e no prazo',()=>{
  const apurar=app();
  const futuro=item({metaAplicada:'2026-11-20',previsto:100,dtPlan:'2026-11-14',
    eventosReal:[{data:'2026-11-10',volume:30},{data:'2026-11-15',volume:70}]});
  const r=apurar([futuro]);
  assert.equal(r.resumo.entregue,30);assert.equal(r.resumo.noPrazo,30);
  assert.equal(r.resumo.metaVencida,0);assert.equal(r.resumo.noPrazoVencido,0);
  assert.equal(r.resumo.aderencia,null);assert.equal(r.resumo.aVencer,70);assert.equal(r.resumo.vencido,0);
  const vazio=apurar([]).resumo;
  assert.equal(vazio.total,0);assert.equal(vazio.aderencia,null);assert.equal(vazio.analistas,0);
});

test('sem meta mantém o realizado físico e destaca toda a tiragem sem prazo',()=>{
  const r=app()([item({metaAplicada:'',eventosReal:[{data:'2026-10-10',volume:40}]})]);
  assert.equal(r.resumo.entregue,40);assert.equal(r.resumo.pendente,60);
  assert.equal(r.resumo.semPrazo,100);assert.equal(r.resumo.vencido,0);assert.equal(r.resumo.aVencer,0);
  assert.equal(r.resumo.aderencia,null);assert.match(r.detalhes[0].motivo,/Meta armazém/);
});

test('prazo diferente em grupo sem KIT não usa a maior data para melhorar a nota',()=>{
  const apurar=app();
  const grupo=item({linha:{[BASELINE]:'2026-10-20',[REPLAN]:'2026-10-20'},conciliacao:{agrupado:true,linhas:[
    {[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-19',sla:0},
    {[BASELINE]:'2026-10-20',[REPLAN]:'2026-10-20',sla:0}
  ]},eventosReal:[{data:'2026-10-15',volume:100}]});
  for (const referencia of ['baseline','replan']) {
    const r=apurar([grupo],{referencia});
    assert.equal(r.detalhes[0].prazo,null);assert.match(r.detalhes[0].motivo,/Prazos divergentes/);
    assert.equal(r.resumo.semPrazo,100);assert.equal(r.resumo.aderencia,null);
  }
  grupo.conciliacao.linhas[1][BASELINE]='2026-10-10';
  assert.equal(apurar([grupo],{referencia:'baseline'}).resumo.aderencia,0);
  grupo.conciliacao.linhas[1][BASELINE]='';
  assert.match(apurar([grupo],{referencia:'baseline'}).detalhes[0].motivo,/ausente/);
});

test('resolvedor compartilhado, filtros e nomes sem responsável preservam a base auditável',()=>{
  const apurar=app();
  const itens=[item({grafica:'STAR7'}),item({grafica:'IPSIS'}),item({grafica:'MARGRAF'}),
    item({grafica:'<Fornecedor desconhecido & Cia>',linha:{SKU_REAL:'A<B',DESCRIÇÃO:'Texto & <teste>'}})];
  const r=apurar(itens);
  assert.equal(r.analistas.length,3);
  assert.deepEqual(r.analistas.find(a=>a.analista==='Klayton').graficas,['IPSIS','MARGRAF']);
  const sem=r.analistas.find(a=>a.semResponsavel);
  assert.equal(sem.analista,'Sem responsável');assert.equal(sem.time,'Não informado');
  assert.equal(r.detalhes[3].grafica,'<Fornecedor desconhecido & Cia>');
  assert.equal(r.detalhes[3].descricao,'Texto & <teste>','modelo retorna texto cru; apresentação faz escape');
  assert.equal(apurar(itens,{time:'jaqueline'}).resumo.total,100);
  assert.equal(apurar(itens,{analista:'Klayton'}).resumo.total,200);
  assert.equal(apurar(itens,{analista:'Klayton',time:'JAQUELINE'}).resumo.total,0);
});

test('fechamento financeiro do volume: entregue + pendente = total e vencido/a vencer/sem prazo conciliam',()=>{
  const r=app()([
    item({eventosReal:[{data:'2026-10-10',volume:20},{data:'2026-10-20',volume:30}]}),
    item({metaAplicada:'2026-11-20',eventosReal:[{data:'2026-10-10',volume:40}]}),
    item({metaAplicada:''})
  ]);
  assert.equal(r.resumo.entregue+r.resumo.pendente,r.resumo.total);
  assert.equal(r.resumo.noPrazo+r.resumo.foraPrazo,90);
  assert.equal(r.resumo.vencido,50);assert.equal(r.resumo.aVencer,60);assert.equal(r.resumo.semPrazo,100);
  assert.equal(r.resumo.metaVencida,100);assert.equal(r.resumo.noPrazoVencido,20);
  assert.equal(r.resumo.foraPrazoVencido,30);assert.equal(r.resumo.aderencia,20);
});

test('datas e referências inválidas não geram apuração silenciosa',()=>{
  const apurar=app();
  assert.throws(()=>apurar([],{referencia:'outra'}),/Referência/);
  assert.throws(()=>apurar([],{corte:'2026-02-30'}),/corte/);
  assert.throws(()=>apurar([],{corte:'2026-11-14'}),/corte não pode ser futura/);
  assert.equal(apurar([item({metaAplicada:'2026-02-30'})]).resumo.semPrazo,100);
});

test('entrega não conferida não vira 0% individual; diagnóstico só de coleta preserva a nota de entrega',()=>{
  const apurar=app();
  const itens=[
    item({total:300,conciliacao:{diagnosticos:['entrega: quantidade-nao-concilia-tiragem-coletada']},
      eventosReal:[{data:'2026-10-10',volume:20}]}),
    item({conciliacao:{diagnosticos:['coleta: cache-sem-contrato-tp']},eventosReal:[{data:'2026-10-10',volume:40}]})
  ];
  const r=apurar(itens);
  assert.equal(r.resumo.total,400);assert.equal(r.resumo.naoApurado,300);
  assert.equal(r.resumo.metaVencida,100);assert.equal(r.resumo.noPrazoVencido,40);assert.equal(r.resumo.aderencia,40);
  assert.equal(r.resumo.entregue,60,'Entrega física conhecida continua visível');
  assert.equal(r.detalhes[0].prazo,'2026-10-15');assert.equal(r.detalhes[0].semPrazo,0);
  assert.equal(r.detalhes[0].vencido,0);assert.equal(r.detalhes[0].aVencer,0);
  assert.match(r.detalhes[0].motivo,/Entrega TP não conferida/);
  assert.equal(r.detalhes[1].naoApurado,0);assert.equal(r.detalhes[1].diagnosticos[0],'coleta: cache-sem-contrato-tp');
  for(const falha of ['parcelas-indisponiveis','cache-sem-contrato-tp','forecast-nao-conferido',
    'quantidade-nao-concilia-tiragem-coletada','identidade-da-linha-incompleta']) {
    const caso=apurar([item({conciliacao:{diagnosticos:['entrega: '+falha]}})]);
    assert.equal(caso.resumo.naoApurado,100,falha);assert.equal(caso.resumo.aderencia,null,falha);
  }
});

test('auditoria conserva ciclo, envio e identificadores únicos de todas as origens conciliadas',()=>{
  const origemA={_ROW_ID:'PCP:101',CICLO:'C1',ENVIO:'V1'},origemB={ID:102,CICLO:'C2',ENVIO:'V2'};
  const d=app()([item({conciliacao:{linhas:[origemA,origemB,origemA]}})]).detalhes[0];
  assert.equal(d.ciclo,'C1 | C2');assert.equal(d.envio,'V1 | V2');assert.equal(d.idOrigem,'PCP:101 | 102');
});
