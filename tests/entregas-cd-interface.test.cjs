const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const script = name => fs.readFileSync(path.join(root,name),'utf8')
  .replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,'');

function montarInterface() {
  const nodes=new Map();
  const create = id => {
    const classes = new Set(['hidden']);
    let html = '';
    const element = {id,value:'',textContent:'',disabled:false,
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)}};
    Object.defineProperty(element,'innerHTML',{get:()=>html,set:value=>{
      html=String(value);
      if(id==='graficosEntregasCD') for(const match of html.matchAll(/id="([^"]+)"/g)) {
        if(!nodes.has(match[1]))nodes.set(match[1],create(match[1]));
      }
    }});
    return element;
  };
  nodes.set('graficosEntregasCD',create('graficosEntregasCD'));
  nodes.set('pgFiltroOrigem',create('pgFiltroOrigem'));
  nodes.get('pgFiltroOrigem').value='TODOS';
  const row = sku => ({_SOURCE:'PCP',CD_FINAL:'CD JDI',GRAFICA_FINAL:'LOGPRINT',MARCA_FINAL:'SAE',
    SKU_REAL:sku,serie_corrigida:'2ª SÉRIE',TIPO:'Aluno',TIRAGEM:100,
    'Coleta/Internalização de estoque final (re) plan':'2026-10-27',
    coletas:[{data:'2026-10-26',volume:25}],entregas:[]});
  const linhas=[row('SKU-01'),row('SKU-02')];
  let ultimoSalvamento,ultimaExtracao;
  let success;
  const run={
    withSuccessHandler(fn){success=fn;return this;},
    withFailureHandler(){return this;},
    getPrevisoesEntregaCDPortal(){success({success:true,previsoes:{}});},
    salvarPrevisaoEntregaCDPortal(payload){ultimoSalvamento=payload;success({success:true,previsao:{
      chave:payload.chave,dataColeta:payload.dataColeta,dataEntrega:payload.dataEntrega,
      observacao:payload.observacao,versao:payload.versaoEsperada+1,usuario:'analista@empresa',
      atualizadoEm:'2026-10-26T16:00:00Z'}});},
    gerarPlanilhaEntregasCD(payload){ultimaExtracao=payload;success({success:true,
      url:'https://docs.google.com/spreadsheets/d/123'});}
  };
  const google={script:{run}};
  const window={
    pgCampoColeta:(l,k)=>l[k],pgEhFonteAcabadora:()=>false,pgSolicitacaoCancelada:()=>false,
    pgLinhasUnicas:x=>x,pgBaseForecastFiltrada:x=>x,pgBaseGeralReportExecutiva:linhas,
    pgDataPlanoColetaLinha:l=>l['Coleta/Internalização de estoque final (re) plan'],
    pgDataPlanoEntregaSLA:(l,dt)=>{
      const d=new Date((dt||l['Coleta/Internalização de estoque final (re) plan'])+'T12:00:00Z');
      d.setUTCDate(d.getUTCDate()+2);return d.toISOString().slice(0,10);
    },
    pgVolumesColetaUnificadosV37:l=>({eventosColetaTP:l.coletas,eventosEntregaTP:l.entregas}),
    pgSerieCorrigidaFunil:l=>l.serie_corrigida,pgTPExportacaoPronta:()=>true
  };
  const ctx=vm.createContext({window,document:{getElementById:id=>nodes.get(id)||null},google,
    dtHojeISO:'2026-10-26',Date,Intl,console});
  vm.runInContext(script('Scripts_EntregasCD_Modelo.html'),ctx);
  vm.runInContext(script('Scripts_EntregasCD_Controle.html'),ctx);
  return {window,nodes,salvamento:()=>ultimoSalvamento,extracao:()=>ultimaExtracao};
}

test('processar Entregas CD monta os quadros, filtra e pagina sem gráfico',()=>{
  const {window,nodes}=montarInterface();
  window.processarEntregasCD();
  assert.match(nodes.get('ecdQuadro').innerHTML,/Coleta PCP original/);
  assert.match(nodes.get('ecdQuadro').innerHTML,/Entrega prevista \(saldo\)/);
  assert.match(nodes.get('ecdDetalhe').innerHTML,/SKU-01/);
  assert.match(nodes.get('ecdDetalhe').innerHTML,/Coleta vigente/);
  assert.equal(nodes.get('ecdContagem').textContent.startsWith('2 linhas'),true);
  assert(!nodes.get('graficosEntregasCD').innerHTML.includes('<canvas'));
  nodes.get('ecdBusca').value='SKU-02';
  window.pgECDRender();
  assert.match(nodes.get('ecdDetalhe').innerHTML,/SKU-02/);
  assert(!nodes.get('ecdDetalhe').innerHTML.includes('SKU-01'));
});

test('salvar usa versão esperada e exportar envia todas as linhas em duas abas',()=>{
  const {window,nodes,salvamento,extracao}=montarInterface();
  window.processarEntregasCD();
  nodes.get('ecdBusca').value='SKU-02';window.pgECDRender();
  window.pgECDAbrirEditor(0);
  assert(!nodes.get('ecdEditor').classList.contains('hidden'));
  nodes.get('ecdManualColeta').value='2026-10-29';
  nodes.get('ecdManualEntrega').value='2026-10-31';
  nodes.get('ecdManualObs').value='Confirmado com transportes';
  window.pgECDSalvar();
  assert.equal(salvamento().versaoEsperada,0);
  assert.equal(salvamento().dataColeta,'2026-10-29');
  assert.equal(salvamento().dataEntrega,'2026-10-31');
  assert(nodes.get('ecdEditor').classList.contains('hidden'));
  window.pgECDExportar(nodes.get('ecdExportar'));
  assert.deepEqual(JSON.parse(JSON.stringify(extracao().abas.map(x=>x.nome))),['Quadro','Base_SKUs']);
  assert.equal(extracao().abas[1].linhas.length,2,'não exporta apenas o SKU da busca local');
  assert.match(nodes.get('ecdAviso').innerHTML,/Abrir Quadro e Base_SKUs/);
});
