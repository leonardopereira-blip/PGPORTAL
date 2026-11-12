const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Scripts_Globais_2.html'), 'utf8');
const giro = source.slice(source.indexOf('window.reFiltrarTabelaGiro = function()'),
  source.indexOf('\n</script>', source.indexOf('window.reFiltrarTabelaGiro = function()')));
const servidor = fs.readFileSync(path.join(root, 'SalvaJson.js'), 'utf8');
const exportacao = servidor.slice(servidor.indexOf('function pgResumoAtrasosGiro('),
  servidor.indexOf('function gerarPlanilhaReportExecutiva('));

function executarGiro({min=-90,max=15,eventos=[],estado={},serie='Série nova',ee='',campos={},materiais=null,
  pos=false,temCampos=true,ordenacao=[],retornarTela=false,historico={master:{},sku:{}},
  configurarJanela,retornarContexto=false,busca=''}) {
  const el = {};
  const linha = {TIRAGEM:100,SKU:'SKU-1',UNIDADE:'COC','GRÁFICA':'LOGPRINT',
    'CD DESTINO':'CD JDI',ENVIO:'V1','SÉRIE':'Série antiga',SERIE_CORRIGIDA:serie,
    'TIRAGEM TOTAL':100,'TIRAGEM COLETADA':estado.coletada||0, STATUS_EE:ee,...campos};
  const w = {
    GIRO_DADOS_RAW:materiais ? materiais.map(m=>({...linha,...m})) : [linha],
    GIRO_ETAPAS_SELECIONADAS:new Set(['Coleta Mapa','Coletado a mais']),
    GIRO_SORT_RULES:ordenacao,HISTORICO_OBS_GIRO:historico,CONTEXTOS_TEMP:{},
    pgObterResumoColeta:()=>({registros:[]}),pgEstadoColetaMapa:()=>({
      ay:'',total:100,coletada:0,saldo:0,pendente:false,parcial:false,concluida:false,...estado
    }),
    pgGiroSaldoPrazosV41:()=>({
      temCampos,totalPendente:eventos.reduce((s,e)=>s+e.volume,0),eventos
    }),
    pgCampoColeta:(r,n)=>r[n]||'',pgNumeroPrazoV35:v=>Math.max(0,Number(v)||0),
    pgGiroChaveObs:(_,x)=>x,
    pgGiroEscaparChaveObs:x=>x,pgGiroIdCampoObs:()=>'_campo',
    pgSerieCorrigidaFunil:r=>r.SERIE_CORRIGIDA||r['SÉRIE'],
    formatarBR:String,arredondar:Math.round,pgDataPlanoColetaLinha:()=>null,
    pgNormalizarDataColeta:v=>v
  };
  const doc={getElementById:id=>el[id]??={value:id==='sldGiroDiasMin'?String(min):
    id==='sldGiroDiasMax'?String(max):id==='filtroObsStatus'?'TODOS':id==='filtroSkuKitGiro'?busca:'',
    checked:id==='chkGiroAberto'||(id==='chkGiroPos'&&pos),innerHTML:''}};
  class DataFixa extends Date {
    constructor(...args) { super(...(args.length ? args : [2026,9,15,12])); }
  }
  const make = new Function('window','document','dtHojeISO','ETAPAS_MAPA','getValFromCols',
    'isDateFilled','parseValidDate','calcDiffDiasISO','FASES','Date',giro);
  make(w,doc,'2026-10-15',[],()=>null,v=>Boolean(v),v=>v?new Date(v):null,()=>0,[],DataFixa);
  configurarJanela?.(w);
  w.reFiltrarTabelaGiro();
  if (retornarContexto) return {w,doc,el};
  return retornarTela ? {linhas:w.pgGiroLinhasExportar,html:el.tbodyPontosAtencaoGiro.innerHTML}
    : w.pgGiroLinhasExportar;
}

test('Coleta TP fora do máximo e parcela sem data fora da faixa não aparecem',()=>{
  assert.equal(executarGiro({max:5,eventos:[{categoria:'A vencer',volume:50,dias:-20}],
    estado:{pendente:true,saldo:50}}).length,0);
  assert.equal(executarGiro({min:1,max:5,eventos:[{categoria:'Sem data',volume:50,dias:null}],
    estado:{pendente:true,saldo:50}}).length,0);
});

test('Giro preserva título Série e prioriza série corrigida, inclusive maiúscula',()=>{
  const linhas=executarGiro({eventos:[{categoria:'Vencida',volume:50,dias:0}],
    estado:{pendente:true,saldo:50},serie:'2º ANO'});
  assert.equal(linhas.length,1);
  assert.equal(linhas[0].serie,'2º ANO');
  const html=fs.readFileSync(path.join(root,'abaGiroSemanal_1.html'),'utf8');
  assert.match(html, /Série/);
  assert.doesNotMatch(html, /Série \(usando série corrigida/);
});

test('coleta a mais não cria pendência nem aparece com status EE OK',()=>{
  const linhas=executarGiro({ee:'OK',estado:{ay:'COLETADO A MAIS',coletada:150},
    campos:{'TIRAGEM COLETADA':150}});
  assert.equal(linhas.length,0);
});
test('excedente numérico do SKU também não vira pendência se AY está desatualizada',()=>{
  const linhas=executarGiro({campos:{'TIRAGEM COLETADA':150},
    estado:{pendente:false,parcial:false,saldo:0,ay:''}});
  assert.equal(linhas.length,0);
});

const estadoPos = {pendente:true,parcial:true,saldo:50};
function executarPos(opcoes={}) {
  return executarGiro({pos:true,estado:estadoPos,
    eventos:[{categoria:'A vencer',volume:50,dias:-20}],
    campos:{Coleta_TP:'2026-10-09T12:00:00'},...opcoes});
}

test('Pós com coleta há 6 ou 9 dias aparece com máximo -1 e exporta dias negativos',()=>{
  for (const [data,dias] of [['2026-10-09T12:00:00',6],['2026-10-06T12:00:00',9]]) {
    const linhas=executarPos({max:-1,campos:{Coleta_TP:data,TIPO:'ALUNO',CLIENTE_PERSONALIZADO:'Sim'}});
    assert.equal(linhas.length,1);
    assert.equal(linhas[0].dias,-dias);
    assert.equal(linhas[0].tiragem,50);
    assert.equal(linhas[0].status,'Coletado a menos');
    assert.equal(linhas[0].tipo,'ALUNO');
    assert.equal(linhas[0].clientePersonalizado,'Sim');
  }
});

test('Pós respeita os limites inclusivos dos dias desde a coleta',()=>{
  assert.equal(executarPos({min:-6,max:-6}).length,1);
  assert.equal(executarPos({min:-5,max:-1}).length,0);
  assert.equal(executarPos({min:-90,max:-7}).length,0);
});

test('Pós usa a coleta como prazo e mantém parcelas futuras ou sem data como detalhes',()=>{
  for (const dias of [-20,null]) {
    const tela=executarPos({max:-1,eventos:[{categoria:'Parcela',volume:50,dias}],retornarTela:true});
    assert.equal(tela.linhas.length,1);
    assert.equal(tela.linhas[0].dias,-6);
    assert.match(tela.html,/Coleta realizada há 6 dias/);
    assert.match(tela.html,dias===null?/Parcela: 50 un\. \(sem data\)/:/Parcela: 50 un\. \(vence em 20 dias\)/);
  }
});

test('Pós com coleta hoje ou futura usa zero e não entra no máximo -1',()=>{
  for (const data of ['2026-10-15T12:00:00','2026-10-20T12:00:00']) {
    assert.equal(executarPos({max:-1,campos:{Coleta_TP:data}}).length,0);
    const linhas=executarPos({min:0,max:0,campos:{Coleta_TP:data}});
    assert.equal(linhas.length,1);
    assert.ok(linhas[0].dias===0);
  }
});

test('Pós sem coleta mantém filtro por parcela e zero para ausência de prazo',()=>{
  const semColeta={Coleta_TP:''};
  const vencido=executarPos({max:-1,campos:semColeta,
    eventos:[{categoria:'Vencida',volume:50,dias:9}]});
  assert.equal(vencido.length,1);
  assert.equal(vencido[0].dias,-9);
  assert.equal(executarPos({max:-1,campos:semColeta}).length,0);
  assert.equal(executarPos({max:-1,campos:semColeta,
    eventos:[{categoria:'Sem data',volume:50,dias:null}]}).length,0);
  assert.equal(executarPos({min:0,max:0,campos:semColeta,
    eventos:[{categoria:'Sem data',volume:50,dias:null}]}).length,1);
  assert.equal(executarPos({min:0,max:0,campos:semColeta,temCampos:false,eventos:[]}).length,1);
  assert.equal(executarPos({max:-1,campos:semColeta,temCampos:false,eventos:[]}).length,0);
});

test('ordenação por pendência usa os dias da coleta também no Pós',()=>{
  const tela=executarPos({max:-1,retornarTela:true,ordenacao:[{col:'pendencia',dir:'asc'}],
    materiais:[
      {SKU:'SKU-6',UNIDADE:'MARCA-6',Coleta_TP:'2026-10-09T12:00:00'},
      {SKU:'SKU-9',UNIDADE:'MARCA-9',Coleta_TP:'2026-10-06T12:00:00'}
    ]});
  assert.equal(tela.linhas.length,2);
  assert.ok(tela.html.indexOf('MARCA-9') < tela.html.indexOf('MARCA-6'));
});

function executarExportacao(email,{podeTransferir=true,dados,opcoes,historico={master:{},sku:{}}}={}) {
  let owner='autor@empresa.com', editor='', criações=0, proximoIdAba=0;
  const abas={};
  const criarAba=()=>{
    const conteudo=[], formatos=[], cores=[];
    const idAba=proximoIdAba++;
    return {
      getSheetId:()=>idAba,
      setName(nome){abas[nome]={conteudo,formatos,cores}},
      appendRow(row){conteudo.push(row)},
      getRange(linha,coluna,altura=1,largura=1){
        return {
          setFontWeight(){return this},setBackground(){return this},setFontColor(){return this},
          setFontColors(valores){cores.push({linha,coluna,valores});return this},setWrap(){return this},
          setNumberFormat(formato){formatos.push({linha,coluna,altura,largura,formato});return this},
          setValues(rows){
            rows.forEach((valores,i)=>{
              const destino=conteudo[linha+i-1]??=[];
              valores.forEach((valor,j)=>{destino[coluna+j-1]=valor});
            });
            return this;
          },
          setValue(valor){return this.setValues([[valor]])}
        };
      },
      getMaxRows:()=>1000,getMaxColumns:()=>26,insertRowsAfter(){},insertColumnsAfter(){},
      autoResizeColumns(){},setFrozenRows(){}
    };
  };
  const sheet=criarAba();
  const arquivo={getOwner:()=>({getEmail:()=>owner}),
    setOwner:dest=>{if(!podeTransferir)throw Error('Política');owner=dest},
    addEditor:dest=>{editor=dest}};
  const ss={getId:()=> 'id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/id',
    getActiveSheet:()=>sheet,setSpreadsheetTimeZone(){},setSpreadsheetLocale(){},
    insertSheet(nome){const aba=criarAba();aba.setName(nome);return aba}};
  const Sheets={create:()=>{criações++;return ss},flush(){}};
  const DriveApp={getFileById:()=>arquivo};
  const Utilities={formatDate:()=> '2026_10_15'};
  const Session={getActiveUser:()=>({getEmail:()=>email})};
  const fn=new Function('SpreadsheetApp','DriveApp','Utilities','Session','buscarHistoricoObsGiro',
    exportacao+'\nreturn gerarPlanilhaGiroFiltrado;')(Sheets,DriveApp,Utilities,Session,()=>historico);
  const entrada=dados||[{grafica:'A',marca:'COC',serie:'2º ANO',cd:'CD FOR',sku:'SKU',desc:'D',
    status:'Em Aberto',pendencia:'Coleta Mapa',dias:0,tiragem:100}];
  const resultado=fn(entrada,opcoes);
  const [cabecalho=[],...linhas]=abas.Giro_Filtrado?.conteudo||[];
  return {resultado,owner,editor,criações,cabecalho,linhas,abas};
}

test('exportação transfere a propriedade para o autor autenticado quando permitido',()=>{
  const r=executarExportacao('colega@empresa.com');
  assert.equal(r.resultado.success,true);
  assert.equal(r.resultado.url,'https://docs.google.com/spreadsheets/d/id');
  assert.equal(r.resultado.proprietarioTransferido,true);
  assert.equal(r.owner,'colega@empresa.com');
});
test('se transferência proibida, compartilhamento de edição é explícito',()=>{
  const r=executarExportacao('colega@empresa.com',{podeTransferir:false});
  assert.equal(r.resultado.success,true);
  assert.equal(r.resultado.proprietarioTransferido,false);
  assert.equal(r.editor,'colega@empresa.com');
  assert.match(r.resultado.aviso,/não permitiu transferir/);
});
test('sem usuário autenticado, não cria arquivo no proprietário do portal',()=>{
  const r=executarExportacao('');
  assert.equal(r.resultado.success,false);
  assert.equal(r.criações,0);
});

test('payload filtrado inclui CD, Série corrigida e chaves das observações',()=>{
  const linhas=executarGiro({eventos:[{categoria:'Vencida',volume:50,dias:0}],
    estado:{pendente:true,saldo:50},serie:'2º ANO'});
  assert.equal(linhas.length,1);
  assert.equal(linhas[0].cd,'CD JDI');
  assert.equal(linhas[0].serie,'2º ANO');
  assert.match(linhas[0].chaveMaster,/LOGPRINT.*COC.*2º ANO/);
  assert.match(linhas[0].chaveSku,/SKU-1/);
});

test('Giro pesquisa SKU parcialmente e recalcula os totais do grupo e da exportação',()=>{
  const {w}=executarGiro({retornarContexto:true,busca:'sku-20',
    estado:{pendente:true,saldo:50},eventos:[{categoria:'Vencida',volume:50,dias:0}],
    materiais:[
      {SKU:'SKU-10',KIT:'KIT-AAA','TIRAGEM TOTAL':100},
      {SKU:'SKU-20',KIT:'KIT-BBB','TIRAGEM TOTAL':200}
    ]});
  assert.deepEqual(w.pgGiroLinhasExportar.map(l=>l.sku),['SKU-20']);
  assert.equal(w.pgGiroGruposExportar.length,1);
  assert.equal(w.pgGiroGruposExportar[0].qtdSkusTotal,1);
  assert.equal(w.pgGiroGruposExportar[0].tiragemPrevistaTotal,200);
});

test('Giro pesquisa KIT parcialmente sem diferenciar maiúsculas e exporta só SKUs correspondentes',()=>{
  const {w}=executarGiro({retornarContexto:true,busca:'kit-bb',
    estado:{pendente:true,saldo:50},eventos:[{categoria:'Vencida',volume:50,dias:0}],
    materiais:[
      {SKU:'SKU-10',KIT:'KIT-AAA','TIRAGEM TOTAL':100},
      {SKU:'SKU-20',KIT:'KIT-BBB','TIRAGEM TOTAL':200}
    ]});
  assert.deepEqual(w.pgGiroLinhasExportar.map(l=>l.kitPcp),['KIT-BBB']);
  assert.equal(w.pgGiroGruposExportar[0].tiragemPrevistaTotal,200);
});

test('pesquisa por SKU nao reintroduz item cuja TIRAGEM TOTAL e zero',()=>{
  const linhas=executarGiro({busca:'SKU-ZERO',
    estado:{pendente:true,saldo:50},eventos:[{categoria:'Vencida',volume:50,dias:0}],
    materiais:[
      {SKU:'SKU-ZERO','TIRAGEM TOTAL':0,'TIRAGEM COLETADA':500},
      {SKU:'SKU-POSITIVO','TIRAGEM TOTAL':100}
    ]});
  assert.equal(linhas.length,0);
});

test('Giro remove apenas o painel da curva e mantém a busca e os filtros existentes',()=>{
  const html=fs.readFileSync(path.join(root,'abaGiroSemanal_1.html'),'utf8');
  assert.doesNotMatch(html,/Curva de Coleta Prevista|grafColetaFinalFunilGiro/);
  assert.match(html,/id="filtroSkuKitGiro"/);
  assert.match(html,/id="filtroEtapasGiro"/);
  assert.match(html,/id="tbodyPontosAtencaoGiro"/);
});

test('extração leva tipo e personalização da linha do SKU até a planilha',()=>{
  const dados=executarGiro({eventos:[{categoria:'Vencida',volume:50,dias:0}],
    estado:{pendente:true,saldo:50},materiais:[
      {SKU:'SKU-ALUNO',TIPO:'ALUNO',CLIENTE_PERSONALIZADO:'Sim'},
      {SKU:'SKU-PROFESSOR',TIPO:'PROFESSOR',CLIENTE_PERSONALIZADO:'Não'}
    ]});
  assert.deepEqual(dados.map(d=>[d.tipo,d.clientePersonalizado]),
    [['ALUNO','Sim'],['PROFESSOR','Não']]);
  const r=executarExportacao('colega@empresa.com',{dados});
  assert.equal(r.resultado.success,true);
  const tipo=r.cabecalho.indexOf('Tipo');
  const cliente=r.cabecalho.indexOf('Cliente personalizado');
  assert.ok(tipo>=0 && cliente>=0);
  assert.deepEqual(r.linhas.map(l=>[l[tipo],l[cliente]]),
    [['ALUNO','Sim'],['PROFESSOR','Não']]);
  assert.ok(r.linhas.every(l=>l.length===r.cabecalho.length));
});

test('campos ausentes ficam vazios sem inferir tipo ou personalização',()=>{
  const dados=executarGiro({eventos:[{categoria:'Vencida',volume:50,dias:0}],
    estado:{pendente:true,saldo:50}});
  const r=executarExportacao('colega@empresa.com',{dados});
  assert.equal(r.resultado.success,true);
  assert.equal(r.linhas[0][r.cabecalho.indexOf('Tipo')],'');
  assert.equal(r.linhas[0][r.cabecalho.indexOf('Cliente personalizado')],'');
});

test('planilha inclui Série e CD sem criar coluna de observação quando vazia',()=>{
  const r=executarExportacao('colega@empresa.com');
  assert.equal(r.resultado.success,true);
  assert.equal(r.cabecalho[2],'Série');
  assert.equal(r.cabecalho[3],'CD');
  assert.equal(r.linhas[0][2],'2º ANO');
  assert.equal(r.linhas[0][3],'CD FOR');
  assert.equal(r.cabecalho.includes('Observações'),false);
  assert.equal(r.linhas[0].length,r.cabecalho.length);
});

test('observações atuais de grupo e SKU aparecem só nas linhas correspondentes',()=>{
  const dados=[
    {grafica:'LOGPRINT',marca:'COC',serie:'2º ANO',cd:'CD JDI',
      sku:'SKU 1',desc:'D',status:'Em Aberto',pendencia:'Coleta Mapa',
      dias:0,tiragem:50,chaveMaster:'GRUPO',chaveSku:'SKU1'},
    {grafica:'LOGPRINT',marca:'COC',serie:'2º ANO',cd:'CD JDI',
      sku:'SKU 2',desc:'D',status:'Em Aberto',pendencia:'Coleta Mapa',
      dias:1,tiragem:40,chaveMaster:'OUTRO',chaveSku:'SKU2'}
  ];
  const historico={master:{GRUPO:[{obs:'Prazo atualizado'}]},
    sku:{SKU1:[{obs:'Aguardando gráfica'}],SKU2:[]}};
  const r=executarExportacao('colega@empresa.com',{dados,historico});
  assert.equal(r.resultado.success,true);
  const idx=r.cabecalho.indexOf('Observações');
  assert.equal(idx,14);
  assert.equal(r.linhas[0][idx],'Geral: Prazo atualizado\nSKU: Aguardando gráfica');
  assert.equal(r.linhas[1][idx],'');
  assert.equal(r.linhas[0][3],'CD JDI');
  assert.equal(r.linhas[1][2],'2º ANO');
});

test('Exportar Filtrados leva quantidades e porcentagens da tela por SKU e por grupo',()=>{
  const dados=[
    {grafica:'WALPRINT',marca:'SPE',serie:'INF 3',cd:'POSIGRAF',sku:'EXCESSO',desc:'Portfólio',
      status:'Coletado a mais',pendencia:'-',dias:0,tiragem:0,tiragemOriginal:19254,
      tiragemColetada:20000,percentualColetado:1,kitPcp:'0007',mapasSaida:'MP-EXCESSO'},
    {grafica:'WALPRINT',marca:'SPE',serie:'INF 4',cd:'POSIGRAF',sku:'FALTA-UM',desc:'Portfólio',
      status:'Coletado a menos',pendencia:'Coleta Mapa',dias:-27,tiragem:1,tiragemOriginal:26192,
      tiragemColetada:26191,percentualColetado:0.9999,kitPcp:'KIT-PCP',mapasSaida:'MP-01, MP-02',
      observacaoGeral:'Prazo geral visível',observacaoSku:'Prazo do SKU visível',novaData:'2026-11-15'},
    {grafica:'WALPRINT',marca:'SPE',serie:'INF 2',cd:'POSIGRAF',sku:'SEM-PLANO',desc:'Portfólio',
      status:'Em Aberto',pendencia:'Coleta Mapa',dias:2,tiragem:0,tiragemOriginal:0,
      tiragemColetada:0,percentualColetado:null,kitPcp:'',mapasSaida:'',observacaoSku:'=1+1'}
  ];
  const gruposGiro=[
    {grafica:'WALPRINT',marca:'SPE',serie:'INF 4',cd:'POSIGRAF',envio:'V1',status:'Coletado a menos',
      pendencia:'Coleta Mapa',qtdSkusPendentes:1,qtdSkusTotal:2,qtdSkusColetados:0,
      tiragemTotal:1,tiragemPrevistaTotal:26192,tiragemColetadaTotal:26191,
      tiragemColetadaBruta:26191,tiragemExcedenteTotal:0,percentualColetado:0.9999,
      observacaoGeral:'Prazo geral visível',novaData:'2026-11-16'},
    {grafica:'WALPRINT',marca:'SPE',serie:'INF 3',cd:'POSIGRAF',envio:'V1',status:'Coletado a mais',
      pendencia:'-',qtdSkusPendentes:0,qtdSkusTotal:1,qtdSkusColetados:1,
      tiragemTotal:0,tiragemPrevistaTotal:19254,tiragemColetadaTotal:19254,
      tiragemColetadaBruta:20000,tiragemExcedenteTotal:746,percentualColetado:1}
  ];
  const r=executarExportacao('colega@empresa.com',{dados,opcoes:{resumoGiro:true,gruposGiro}});
  assert.equal(r.resultado.success,true,r.resultado.error);
  assert.deepEqual(Object.keys(r.abas).sort(),['Giro_Filtrado','Giro_Grupos','Resumo_Atrasos']);
  assert.deepEqual(r.abas.Giro_Filtrado.conteudo[0].slice(10,14),
    ['Tiragem total','Tiragem coletada','Tiragem pendente','% coletado']);
  assert.deepEqual(r.abas.Giro_Grupos.conteudo[0].slice(7,14),
    ['SKUs totais','SKUs coletados','SKUs pendentes',
      'Tiragem total','Tiragem coletada','Tiragem pendente','% coletado']);
  assert.equal(r.resultado.url,'https://docs.google.com/spreadsheets/d/id#gid=1');
  const tabela=nome=>{
    const [cabecalho,...linhas]=r.abas[nome].conteudo;
    assert(linhas.every(linha=>linha.length===cabecalho.length));
    return linhas.map(linha=>Object.fromEntries(cabecalho.map((titulo,i)=>[titulo,linha[i]])));
  };
  const dataSheets=(dia)=>(Date.UTC(2026,10,dia)-Date.UTC(1899,11,30))/86400000;
  const [excesso,parcial,semPlano]=tabela('Giro_Filtrado');
  assert.deepEqual([excesso.SKU,parcial.SKU,semPlano.SKU],['EXCESSO','FALTA-UM','SEM-PLANO']);
  assert.equal(excesso.Status,'Coletado a mais');
  assert.equal(parcial.Status,'Coletado a menos');
  const metricas=['Tiragem pendente','Tiragem total','Tiragem coletada','% coletado'];
  assert.deepEqual(metricas.map(nome=>parcial[nome]),[1,26192,26191,0.9999]);
  assert.deepEqual(metricas.map(nome=>excesso[nome]),[0,19254,20000,1]);
  assert.equal(semPlano['% coletado'],'');
  assert.equal(parcial['Kit PCP'],'KIT-PCP');
  assert.equal(excesso['Kit PCP'],'0007');
  assert.equal(parcial['Mapa de saída'],'MP-01, MP-02');
  assert.equal(parcial['Observações (Ação / Motivo)'],'Prazo geral visível');
  assert.equal(parcial['Observação Específica do SKU'],'Prazo do SKU visível');
  assert.equal(semPlano['Observação Específica do SKU'],"'=1+1",'anotação literal não vira fórmula');
  assert.equal(parcial['Nova data'],dataSheets(15));
  assert.equal(semPlano['Nova data'],'');
  const [grupoParcial,grupoExcesso]=tabela('Giro_Grupos');
  assert.equal(grupoParcial['Status Geral'],'Coletado a menos');
  const contagens=['SKUs pendentes','SKUs totais','SKUs coletados'];
  assert.deepEqual(contagens.map(nome=>grupoParcial[nome]),[1,2,0]);
  assert.deepEqual(contagens.map(nome=>grupoExcesso[nome]),[0,1,1]);
  assert.deepEqual(['Tiragem pendente','Tiragem total','Tiragem coletada','% coletado']
    .map(nome=>grupoParcial[nome]),[1,26192,26191,0.9999]);
  assert.equal(grupoExcesso['Tiragem coletada'],19254);
  assert(!('Coleta bruta' in grupoExcesso));
  assert.equal(grupoParcial['Observações (Ação / Motivo)'],'Prazo geral visível');
  assert.equal(grupoParcial['Nova data'],dataSheets(16));
  const detalhe=r.abas.Giro_Filtrado;
  const coluna=titulo=>r.cabecalho.indexOf(titulo)+1;
  assert(detalhe.formatos.some(f=>f.formato==='0.00%'&&f.coluna===coluna('% coletado')));
  assert(detalhe.formatos.some(f=>f.formato==='dd/mm/yyyy'&&f.coluna===coluna('Nova data')));
  assert.deepEqual(detalhe.cores.find(f=>f.coluna===coluna('% coletado'))?.valores,
    [['#047857'],['#92400e'],['#64748b']]);
  const atrasos=tabela('Resumo_Atrasos');
  assert.equal(atrasos.length,2);
  assert(atrasos.every(linha=>linha['Tiragem atrasada']===1&&linha['Maior atraso (dias)']===27));
});

test('clique em Exportar Filtrados usa as datas visíveis e as chaves do grupo e do SKU',()=>{
  const {w,doc}=executarPos({retornarContexto:true,
    estado:{pendente:true,parcial:true,saldo:1,coletada:26191},
    eventos:[{categoria:'Tiragem vencida',volume:1,dias:0}],
    campos:{Coleta_TP:'2026-10-09T12:00:00','TIRAGEM TOTAL':26192,'COD KIT':'KIT-PCP'},
    materiais:[{SKU:'SKU-1',UNIDADE:'SPE-Z'},{SKU:'SKU-2',UNIDADE:'SPE-A'}],
    ordenacao:[{col:'marca',dir:'asc'}],
    configurarJanela:janela=>{
      janela.pgCodigosMapasColetadosTPLinha=()=>['MP-01','MP-02'];
      janela.pgNFsMapasColetadosTPLinha=()=>({venda:['000123','000124'],remessa:['000789']});
      janela.pgGiroHistoricoParaChave=tipo=>[{obs:tipo==='MASTER'?'Nota geral visível':'Nota SKU visível'}];
    }
  });
  doc.getElementById('girodata_0').value='2026-10-23';
  doc.getElementById('girodata_0_0').value='2026-10-24';
  doc.getElementById('girodata_1').value='2026-10-25';
  doc.getElementById('girodata_1_0').value='2026-10-26';
  const inicio=source.indexOf('window.exportarPendenciasGiroVisiveis = function()');
  const trecho=source.slice(inicio,source.indexOf('\n};',inicio)+3);
  let envio;
  const run={
    withSuccessHandler(){return this},
    withFailureHandler(){return this},
    gerarPlanilhaGiroFiltrado(dados,opcoes){envio={dados,opcoes}}
  };
  w.open=()=>null;
  new Function('window','document','google','alert',trecho)(w,doc,{script:{run}},mensagem=>assert.fail(mensagem));
  w.exportarPendenciasGiroVisiveis();
  assert.equal(envio.opcoes.resumoGiro,true);
  assert.deepEqual(envio.dados.map(item=>[item.sku,item.novaData]),
    [['SKU-2','2026-10-24'],['SKU-1','2026-10-26']]);
  assert.deepEqual(envio.opcoes.gruposGiro.map(item=>[item.marca,item.novaData]),
    [['SPE-A','2026-10-23'],['SPE-Z','2026-10-25']]);
  const [sku]=envio.dados;
  const [grupo]=envio.opcoes.gruposGiro;
  assert.equal(sku.chaveMaster,grupo.chaveMaster);
  assert.match(sku.chaveSku,/SKU-2/);
  assert.equal(sku.observacaoGeral,'Nota geral visível');
  assert.equal(sku.observacaoSku,'Nota SKU visível');
  assert.equal(grupo.observacaoGeral,'Nota geral visível');
  assert.deepEqual([sku.tiragem,sku.tiragemOriginal,sku.tiragemColetada,sku.percentualColetado],
    [1,26192,26191,0.9999]);
  assert.equal(sku.kitPcp,'KIT-PCP');
  assert.equal(sku.mapasSaida,'MP-01, MP-02');
  assert.equal(sku.nfsVenda,'000123, 000124');
  assert.equal(sku.nfsRemessa,'000789');
  assert.deepEqual([grupo.qtdSkusPendentes,grupo.qtdSkusTotal,grupo.qtdSkusColetados],[1,1,0]);
});

test('excedente fica fora das pendências por padrão',()=>{
  const r=executarGiro({ee:'',estado:{ay:'COLETADO A MAIS',coletada:150},
    campos:{'TIRAGEM COLETADA':150},retornarTela:true,
    // Sem checkbox concluído, a situação aparece apenas no detalhe consultável.
    });
  assert.equal(r.linhas.length,0);
});

test('exportação do Giro inclui NF Venda e NF Remessa como texto, inclusive zeros e células vazias',()=>{
  const r=executarExportacao('colega@empresa.com',{
    dados:[{sku:'COM-NF',nfsVenda:'000123, 000124',nfsRemessa:'000789'},
      {sku:'SEM-NF'}, {sku:'TEXTO',nfsVenda:'=1+1',nfsRemessa:'0000'}],
    opcoes:{resumoGiro:true,gruposGiro:[]}
  });
  assert.equal(r.resultado.success,true,r.resultado.error);
  const [cabecalho,...linhas]=r.abas.Giro_Filtrado.conteudo;
  const venda=cabecalho.indexOf('NF Venda'),remessa=cabecalho.indexOf('NF Remessa');
  assert.equal(venda,cabecalho.indexOf('Mapa de saída')+1);
  assert.equal(remessa,venda+1);
  assert.deepEqual(linhas.map(l=>[l[venda],l[remessa]]),
    [['000123, 000124','000789'],['',''],["'=1+1",'0000']]);
  assert(linhas.every(l=>l.length===cabecalho.length));
});
