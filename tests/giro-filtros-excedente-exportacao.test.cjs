const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Scripts_Globais_2.html'), 'utf8');
const giro = source.slice(source.indexOf('window.reFiltrarTabelaGiro = function()'),
  source.indexOf('\n</script>', source.indexOf('window.reFiltrarTabelaGiro = function()')));
const servidor = fs.readFileSync(path.join(root, 'SalvaJson.js'), 'utf8');
const exportacao = servidor.slice(servidor.indexOf('function gerarPlanilhaGiroFiltrado(dados)'),
  servidor.indexOf('function gerarPlanilhaReportExecutiva('));

function executarGiro({min=-90,max=15,eventos=[],estado={},serie='Série nova',ee=''}) {
  const el = {};
  const linha = {TIRAGEM:100,SKU:'SKU-1',UNIDADE:'COC','GRÁFICA':'LOGPRINT',
    'CD DESTINO':'CD JDI',ENVIO:'V1','SÉRIE':'Série antiga',SERIE_CORRIGIDA:serie,
    'TIRAGEM TOTAL':100,'TIRAGEM COLETADA':estado.coletada||0, STATUS_EE:ee};
  const w = {
    GIRO_DADOS_RAW:[linha],GIRO_ETAPAS_SELECIONADAS:new Set(['Coleta Mapa','Coletado a mais']),
    GIRO_SORT_RULES:[],HISTORICO_OBS_GIRO:{master:{},sku:{}},CONTEXTOS_TEMP:{},
    pgObterResumoColeta:()=>({registros:[]}),pgEstadoColetaMapa:()=>({
      ay:'',total:100,coletada:0,saldo:0,pendente:false,parcial:false,concluida:false,...estado
    }),
    pgGiroSaldoPrazosV41:()=>({
      temCampos:true,totalPendente:eventos.reduce((s,e)=>s+e.volume,0),eventos
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
    checked:id==='chkGiroAberto',innerHTML:''}};
  const make = new Function('window','document','dtHojeISO','ETAPAS_MAPA','getValFromCols',
    'isDateFilled','parseValidDate','calcDiffDiasISO','FASES',giro);
  make(w,doc,'2026-10-15',[],()=>null,v=>Boolean(v),v=>v?new Date(v):null,()=>0,[]);
  w.reFiltrarTabelaGiro();
  return w.pgGiroLinhasExportar;
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

test('excedente AY aparece como pendência mesmo quando STATUS_EE é OK',()=>{
  const linhas=executarGiro({ee:'OK',estado:{ay:'COLETADO A MAIS',coletada:150}});
  assert.equal(linhas.length,1);
  assert.equal(linhas[0].pendencia,'Coletado a mais');
  assert.equal(linhas[0].tiragem,50);
});

function executarExportacao(email,{podeTransferir=true,dados,historico={master:{},sku:{}}}={}) {
  let owner='autor@empresa.com', editor='', criações=0, cabecalho=[], linhas=[];
  const sheet={setName(){},appendRow(row){cabecalho=row},getRange(){return {setFontWeight(){return this},
    setBackground(){return this},setFontColor(){return this},setValues(rows){linhas=rows;return this}}},
    autoResizeColumns(){}};
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
  assert.equal(idx,10);
  assert.equal(r.linhas[0][idx],'Geral: Prazo atualizado\nSKU: Aguardando gráfica');
  assert.equal(r.linhas[1][idx],'');
  assert.equal(r.linhas[0][3],'CD JDI');
  assert.equal(r.linhas[1][2],'2º ANO');
});
