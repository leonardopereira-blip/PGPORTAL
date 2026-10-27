const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const script = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, '');
const grupoSAE='LOGPRINT · SAE · 2ª SÉRIE · CD JDI',grupoSAS='LOGPRINT · SAS · 2ª SÉRIE · CD FOR';

function interfacePortal({adiar=false,adiarSheets=false,semGoogle=false,hojeData='2026-10-26',entregaHoje=false,entregaOntem=false,canvasOk=true}={}) {
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
  if(entregaOntem){
    const dt=new Date(hojeData+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()-1);
    linhas.forEach(l=>l.entregas=[{data:dt.toISOString().slice(0,10),volume:25}]);
  }
  let salvo, exportado, concluir, erro, concluirSheets, erroSheets, xlsx, rpcSheets=0, charts=0, sync=0;
  let success, failure;
  const run={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},
    getPrevisoesEntregaCDPortal(){success({success:true,previsoes:{}});},
    salvarPrevisaoEntregaCDPortal(p){salvo=p;const ok=success,fail=failure;
      concluir=()=>ok({success:true,previsao:{chave:p.chave,dataEntrega:p.dataEntrega,versao:1}});
      erro=()=>fail(new Error('Indisponível'));if(!adiar)concluir();},
    salvarPrevisoesEntregaCDPortal(p){salvo=p;const ok=success,fail=failure;
      concluir=()=>ok({success:true,previsoes:Object.fromEntries(p.previsoes.map((r,i)=>[r.chave,
        {chave:r.chave,dataEntrega:r.dataEntrega,versao:1,requestId:p.requestId+':'+i}]))});
      erro=()=>fail(new Error('Indisponível'));if(!adiar)concluir();},
    gerarPlanilhaEntregasCD(p){exportado=p;rpcSheets++;const ok=success,fail=failure;
      concluirSheets=resp=>ok(resp||{success:true,url:'https://docs.google.com/spreadsheets/d/123'});
      erroSheets=erro=>fail(erro||new Error('Google indisponível'));if(!adiarSheets)concluirSheets();}};
  const window={pgCampoColeta:(l,n)=>l[n],pgEhFonteAcabadora:l=>l._SOURCE==='PCP_ACABADORAS',pgSolicitacaoCancelada:()=>false,
    pgLinhasUnicas:x=>x,pgBaseForecastFiltrada:x=>x,pgBaseGeralReportExecutiva:linhas,
    pgDataPlanoColetaLinha:l=>l['Coleta/Internalização de estoque final (re) plan'],
    pgDataPlanoEntregaSLA:(l,d)=>{const dt=new Date((d||l['Coleta/Internalização de estoque final (re) plan'])+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+2);return dt.toISOString().slice(0,10);},
    pgVolumesColetaUnificadosV37:l=>({eventosColetaTP:l.coletas,eventosEntregaTP:l.entregas}),
    pgSerieCorrigidaFunil:l=>l.serie_corrigida,pgTPExportacaoPronta:()=>true,
    pgGerarExcelAbas:abas=>{xlsx=abas;return {size:100,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};},
    processarEntregasCD:()=>charts++,pgGiroSincronizar:()=>sync++,
    addEventListener:(e,fn)=>listeners.set(e,fn),dispatchEvent:e=>listeners.get(e.type)?.(e)};
  class Evento {constructor(type,opts){this.type=type;this.detail=opts.detail;}}
  const capturas=[],desenhos=[];
  const timers=new Map();let timerId=0;
  const agendar=(fn,ms)=>{const id=++timerId;if(ms===0||ms===30)fn();else timers.set(id,{fn,ms});return id;};
  const pincel={scale(){},fillRect(){},strokeRect(){},fillText:txt=>desenhos.push(txt)};
  const canvas={getContext:()=>canvasOk?pincel:null,toBlob:fn=>fn({tipo:'image/png',arrayBuffer:async()=>Uint8Array.from([137,80,78,71,13,10,26,10,1]).buffer})};
  const ctx=vm.createContext({window,document:{getElementById:id=>nodes.get(id)||null,
    createElement:n=>n==='canvas'?canvas:{click(){capturas.push({nome:this.download,url:this.href,largura:canvas.width,altura:canvas.height});}}},google:semGoogle?undefined:{script:{run}},
    URL:{createObjectURL:()=> 'blob:captura',revokeObjectURL(){}},setTimeout:agendar,clearTimeout:id=>timers.delete(id),
    dtHojeISO:hojeData,Date,Intl,console,CustomEvent:Evento});
  vm.runInContext(script('Scripts_EntregasCD_Modelo.html'),ctx);
  vm.runInContext(script('Scripts_EntregasCD_Controle.html'),ctx);window.processarEntregasCD();
  return {window,nodes,linhas,capturas,desenhos,salvo:()=>salvo,exportado:()=>exportado,xlsx:()=>xlsx,rpcSheets:()=>rpcSheets,
    confirmarSheets:resp=>concluirSheets(resp),falharSheets:erro=>erroSheets(erro),
    tempo:ms=>{for(const [id,t]of timers)if(t.ms===ms){timers.delete(id);t.fn();}},
    confirmar:()=>concluir(),falhar:()=>erro(),charts:()=>charts,sync:()=>sync};
}

test('tooltips agregam quantidades e não listam SKUs dos quadros',()=>{
  const a=interfacePortal({entregaHoje:true});
  for(const id of ['ecdQuadroMarca','ecdQuadroSerie']){
    const html=a.nodes.get(id).innerHTML;
    assert(!html.includes('SKU-01'));assert(!html.includes('SKU-02'));
    assert.match(html,/Total: 25/);assert.match(html,/Entregue: 25/);
  }
  assert(a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE),'edição das pendências por gráfica, marca, série e CD permanece disponível');
});

test('captura PNG inclui os dois quadros e todo o ciclo sem depender da rolagem',async()=>{
  const a=interfacePortal({entregaOntem:true}),botao=a.nodes.get('ecdPrint');
  botao.textContent='Capturar painel (PNG)';
  await a.window.pgECDCapturar(botao);
  assert.equal(a.capturas.length,2);
  assert.match(a.capturas[0].nome,/marca-cd/);assert.match(a.capturas[1].nome,/marca-serie-cd/);
  assert(a.capturas.every(c=>c.url==='blob:captura'&&c.largura>5000&&c.altura>0));
  for(const texto of ['02/12','SAE','SAS','CD FOR','CD JDI','Total geral'])assert(a.desenhos.includes(texto),texto);
  assert(!a.desenhos.some(t=>String(t).includes('SKU-')));
  assert.equal(botao.disabled,false);assert.equal(botao.textContent,'Capturar painel (PNG)');
  assert.match(a.nodes.get('ecdAviso').textContent,/Captura dos dois quadros concluída/);
});

test('Total Geral de 24,91M e entregue até ontem permanecem completos ao ocultar concluídos e trocar período',async()=>{
  const a=interfacePortal();
  a.linhas.forEach(l=>{l.TIRAGEM=12455000;});
  a.linhas[0].entregas=[{data:'2026-10-25',volume:12455000}];
  a.linhas[1].entregas=[{data:'2026-10-25',volume:4901300},{data:'2026-10-26',volume:1000000}];
  a.window.processarEntregasCD();
  for(const ocultar of [false,true])for(const [inicio,fim] of [['2026-10-01','2026-10-03'],['2027-01-04','2027-01-06']]){
    a.nodes.get('ecdOcultarConcluidos').checked=ocultar;
    a.nodes.get('ecdInicio').value=inicio;a.nodes.get('ecdFim').value=fim;a.window.pgECDRender();
    for(const id of ['ecdQuadroMarca','ecdQuadroSerie']){
      const html=a.nodes.get(id).innerHTML,rodape=html.match(/<tfoot>([\s\S]*?)<\/tfoot>/)[1];
      assert.match(rodape,/24,91M/);assert.match(rodape,/17,36M/);assert.match(rodape,/69,7%/);
      assert.match(html,/até ontem · 25\/10/);assert(!html.includes('17.356,3k'));
      assert.equal(html.includes('>SAE<'),!ocultar);
    }
    a.window.pgECDExportar(a.nodes.get('ecdExportar'));
    assert.equal(a.exportado().abas[0].linhas.at(-1)[2],24910000);
    assert.equal(a.exportado().abas[0].linhas.at(-1)[4],17356300);
    assert(a.exportado().abas[2].linhas.some(r=>r[1]==='SAE'),'base preserva linhas ocultadas');
  }
  assert.match(a.nodes.get('ecdNotaDomingo').textContent,/17,36M de 24,91M · 69,7%/);
  await a.window.pgECDCapturar(a.nodes.get('ecdPrint'));
  for(const texto of ['17,36M','69,7%','até ontem · 25/10'])assert(a.desenhos.includes(texto),texto);
  assert(a.desenhos.some(t=>String(t).includes('Plano 24.910.000')));
  assert.match(interfacePortal({entregaOntem:true}).nodes.get('ecdQuadroMarca').innerHTML,/0,1k/,'valores menores continuam em milhares');
});

test('falha da captura é informada e libera o botão para tentar novamente',async()=>{
  const a=interfacePortal({canvasOk:false}),botao=a.nodes.get('ecdPrint');botao.textContent='Print';
  await a.window.pgECDCapturar(botao);
  assert.equal(a.capturas.length,0);assert.equal(botao.disabled,false);assert.equal(botao.textContent,'Print');
  assert.match(a.nodes.get('ecdAviso').textContent,/Não foi possível capturar/);
});

test('XLSX baixa localmente sem Google e preserva três abas, Total Geral e entregue até ontem',async()=>{
  const a=interfacePortal({semGoogle:true}),botao=a.nodes.get('ecdExportarXLSX');botao.textContent='Baixar XLSX';
  a.linhas.forEach(l=>{l.TIRAGEM=12455000;});
  a.linhas[0].entregas=[{data:'2026-10-25',volume:12455000}];
  a.linhas[1].entregas=[{data:'2026-10-25',volume:4901300},{data:'2026-10-26',volume:1000000}];
  a.window.processarEntregasCD();a.nodes.get('ecdOcultarConcluidos').checked=true;
  a.nodes.get('ecdInicio').value='2026-10-01';a.nodes.get('ecdFim').value='2026-10-03';a.window.pgECDRender();
  const quadro=a.nodes.get('ecdQuadroMarca').innerHTML;
  await a.window.pgECDExportarXLSX(botao);const abas=a.xlsx();
  assert.deepEqual(JSON.parse(JSON.stringify(abas.map(a=>a.nome))),['Quadro_Marca_CD','Quadro_Marca_Serie_CD','Base_SKUs']);
  assert(abas[0].imagemPng.length>8&&abas[1].imagemPng.length>8);
  assert(!abas[0].cabecalho&&!abas[1].cabecalho,'cada quadro é apenas uma imagem');
  assert(a.desenhos.includes('Total geral'));
  assert(a.desenhos.includes('17,36M'));
  assert.equal(abas[2].semFormatacao,true);
  assert.deepEqual(JSON.parse(JSON.stringify(abas[2].cabecalho)),[
    'SKU','Marca','Série','Descrição do SKU','Personalizado (S/N)','Aluno/Professor',
    'CD','Gráfica','Data coleta TP','Data entrega TP','Prev. coleta','Prev. entrega',
    'Tiragem total','Coletado','Entregue','Saldo aguardando entrega','Status']);
  assert.equal(abas[2].linhas.length,2,'um item por linha, sem repetir tiragem por parcela');
  assert(abas[2].linhas.some(l=>l[1]==='SAE'));assert(abas[2].linhas.some(l=>l[1]==='SAS'));
  assert(abas[2].linhas.every(l=>l.length===17&&['','Em trânsito','Aguardando coleta'].includes(l[16])));
  assert.equal(abas[2].linhas.reduce((s,l)=>s+l[12],0),24910000);
  assert.equal(a.rpcSheets(),0);
  assert.equal(a.capturas.length,1);assert.match(a.capturas[0].nome,/Entregas_CD_2026-10-26\.xlsx$/);
  assert.equal(botao.disabled,false);assert.equal(botao.textContent,'Baixar XLSX');
  assert.equal(a.nodes.get('ecdQuadroMarca').innerHTML,quadro);assert.match(a.nodes.get('ecdAviso').textContent,/XLSX pronto/);
});

test('XLSX usa o snapshot do clique e evita baixar duas vezes durante a geração',async()=>{
  const a=interfacePortal(),botao=a.nodes.get('ecdExportarXLSX');
  a.nodes.get('ecdInicio').value='2026-10-01';a.nodes.get('ecdFim').value='2026-10-03';a.window.pgECDRender();
  const primeira=a.window.pgECDExportarXLSX(botao),segunda=a.window.pgECDExportarXLSX(botao);
  a.nodes.get('ecdInicio').value='2027-01-04';a.nodes.get('ecdFim').value='2027-01-06';a.window.pgECDRender();
  await Promise.all([primeira,segunda]);assert.equal(a.capturas.length,1);
  assert(a.desenhos.includes('01/10'));assert(!a.desenhos.includes('04/01'));
  assert.equal(a.xlsx()[0].larguraPx,465 + 3*136);
});

test('erro do XLSX libera o botão e permite tentar novamente',async()=>{
  const a=interfacePortal(),botao=a.nodes.get('ecdExportarXLSX');botao.textContent='Baixar XLSX';
  const gerar=a.window.pgGerarExcelAbas;a.window.pgGerarExcelAbas=()=>{throw new Error('Falha ao montar o arquivo');};
  await a.window.pgECDExportarXLSX(botao);assert.equal(botao.disabled,false);assert.equal(botao.textContent,'Baixar XLSX');
  assert.equal(a.capturas.length,0);assert.match(a.nodes.get('ecdAviso').textContent,/Falha ao montar o arquivo/);
  a.window.pgGerarExcelAbas=gerar;await a.window.pgECDExportarXLSX(botao);assert.equal(a.capturas.length,1);
});

test('Sheets lento mantém uma única solicitação, permite XLSX e confirma depois sem apagar aviso novo',async()=>{
  const a=interfacePortal({adiarSheets:true}),sheets=a.nodes.get('ecdExportar'),xlsx=a.nodes.get('ecdExportarXLSX');
  sheets.textContent='Exportar para Sheets';a.window.pgECDExportar(sheets);
  assert.equal(a.rpcSheets(),1);assert.equal(sheets.disabled,true);assert.equal(xlsx.disabled,false);
  a.tempo(60000);assert.match(a.nodes.get('ecdSheetsStatus').textContent,/Google ainda não confirmou/);
  a.window.pgECDExportar(sheets);assert.equal(a.rpcSheets(),1,'clique repetido não cria outra planilha');
  await a.window.pgECDExportarXLSX(xlsx);assert.equal(a.capturas.length,1);
  const avisoXLSX=a.nodes.get('ecdAviso').textContent;
  a.confirmarSheets();assert.equal(sheets.disabled,false);assert.equal(sheets.textContent,'Exportar para Sheets');
  assert.match(a.nodes.get('ecdSheetsStatus').innerHTML,/Abrir os dois quadros/);
  assert.equal(a.nodes.get('ecdAviso').textContent,avisoXLSX);
});

test('Sheets informa erro retornado e resposta sem link, sem afirmar criação confirmada',()=>{
  const a=interfacePortal({adiarSheets:true}),botao=a.nodes.get('ecdExportar');
  a.window.pgECDExportar(botao);a.confirmarSheets({success:false,error:'Limite de execução do Google excedido'});
  assert.match(a.nodes.get('ecdSheetsStatus').textContent,/Limite de execução do Google excedido/);assert.equal(botao.disabled,false);
  a.window.pgECDExportar(botao);a.confirmarSheets({success:true,url:'https://example.com'});
  assert.match(a.nodes.get('ecdSheetsStatus').textContent,/sem um link válido/);
  assert.match(a.nodes.get('ecdSheetsStatus').textContent,/criação da planilha não foi confirmada/);
});

test('nova visão abre backlog recolhido, põe marca/CD primeiro e mantém gráficos no fim',()=>{
  const a=interfacePortal(); const html=a.nodes.get('ecdNovaVisao').innerHTML;
  assert.match(html,/<details id="ecdPendencias" class="[^"]+">/);
  assert(html.indexOf('Quadro 1 · marca e CD')<html.indexOf('Quadro 2 · marca, série e CD'));
  assert(!html.includes('id="ecdCDTabs"'));
  for(const id of ['ecdFiltroMarca','ecdFiltroSerie','ecdFiltroStatus'])assert(!html.includes('id="'+id+'"'));
  assert.equal(a.nodes.get('ecdInicio').value,'2026-10-26');assert.equal(a.nodes.get('ecdFim').value,'2026-12-02');
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

test('Entregue fica congelado inclusive no Total Geral e conserva a quantidade entregue',()=>{
  const a=interfacePortal({hojeData:'2026-10-27',entregaOntem:true});
  const css=a.nodes.get('ecdNovaVisao').innerHTML;
  assert.match(css, /tbody \.ecd-left\.ecd-delivered\{position:sticky;z-index:9/);
  assert.match(css, /tfoot \.ecd-left\.ecd-delivered\{position:sticky;bottom:0;z-index:15/);
  for(const id of ['ecdQuadroMarca','ecdQuadroSerie']){
    const quadro=a.nodes.get(id).innerHTML;
    const rodape=quadro.match(/<tfoot>([\s\S]*?)<\/tfoot>/)?.[1] || '';
    assert.match(rodape,/Total geral/);
    assert.match(rodape,/class="ecd-left ecd-delivered ecd-frozen-end ecd-cell"/);
    assert.match(rodape,/<b>0,1k<\/b>/,'total entregue de duas parcelas de 25 deve aparecer');
  }
});

test('filtros gerais afetam quadros, pendências, plano, percentuais e as três abas exportadas',()=>{
  const a=interfacePortal();a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAS');a.window.processarEntregasCD();
  assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/SAS/);assert(!a.nodes.get('ecdQuadroSerie').innerHTML.includes('SAE'));
  assert(a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAS));assert(!a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE));
  a.window.pgECDExportar(a.nodes.get('ecdExportar'));const abas=a.exportado().abas;
  assert.deepEqual(JSON.parse(JSON.stringify(abas.map(x=>x.nome))),['Quadro_Marca_CD','Quadro_Marca_Serie_CD','Base_SKUs']);
  assert(abas[2].linhas.every(r=>r[1]==='SAS'));assert.equal(abas[2].linhas.reduce((s,r)=>s+r[15],0),100);
  assert.equal(abas[0].linhas.at(-1)[2],100);assert.match(a.nodes.get('ecdSheetsStatus').innerHTML,/Abrir os dois quadros/);
});

test('universo usa destino WALPRINT da Meta e origem física antes da união canônica',()=>{
  const a=interfacePortal();let recebidas;
  a.window.pgBaseForecastFiltrada=()=>{throw new Error('Não aplicar outro roteamento antes da base canônica.');};
  a.window.pgUnirTotalSemDuplicidade=linhas=>{recebidas=linhas;return linhas;};
  a.window.pgBaseGeralReportExecutiva=[...a.linhas,
    {...a.linhas[0],_SOURCE:'PCP_ACABADORAS',SKU_REAL:'ATHOS',GRAFICA_FINAL:'ATHOS','CD DESTINO':'CD FOR'},
    {...a.linhas[0],SKU_REAL:'WAL-PCP',CD_MAPA:'WALPRINT'},
    {...a.linhas[0],_SOURCE:'PCP_ACABADORAS',SKU_REAL:'WAL-ACAB','CD DESTINO':'WALPRINT'}];
  a.window.processarEntregasCD();assert.equal(recebidas.length,3);
  assert(recebidas.some(l=>l.SKU_REAL==='ATHOS'),'origem Todas mantém acabadoras elegíveis na base canônica');
  a.nodes.get('pgFiltroOrigem').value='GRAFICA';a.window.processarEntregasCD();
  assert.equal(recebidas.length,2);assert(recebidas.every(l=>l._SOURCE==='PCP'));
  assert.match(a.nodes.get('ecdNotaDomingo').textContent,/Origem: Gráficas/);
  a.nodes.get('pgFiltroOrigem').value='ACABADORA';a.window.processarEntregasCD();
  assert.equal(recebidas.length,1);assert.equal(recebidas[0].SKU_REAL,'ATHOS');
});

test('nova data entra de imediato no calendário, salva só entrega e confirmação compartilha versão',()=>{
  const a=interfacePortal({adiar:true});a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();
  assert(a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE));a.window.pgECDSalvar(0,{value:'2026-10-29'});
  assert.equal(a.salvo().dataEntrega,'2026-10-29');assert.deepEqual(JSON.parse(JSON.stringify(a.salvo().campos)),['dataEntrega']);
  assert(!a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE));assert.match(a.nodes.get('ecdQuadroSerie').innerHTML,/100% ✓/);
  assert.match(a.nodes.get('ecdAviso').textContent,/Salvando/);a.confirmar();
  assert.match(a.nodes.get('ecdAviso').textContent,/salva e compartilhada/);assert.equal(Object.values(a.window.PG_ECD_PREVISOES)[0].versao,1);
});

test('falha de gravação devolve parcela ao backlog e informa que não foi salva',()=>{
  const a=interfacePortal({adiar:true});a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();
  a.window.pgECDSalvar(0,{value:'2026-10-29'});assert(!a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE));
  a.falhar();assert(a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE));assert.match(a.nodes.get('ecdAviso').textContent,/Não foi possível salvar/);
});

test('data salva no Giro atualiza quadro aberto sem recarregar a base ou os gráficos',()=>{
  const a=interfacePortal();const chave=a.window.pgEntregasCDModelo.chave(a.linhas[0]);
  a.window.dispatchEvent({type:'pgportal-previsoes-atualizadas',detail:{previsoes:{[chave]:{dataEntrega:'2026-10-30',versao:2}}}});
  assert.equal(a.window.PG_ECD_PREVISOES[chave].dataEntrega,'2026-10-30');
  a.window.pgBaseGeralReportExecutiva=a.linhas.filter(l=>l.MARCA_FINAL==='SAE');a.window.processarEntregasCD();assert(!a.nodes.get('ecdBacklog').innerHTML.includes(grupoSAE));
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
  assert(a.nodes.get('ecdFalhas').innerHTML.includes(grupoSAE));assert.match(a.nodes.get('ecdFalhas').innerHTML,/Reenviar/);
  a.window.pgECDReenviar(0);assert.equal(a.salvo().requestId,requestId,'reenvio incerto é idempotente');
});

test('entregas de hoje ficam nas datas do quadro e não entram em Entregue até ontem',()=>{
  const feriado=interfacePortal({hojeData:'2026-11-02',entregaHoje:true});
  const html=feriado.nodes.get('ecdQuadroSerie').innerHTML;
  assert.match(html,/feriado · 0,1k/);assert.match(html,/style="background:#d9e8f8"/);
  const domingo=interfacePortal({hojeData:'2026-11-01',entregaHoje:true});
  assert.equal(domingo.nodes.get('ecdLegendaEntregue').textContent,'Entregue até ontem');
  assert.match(domingo.nodes.get('ecdNotaDomingo').textContent,/Realizado TP até ontem \(31\/10\): 0k de 0,2k · 0%/);
  assert.match(domingo.nodes.get('ecdQuadroSerie').innerHTML,/até ontem · 31\/10/);
});

test('Início e Fim escolhem datas passadas e futuras preservando entregue até ontem',async()=>{
  const a=interfacePortal({entregaOntem:true});
  a.nodes.get('ecdInicio').value='2026-10-01';a.nodes.get('ecdFim').value='2026-10-03';a.window.pgECDRender();
  let html=a.nodes.get('ecdQuadroMarca').innerHTML;
  assert.match(html,/qui 01\/10/);assert.match(html,/sáb 03\/10/);assert(!html.includes('02/12'));
  assert.match(html,/até ontem · 25\/10/);assert.match(a.nodes.get('ecdNotaDomingo').textContent,/25%/);
  a.window.pgECDExportar(a.nodes.get('ecdExportar'));
  assert(a.exportado().abas[0].cabecalho.includes('2026-10-01'));
  assert(!a.exportado().abas[0].cabecalho.includes('2026-12-02'));
  a.nodes.get('ecdInicio').value='2027-01-04';a.nodes.get('ecdFim').value='2027-01-06';a.window.pgECDRender();
  html=a.nodes.get('ecdQuadroMarca').innerHTML;assert.match(html,/seg 04\/01/);assert.match(html,/qua 06\/01/);
  a.nodes.get('ecdInicio').value='2027-01-07';a.window.pgECDRender();
  assert.match(a.nodes.get('ecdAviso').textContent,/início e fim válidos/);
  const exportacaoValida=a.exportado();a.window.pgECDExportar(a.nodes.get('ecdExportar'));
  assert.equal(a.exportado(),exportacaoValida,'intervalo inválido não exporta calendário antigo');
  await a.window.pgECDCapturar(a.nodes.get('ecdPrint'));assert.equal(a.capturas.length,0);
  assert.equal(a.charts(),1,'filtros locais não recalculam os gráficos legados');
});

test('período futuro acumula previsões vigentes anteriores ao início sem virar entregue TP',async()=>{
  const a=interfacePortal();a.linhas.forEach(l=>l['Coleta/Internalização de estoque final (re) plan']='2026-10-27');
  a.window.processarEntregasCD();a.nodes.get('ecdInicio').value='2026-11-10';a.nodes.get('ecdFim').value='2026-11-11';
  a.window.pgECDRender();
  assert.match(a.nodes.get('ecdQuadroMarca').innerHTML,/<span class="ecd-sub">100%<\/span>/);
  assert.match(a.nodes.get('ecdNotaDomingo').textContent,/Realizado TP até ontem \(25\/10\): 0k/);
  await a.window.pgECDCapturar(a.nodes.get('ecdPrint'));assert(a.desenhos.includes('100%'));
  a.window.pgECDExportar(a.nodes.get('ecdExportar'));assert.equal(a.exportado().abas[0].linhas.at(-1).at(-1),1);
});

test('ocultar linhas concluídas muda apenas o corpo dos quadros e preserva totais e base completa',async()=>{
  const a=interfacePortal();
  a.linhas[0].entregas=[{data:'2026-10-25',volume:100}];a.window.processarEntregasCD();
  a.nodes.get('ecdOcultarConcluidos').checked=true;a.window.pgECDRender();
  for(const id of ['ecdQuadroMarca','ecdQuadroSerie']){
    const html=a.nodes.get(id).innerHTML;assert(!html.includes('SAE'));assert.match(html,/SAS/);
  }
  assert.match(a.nodes.get('ecdInfoMarca').textContent,/1 linhas · 0,2k/);
  a.window.pgECDExportar(a.nodes.get('ecdExportar'));
  const abas=a.exportado().abas;assert(abas[2].linhas.some(r=>r[1]==='SAE'));assert(abas[2].linhas.some(r=>r[1]==='SAS'));
  assert.equal(abas[0].linhas.at(-1)[2],200);assert.equal(abas[0].linhas.at(-1)[4],100);
  await a.window.pgECDCapturar(a.nodes.get('ecdPrint'));assert(!a.desenhos.includes('SAE'));
  assert.equal(a.window.pgBaseGeralReportExecutiva.length,2);
  a.nodes.get('ecdOcultarConcluidos').checked=false;a.window.pgECDRender();
  assert.match(a.nodes.get('ecdQuadroMarca').innerHTML,/SAE/);
});

function prepararGrupo(a){
  const chaves=a.linhas.map(l=>a.window.pgEntregasCDModelo.chave(l));
  const montar=a.window.pgEntregasCDModelo.montar;
  a.window.pgEntregasCDModelo.montar=(...args)=>montar(...args).map((item,n)=>n?item:{...item,chavesOrigem:chaves});
  a.window.processarEntregasCD();return chaves;
}

test('previsão de grupo salva todas as chaves de origem em lote e compartilha com o Giro',()=>{
  const a=interfacePortal({adiar:true}),chaves=prepararGrupo(a);
  a.window.pgECDSalvar(0,{value:'2026-10-29'});const pedido=a.salvo();
  assert.deepEqual(JSON.parse(JSON.stringify(pedido.previsoes.map(p=>p.chave))),chaves);
  for(const p of pedido.previsoes){assert.deepEqual(JSON.parse(JSON.stringify(p.campos)),['dataEntrega']);
    assert.equal(p.dataEntrega,'2026-10-29');assert.equal(a.window.PG_ECD_PREVISOES[p.chave].dataEntrega,'2026-10-29');}
  a.confirmar();for(const chave of chaves)assert.equal(a.window.PG_ECD_PREVISOES[chave].versao,1);
  assert.match(a.nodes.get('ecdAviso').textContent,/salva e compartilhada/);
});

test('falha de grupo preserva gravação concorrente e reenvia o mesmo lote idempotente',()=>{
  const a=interfacePortal({adiar:true}),chaves=prepararGrupo(a);
  a.window.pgECDSalvar(0,{value:'2026-10-29'});const pedido=a.salvo();
  a.window.dispatchEvent({type:'pgportal-previsoes-atualizadas',detail:{previsoes:{[chaves[0]]:
    {chave:chaves[0],dataEntrega:'2026-10-31',versao:2}}}});
  a.falhar();assert.equal(a.window.PG_ECD_PREVISOES[chaves[0]].dataEntrega,'2026-10-31');
  assert.equal(a.window.PG_ECD_PREVISOES[chaves[1]].dataEntrega,undefined);
  a.window.pgECDReenviar(0);assert.equal(a.salvo().requestId,pedido.requestId);
  assert.deepEqual(JSON.parse(JSON.stringify(a.salvo().previsoes)),JSON.parse(JSON.stringify(pedido.previsoes)));
  a.confirmar();assert.equal(a.window.PG_ECD_PREVISOES[chaves[0]].dataEntrega,'2026-10-31');
  assert.equal(a.window.PG_ECD_PREVISOES[chaves[1]].dataEntrega,'2026-10-29');
});
