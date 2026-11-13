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
    eventosColeta:[],linha:{SKU_REAL:'SKU-1',KIT:'K1',DESCRIÇÃO:'Livro',
      [BASELINE]:'2026-10-10',[REPLAN]:'2026-10-20'},...extra};
}

test('aderência total e por analista é ponderada pela tiragem vencida, sem média de percentuais',()=>{
  const apurar=app();
  const resultado=apurar([
    item({total:100,eventosColeta:[{data:'2026-10-10',volume:100}]}),
    item({total:900,grafica:'POSIGRAF',eventosColeta:[{data:'2026-10-10',volume:90},{data:'2026-10-16',volume:810}]})
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
  const pedido=item({eventosColeta:[{data:'2026-10-16',volume:80},{data:'2026-10-14',volume:60},
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

test('baseline e replan de coleta são diretos, sem aplicar SLA e sem fallback de prazo',()=>{
  const apurar=app();
  const pedido=item({dtPlan:'2026-10-01',linha:{sla:1,[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-12'},
    eventosColeta:[{data:'2026-10-12',volume:100}]});
  const baseline=apurar([pedido],{referencia:'baseline'}).detalhes[0];
  const replan=apurar([pedido],{referencia:'replan'}).detalhes[0];
  assert.equal(baseline.prazo,'2026-10-10','o prazo da coleta não soma SLA de transporte');
  assert.equal(baseline.noPrazo,0);assert.equal(replan.prazo,'2026-10-12');
  pedido.linha[REPLAN]='';
  const semReplan=apurar([pedido],{referencia:'replan'}).detalhes[0];
  assert.equal(semReplan.prazo,null);assert.equal(semReplan.semPrazo,100);
  assert.equal(semReplan.entregue,100);assert.equal(semReplan.noPrazo,0);assert.equal(semReplan.foraPrazo,0);
  assert.match(semReplan.motivo,/Replan ausente/);
});

test('SLA não participa da cobrança de coleta e baseline permanece utilizável',()=>{
  const apurar=app();
  const l1=item({linha:{sla:null,[BASELINE]:'2026-10-10'}});
  const l2=item({linha:{sla:0,[BASELINE]:'2026-10-10'}});
  const r=apurar([l1,l2],{referencia:'baseline'});
  assert.equal(r.detalhes[0].prazo,'2026-10-10');
  assert.equal(r.detalhes[1].prazo,'2026-10-10');
  assert.equal(r.resumo.metaVencida,200);
  assert.equal(r.resumo.semPrazo,0);
});

test('metas futuras não entram na nota; entregas antecipadas permanecem físicas e no prazo',()=>{
  const apurar=app();
  const futuro=item({metaAplicada:'2026-11-20',previsto:100,dtPlan:'2026-11-14',
    eventosColeta:[{data:'2026-11-10',volume:30},{data:'2026-11-15',volume:70}]});
  const r=apurar([futuro]);
  assert.equal(r.resumo.entregue,30);assert.equal(r.resumo.noPrazo,30);
  assert.equal(r.resumo.metaVencida,0);assert.equal(r.resumo.noPrazoVencido,0);
  assert.equal(r.resumo.aderencia,null);assert.equal(r.resumo.aVencer,70);assert.equal(r.resumo.vencido,0);
  const vazio=apurar([]).resumo;
  assert.equal(vazio.total,0);assert.equal(vazio.aderencia,null);assert.equal(vazio.analistas,0);
});

test('sem meta mantém o realizado físico e destaca toda a tiragem sem prazo',()=>{
  const r=app()([item({metaAplicada:'',eventosColeta:[{data:'2026-10-10',volume:40}]})]);
  assert.equal(r.resumo.entregue,40);assert.equal(r.resumo.pendente,60);
  assert.equal(r.resumo.semPrazo,100);assert.equal(r.resumo.vencido,0);assert.equal(r.resumo.aVencer,0);
  assert.equal(r.resumo.aderencia,null);assert.match(r.detalhes[0].motivo,/Meta armazém/);
});

test('prazo diferente em grupo sem KIT não usa a maior data para melhorar a nota',()=>{
  const apurar=app();
  const grupo=item({linha:{[BASELINE]:'2026-10-20',[REPLAN]:'2026-10-20'},conciliacao:{agrupado:true,linhas:[
    {[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-19',sla:0},
    {[BASELINE]:'2026-10-20',[REPLAN]:'2026-10-20',sla:0}
  ]},eventosColeta:[{data:'2026-10-15',volume:100}]});
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
    item({eventosColeta:[{data:'2026-10-10',volume:20},{data:'2026-10-20',volume:30}]}),
    item({metaAplicada:'2026-11-20',eventosColeta:[{data:'2026-10-10',volume:40}]}),
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

test('somente falha de coleta bloqueia a nota; falha de entrega não bloqueia',()=>{
  const apurar=app();
  const itens=[
    item({total:300,conciliacao:{diagnosticos:['coleta: quantidade-nao-concilia-tiragem-coletada']},
      eventosColeta:[{data:'2026-10-10',volume:20}]}),
    item({conciliacao:{diagnosticos:['entrega: cache-sem-contrato-tp']},
      eventosColeta:[{data:'2026-10-10',volume:40}]})
  ];
  const r=apurar(itens);
  assert.equal(r.resumo.total,400);assert.equal(r.resumo.naoApurado,300);
  assert.equal(r.resumo.metaVencida,100);assert.equal(r.resumo.noPrazoVencido,40);
  assert.equal(r.resumo.aderencia,40);assert.equal(r.resumo.entregue,60);
  assert.match(r.detalhes[0].motivo,/Coleta não conferida/);
  assert.equal(r.detalhes[1].naoApurado,0);
  for(const falha of ['parcelas-indisponiveis','cache-sem-contrato-tp','forecast-nao-conferido',
    'quantidade-nao-concilia-tiragem-coletada','identidade-da-linha-incompleta','parcelas-sem-identificador-fisico']){
    const caso=apurar([item({conciliacao:{diagnosticos:['coleta: '+falha]}})]);
    assert.equal(caso.resumo.naoApurado,100,falha);
    assert.equal(caso.resumo.aderencia,null,falha);
  }
});

test('auditoria conserva ciclo, envio e identificadores únicos de todas as origens conciliadas',()=>{
  const origemA={_ROW_ID:'PCP:101',CICLO:'C1',ENVIO:'V1'},origemB={ID:102,CICLO:'C2',ENVIO:'V2'};
  const d=app()([item({conciliacao:{linhas:[origemA,origemB,origemA]}})]).detalhes[0];
  assert.equal(d.ciclo,'C1 | C2');assert.equal(d.envio,'V1 | V2');assert.equal(d.idOrigem,'PCP:101 | 102');
});

test('visão por gráfica e marca mantém ponderação e identidade de cada analista',()=>{
  const apurar=app();
  const r=apurar([
    item({total:100,marca:'COC',eventosColeta:[{data:'2026-10-10',volume:80}]}),
    item({total:100,marca:'SAS',eventosColeta:[{data:'2026-10-18',volume:20}]}),
    item({total:50,grafica:'POSIGRAF',marca:'SAS',eventosColeta:[{data:'2026-10-10',volume:50}]})
  ]);
  assert.equal(r.resumo.total,250);
  assert.equal(r.graficasMarcas.length,3);
  assert.equal(r.graficasMarcas.filter(x=>x.analista==='Amanda Costa').length,2);
  assert.equal(r.graficasMarcas.find(x=>x.marca==='COC').noPrazoVencido,80);
  assert.equal(r.analistas.find(x=>x.analista==='Amanda Costa').graficas[0],'LOGPRINT');
});
test('Entregas não entram no numerador, parcelas de coleta compõem a auditoria',()=>{
  const apurar=app();
  const r=apurar([item({eventosReal:[{data:'2026-10-10',volume:100}],
    eventosColeta:[{data:'2026-10-14',volume:20,linhaMapa:45,kit:'123'}]})]);
  assert.equal(r.resumo.entregue,20);
  assert.equal(r.detalhes[0].parcelasColeta.length,1);
  assert.equal(r.detalhes[0].parcelasColeta[0].chave,'MAPA:45');
  assert.equal(r.detalhes[0].dataUltimaColeta,'2026-10-14');
});


test('Coleta + Matriz avalia somente coleta real projetada pela SLA contra a meta',()=>{
  const apurar=app();
  const r=apurar([item({linha:{sla:2,SKU_REAL:'SKU-1',[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-12'},
    eventosColeta:[{data:'2026-10-13',volume:65,linhaMapa:21},
      {data:'2026-10-14',volume:35,linhaMapa:22}],
    eventosReal:[{data:'2026-10-15',volume:100}]})],{etapa:'coleta_matriz'});
  assert.equal(r.resumo.entregue,100);
  assert.equal(r.resumo.noPrazoVencido,65);
  assert.equal(r.resumo.foraPrazoVencido,35);
  assert.equal(r.resumo.aderencia,65);
  assert.equal(r.detalhes[0].parcelasColeta[0].projetada,'2026-10-15');
  assert.equal(r.detalhes[0].parcelasColeta[1].projetada,'2026-10-16');
  assert.equal(r.detalhes[0].etapaAvaliada,'Coleta + Matriz');
});

test('SLA da rota aplica domingo para segunda como na Meta Armazém',()=>{
  const apurar=app();
  const r=apurar([item({metaAplicada:'2026-10-19',
    linha:{sla:1,[BASELINE]:'2026-10-15',[REPLAN]:'2026-10-15'},
    eventosColeta:[{data:'2026-10-17',volume:100}]})],{etapa:'coleta_matriz'});
  assert.equal(r.detalhes[0].parcelasColeta[0].projetada,'2026-10-19');
  assert.equal(r.resumo.aderencia,100);
});

test('Baseline e Replan da Coleta + Matriz incorporam SLA nos dois lados',()=>{
  const apurar=app();
  const pedido=item({metaAplicada:'2026-10-01',
    linha:{sla:3,[BASELINE]:'2026-10-09',[REPLAN]:'2026-10-10'},
    eventosColeta:[{data:'2026-10-10',volume:100}]});
  const b=apurar([pedido],{etapa:'coleta_matriz',referencia:'baseline'}).detalhes[0];
  const r=apurar([pedido],{etapa:'coleta_matriz',referencia:'replan'}).detalhes[0];
  assert.equal(b.prazo,'2026-10-12');
  assert.equal(r.prazo,'2026-10-13');
  assert.equal(b.parcelasColeta[0].projetada,'2026-10-13');
  assert.equal(b.noPrazoVencido,0);
  assert.equal(r.noPrazoVencido,100);
});

test('SLA ausente ou divergente não vira nota ruim de analista',()=>{
  const apurar=app();
  const sem=item({linha:{sla:null,[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-12'},
    eventosColeta:[{data:'2026-10-13',volume:70}]});
  const a=apurar([sem],{etapa:'coleta_matriz'});
  assert.equal(a.resumo.entregue,70);
  assert.equal(a.resumo.naoApurado,100);
  assert.equal(a.resumo.aderencia,null);
  assert.equal(a.resumo.foraPrazo,0);
  assert.match(a.detalhes[0].motivo,/Matriz/i);
  const divergente=item({conciliacao:{linhas:[
    {sla:1,[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-12'},
    {sla:3,[BASELINE]:'2026-10-10',[REPLAN]:'2026-10-12'}
  ]},eventosColeta:[{data:'2026-10-13',volume:100}]});
  const b=apurar([divergente],{etapa:'coleta_matriz'});
  assert.equal(b.resumo.naoApurado,100);
  assert.equal(b.resumo.aderencia,null);
});

test('Excedente de um SKU não cobre pendência de outro em Coleta + Matriz',()=>{
  const apurar=app();
  const a=item({total:100,linha:{SKU_REAL:'A',sla:0},
    eventosColeta:[{data:'2026-10-15',volume:200}]});
  const b=item({total:100,linha:{SKU_REAL:'B',sla:0},eventosColeta:[]});
  const r=apurar([a,b],{etapa:'coleta_matriz'});
  assert.equal(r.resumo.entregue,100);
  assert.equal(r.resumo.pendente,100);
  assert.equal(r.resumo.metaVencida,200);
  assert.equal(r.resumo.aderencia,50);
});
