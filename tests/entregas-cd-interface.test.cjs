const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const script = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, '');

function interfacePortal({adiar=false,hojeData='2026-10-26',entregaHoje=false}={}) {
  const nodes = new Map(), listeners = new Map();
  const criar = id => {
    const classes = new Set(); let html='';
    const el={id,value:'',checked:false,disabled:false,textContent:'',style:{},
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}};
    Object.defineProperty(el,'innerHTML',{get:()=>html,set(v){html=String(v);for(const m of html.matchAll(/id="([^"]+)"/g)) if(!nodes.has(m[1]))nodes.set(m[1],criar(m[1]));}});
    return el;
  };
  ['ecdNovaVisao','abaEntregasCD','pgFiltroOrigem'].forEach(id=>nodes.set(id,criar(id)));
  nodes.get('pgFiltroOrigem').value='TODOS';
  const linha=(sku,marca,cd)=>({_SOURCE:'PCP',CD_FINAL:cd,GRAFICA_FINAL:'LOGPRINT',MARCA_FINAL:marca,
    SKU_REAL:sku,serie_corrigida:'2ª SÉRIE',TIPO:'Aluno',TIRAGEM:100,
    'Coleta/Internalização de estoque final (re) plan':'2026-10-20',
    coletas:[{data:'2026-10-26',volume:25}],entregas:[]});
  const linhas=[linha('SKU-01','SAE','CD JDI'),linha('SKU-02','SAS','CD FOR')];
  if(entregaHoje)linhas.forEach(l=>l.entregas=[{data:hojeData,volume:25}]);
  let salvo, exportado, concluir, erro, charts=0, sync=0;
  let success, failure;
  const run={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},
    getPrevisoesEntregaCDPortal(){success({success:true,previsoes:{}});},
    salvarPrevisaoEntregaCDPortal(p){salvo=p;const ok=success,fail=failure;
      concluir=()=>ok({success:true,previsao:{chave:p.chave,dataEntrega:p.dataEntrega,versao:1}});
      erro=()=>fail(new Error('Indisponível'));if(!adiar)concluir();},
    gerarPlanilhaEntregasCD(p){exportado=p;success({success:true,url:'https://docs.google.com/spreadsheets/d/123'});}};
  const window={pgCampoColeta:(l,n)=>l[n],pgEhFonteAcabadora:()=>false,pgSolicitacaoCancelada:()=>false,
    pgLinhasUnicas:x=>x,pgBaseForecastFiltrada:x=>x,pgBaseGeralReportExecutiva:linhas,
    pgDataPlanoColetaLinha:l=>l['Coleta/Internalização de estoque final (re) plan'],
    pgDataPlanoEntregaSLA:(l,d)=>{const dt=new Date((d||l['Coleta/Internalização de estoque final (re) plan'])+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+2);return dt.toISOString().slice(0,10);},
    pgVolumesColetaUnificadosV37:l=>({eventosColetaTP:l.coletas,eventosEntregaTP:l.entregas}),
    pgSerieCorrigidaFunil:l=>l.serie_corrigida,pgTPExportacaoPronta:()=>true,
    processarEntregasCD:()=>charts++,pgGiroSincronizar:()=>sync++,
    addEventListener:(e,fn)=>listeners.set(e,fn),dispatchEvent:e=>listeners.get(e.type)?.(e)};
  class Evento {constructor(type,opts){this.type=type;this.detail=opts.detail;}}
  const ctx=vm.createContext({window,document:{getElementById:id=>nodes.get(id)||null},google:{script:{run}},
    dtHojeISO:hojeData,Date,Intl,console,CustomEvent:Evento});
  vm.runInContext(script('Scripts_EntregasCD_Modelo.html'),ctx);
  vm.runInContext(script('Scripts_EntregasCD_Controle.html'),ctx);window.processarEntregasCD();
  return {window,nodes,linhas,salvo:()=>salvo,exportado:()=>exportado,confirmar:()=>concluir(),falhar:()=>erro(),charts:()=>charts,sync:()=>sync};
}

test('nova visão abre backlog recolhido, põe quadro detalhado antes e mantém gráficos no fim',()=>{
  const a=interfacePortal(); const html=a.nodes.get('ecdNovaVisao').innerHTML;
  assert.match(html,/<details id="ecdPendencias" class="[^"]+">/);
  assert(html.indexOf('Quadro 1 · marca, série e CD')<html.indexOf('Quadro 2 · marca e CD'));
  assert(!html.includes('id="ecdCDTabs"'));
  for(const id of ['ecdFiltroMarca','ecdFiltroSerie','ecdFiltroStatus','ecdFim'])assert(!html.includes('id="'+id+'"'));
  assert(!html.includes('max-height:440px'),'nenhuma tabela deve ter rolagem vertical própria');
  assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/ecd-week-corner/);
  assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/width:\d{4,}px;min-width:100%/);
  assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/Semana atual/);
  assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/SAE/);
  assert.equal(a.charts(),1);assert.equal(a.sync(),1);
  const tela=fs.readFileSync(path.join(root,'abaEntregasCD.html'),'utf8');
  assert(tela.indexOf('ecdNovaVisao')<tela.indexOf('ecdGraficosLegados'));
  assert(!tela.includes('class="hidden bg-white'));
});

test('filtros gerais afetam quadros, pendências, plano, percentuais e as três abas exportadas',()=>{
  const a=interfacePortal();a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAS');a.window.processarEntregasCD();
  assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/SAS/);assert(!a.nodes.get('ecdQuadroSerie').innerHTML.includes('SAE'));
  assert.match(a.nodes.get('ecdBacklog').innerHTML,/SKU-02/);assert(!a.nodes.get('ecdBacklog').innerHTML.includes('SKU-01'));
  a.window.pgECDExportar(a.nodes.get('ecdExportar'));const abas=a.exportado().abas;
  assert.deepEqual(JSON.parse(JSON.stringify(abas.map(x=>x.nome))),['Quadro_Marca_CD','Quadro_Marca_Serie_CD','Base_SKUs']);
  assert(abas[2].linhas.every(r=>r[1]==='SAS'));assert.equal(abas[2].linhas.reduce((s,r)=>s+r[15],0),100);
  assert.equal(abas[0].linhas.at(-1)[2],100);assert.match(a.nodes.get('ecdAviso').innerHTML,/Abrir os dois quadros/);
});

test('nova data entra de imediato no calendário, salva só entrega e confirmação compartilha versão',()=>{
  const a=interfacePortal({adiar:true});a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();
  assert.match(a.nodes.get('ecdBacklog').innerHTML,/SKU-01/);a.window.pgECDSalvar(0,{value:'2026-10-29'});
  assert.equal(a.salvo().dataEntrega,'2026-10-29');assert.deepEqual(JSON.parse(JSON.stringify(a.salvo().campos)),['dataEntrega']);
  assert(!a.nodes.get('ecdBacklog').innerHTML.includes('SKU-01'));assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/100% ✓/);
  assert.match(a.nodes.get('ecdAviso').textContent,/Salvando/);a.confirmar();
  assert.match(a.nodes.get('ecdAviso').textContent,/salva e compartilhada/);assert.equal(Object.values(a.window.PG_ECD_PREVISOES)[0].versao,1);
});

test('falha de gravação devolve parcela ao backlog e informa que não foi salva',()=>{
  const a=interfacePortal({adiar:true});a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();
  a.window.pgECDSalvar(0,{value:'2026-10-29'});assert(!a.nodes.get('ecdBacklog').innerHTML.includes('SKU-01'));
  a.falhar();assert.match(a.nodes.get('ecdBacklog').innerHTML,/SKU-01/);assert.match(a.nodes.get('ecdAviso').textContent,/Não foi possível salvar/);
});

test('data salva no Giro atualiza quadro aberto sem recarregar a base ou os gráficos',()=>{
  const a=interfacePortal();const chave=a.window.pgEntregasCDModelo.chave(a.linhas[0]);
  a.window.dispatchEvent({type:'pgportal-previsoes-atualizadas',detail:{previsoes:{[chave]:{dataEntrega:'2026-10-30',versao:2}}}});
  assert.equal(a.window.PG_ECD_PREVISOES[chave].dataEntrega,'2026-10-30');
  a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();assert(!a.nodes.get('ecdBacklog').innerHTML.includes('SKU-01'));
});

test('poll antigo mantém data otimista e resposta atrasada não desfaz versão nova',()=>{
  const a=interfacePortal({adiar:true}),chave=a.window.pgEntregasCDModelo.chave(a.linhas[0]);
  a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();a.window.pgECDSalvar(0,{value:'2026-10-29'});
  a.window.dispatchEvent({type:'pgportal-previsoes-atualizadas',detail:{previsoes:{[chave]:{dataEntrega:'',versao:0}}}});
  assert.equal(a.window.PG_ECD_PREVISOES[chave].dataEntrega,'2026-10-29');
  a.window.dispatchEvent({type:'pgportal-previsoes-atualizadas',detail:{previsoes:{[chave]:{dataEntrega:'2026-10-31',versao:2}}}});
  a.confirmar();assert.equal(a.window.PG_ECD_PREVISOES[chave].dataEntrega,'2026-10-31');assert.equal(a.window.PG_ECD_PREVISOES[chave].versao,2);
});

test('falha após outra pessoa salvar preserva data mais recente e mantém reenviar ao trocar filtro',()=>{
  const a=interfacePortal({adiar:true}),chave=a.window.pgEntregasCDModelo.chave(a.linhas[0]);
  a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();a.window.pgECDSalvar(0,{value:'2026-10-29'});
  const requestId=a.salvo().requestId;
  a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAS');a.window.processarEntregasCD();
  a.window.dispatchEvent({type:'pgportal-previsoes-atualizadas',detail:{previsoes:{[chave]:{dataEntrega:'2026-10-31',versao:2}}}});
  a.falhar();assert.equal(a.window.PG_ECD_PREVISOES[chave].dataEntrega,'2026-10-31');
  assert.match(a.nodes.get('ecdFalhas').innerHTML,/SKU-01/);assert.match(a.nodes.get('ecdFalhas').innerHTML,/Reenviar/);
  a.window.pgECDReenviar(0);assert.equal(a.salvo().requestId,requestId,'reenvio incerto é idempotente');
});

test('realizado em hoje-feriado fica azul e visível e domingo entra em Entregue com aviso',()=>{
  const feriado=interfacePortal({hojeData:'2026-11-02',entregaHoje:true});
  const html=feriado.nodes.get('ecdQuadroSerie').innerHTML;
  assert.match(html,/feriado · 0,1k/);assert.match(html,/style="background:#d9e8f8"/);
  const domingo=interfacePortal({hojeData:'2026-11-01',entregaHoje:true});
  assert.equal(domingo.nodes.get('ecdLegendaEntregue').textContent,'Entregue até hoje');
  assert.match(domingo.nodes.get('ecdNotaDomingo').textContent,/inclui entregas de hoje \(domingo\)/);
  assert.match(domingo.nodes.get('ecdQuadroSerie').innerHTML,/até 01\/11 · hoje/);
});
