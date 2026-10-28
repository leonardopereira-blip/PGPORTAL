const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Scripts_Globais_2.html'), 'utf8');
const giro = source.slice(source.indexOf('window.reFiltrarTabelaGiro = function()'),
  source.indexOf('\n</script>', source.indexOf('window.reFiltrarTabelaGiro = function()')));
const servidor = fs.readFileSync(path.join(root, 'SalvaJson.js'), 'utf8');
const exportacao = servidor.slice(servidor.indexOf('function gerarPlanilhaGiroFiltrado('),
  servidor.indexOf('function gerarPlanilhaReportExecutiva('));

function executarGiro({min=-90,max=15,eventos=[],estado={},serie='Série nova',ee='',campos={},materiais=null,
  pos=false,temCampos=true,ordenacao=[],retornarTela=false}) {
  const el = {};
  const linha = {TIRAGEM:100,SKU:'SKU-1',UNIDADE:'COC','GRÁFICA':'LOGPRINT',
    'CD DESTINO':'CD JDI',ENVIO:'V1','SÉRIE':'Série antiga',SERIE_CORRIGIDA:serie,
    'TIRAGEM TOTAL':100,'TIRAGEM COLETADA':estado.coletada||0, STATUS_EE:ee,...campos};
  const w = {
    GIRO_DADOS_RAW:materiais ? materiais.map(m=>({...linha,...m})) : [linha],
    GIRO_ETAPAS_SELECIONADAS:new Set(['Coleta Mapa','Coletado a mais']),
    GIRO_SORT_RULES:ordenacao,HISTORICO_OBS_GIRO:{master:{},sku:{}},CONTEXTOS_TEMP:{},
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
    id==='sldGiroDiasMax'?String(max):id==='filtroObsStatus'?'TODOS':'',
    checked:id==='chkGiroAberto'||(id==='chkGiroPos'&&pos),innerHTML:''}};
  class DataFixa extends Date {
    constructor(...args) { super(...(args.length ? args : [2026,9,15,12])); }
  }
  const make = new Function('window','document','dtHojeISO','ETAPAS_MAPA','getValFromCols',
    'isDateFilled','parseValidDate','calcDiffDiasISO','FASES','Date',giro);
  make(w,doc,'2026-10-15',[],()=>null,v=>Boolean(v),v=>v?new Date(v):null,()=>0,[],DataFixa);
  w.reFiltrarTabelaGiro();
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

function executarExportacao(email,{podeTransferir=true,dados,historico={master:{},sku:{}}}={}) {
  let owner='autor@empresa.com', editor='', criações=0, cabecalho=[], linhas=[];
  const sheet={setName(){},appendRow(row){cabecalho=row},getRange(){return {setFontWeight(){return this},
    setBackground(){return this},setFontColor(){return this},setValues(rows){linhas=rows;return this}}},
    autoResizeColumns(){},setFrozenRows(){}};
  const arquivo={getOwner:()=>({getEmail:()=>owner}),
    setOwner:dest=>{if(!podeTransferir)throw Error('Política');owner=dest},
    addEditor:dest=>{editor=dest}};
  const ss={getId:()=> 'id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/id',
    getActiveSheet:()=>sheet};
  const Sheets={create:()=>{criações++;return ss},flush(){}};
  const DriveApp={getFileById:()=>arquivo};
  const Utilities={formatDate:()=> '2026_10_15'};
  const Session={getActiveUser:()=>({getEmail:()=>email})};
  const fn=new Function('SpreadsheetApp','DriveApp','Utilities','Session','buscarHistoricoObsGiro',
    exportacao+'\nreturn gerarPlanilhaGiroFiltrado;')(Sheets,DriveApp,Utilities,Session,()=>historico);
  const entrada=dados||[{grafica:'A',marca:'COC',serie:'2º ANO',cd:'CD FOR',sku:'SKU',desc:'D',
    status:'Em Aberto',pendencia:'Coleta Mapa',dias:0,tiragem:100}];
  const resultado=fn(entrada);
  return {resultado,owner,editor,criações,cabecalho,linhas};
}

test('exportação transfere a propriedade para o autor autenticado quando permitido',()=>{
  const r=executarExportacao('colega@empresa.com');
  assert.equal(r.resultado.success,true);
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

test('excedente fica fora das pendências por padrão',()=>{
  const r=executarGiro({ee:'',estado:{ay:'COLETADO A MAIS',coletada:150},
    campos:{'TIRAGEM COLETADA':150},retornarTela:true,
    // Sem checkbox concluído, a situação aparece apenas no detalhe consultável.
    });
  assert.equal(r.linhas.length,0);
});
