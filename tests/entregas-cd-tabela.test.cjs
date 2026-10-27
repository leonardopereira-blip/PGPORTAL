const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const codigo = nome => fs.readFileSync(path.join(raiz, nome), 'utf8');
const extrairScript = nome => codigo(nome).replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, '');

const base = (extra={}) => ({_SOURCE:'PCP', CD_FINAL:'CD FOR', GRAFICA_FINAL:'LOGPRINT', MARCA_FINAL:'SAE',
  SKU_REAL:'AB123', 'serie_corrigida':'2ª SÉRIE', 'DESCRIÇÃO':'Aluno impresso', TIPO:'Aluno',
  CLIENTE_PERSONALIZADO:'Sim', CAPA_PERSONALIZADA:'Não', TIRAGEM:100,
  'Coleta/Internalização de estoque final (re) plan':'2026-10-20', ...extra});

function portal(linhas=[],registros={},op={}) {
  const hoje='2026-10-26';
  const dias=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const w={
    pgCampoColeta:(linha,n)=>linha[n],pgLinhasUnicas:x=>x,
    pgSolicitacaoCancelada:()=>false,pgEhFonteAcabadora:l=>l._SOURCE==='PCP_ACABADORAS',
    pgDataPlanoColetaLinha:l=>l['Coleta/Internalização de estoque final (re) plan'],
    pgDataPlanoEntregaSLA:(l,data)=>op.semSLA ? null : dias(data || l['Coleta/Internalização de estoque final (re) plan'],op.sla ?? 2),
    pgVolumesColetaUnificadosV37:l=>({eventosColetaTP:l.coletas||[],eventosEntregaTP:l.entregas||[],
      coleta:0,entrega:0,coletaTP:'',entregaTP:''}),
    pgSerieCorrigidaFunil:l=>l.serie_corrigida || l['SÉRIE'] || ''
  };
  const ctx=vm.createContext({window:w,console,Date,Intl,Map,Set});
  vm.runInContext(extrairScript('Scripts_EntregasCD_Modelo.html'),ctx);
  return {modelo:w.pgEntregasCDModelo,itens:w.pgEntregasCDModelo.montar(linhas,registros,hoje),w};
}

const plano=(i,v)=>({data:i,volume:v});
const plain = v => JSON.parse(JSON.stringify(v));

test('passado/presente/futuro mantém dois planos originais e eventos TP parciais com datas reais',()=>{
  const linha=base({coletas:[plano('2026-10-22',30),plano('2026-10-25',30)],
    entregas:[plano('2026-10-24',20),plano('2026-10-28',10)]});
  const {modelo,itens}=portal([linha]);
  const i=itens[0];
  assert.equal(i.total,100);assert.equal(i.coletado,60);assert.equal(i.entregue,20);
  assert.equal(i.aguardandoEntrega,40);assert.equal(i.pendenteColeta,40);assert.equal(i.saldo,80);
  assert.equal(i.status,'Coletado e aguardando entrega');
  assert.deepEqual(plain(i.datasEntrega),['2026-10-24']);
  assert.equal(i.dtColetaPCP,'2026-10-20');assert.equal(i.dtEntregaPCP,'2026-10-22');
  assert.equal(i.dtPrevisao,'2026-10-27');
  assert.equal(i.semPrevisaoVolume,50,'coleta PCP atrasada e parcela coletada com SLA vencido não recebem data inventada');
  const quadro=modelo.quadro(itens,'2026-10-20','2026-10-29');
  const get=nome=>quadro.linhas.find(r=>r.cd==='TOTAL GERAL'&&r.indicador===nome);
  assert.equal(get('Coleta PCP original').valores[0],100);
  assert.equal(get('Entrega PCP + SLA original').valores[2],100);
  assert.equal(get('Coletado TP').total,60);
  assert.equal(get('Entregue TP').total,20);
  assert.equal(get('Entrega prevista (saldo)').total,30,'somente a parcela coletada em 25/10 com SLA futuro');
  assert.equal(get('Saldo sem previsão').semData,50,'parcelas coletadas com SLA vencido e não coletadas continuam sem data');
});

test('previsão manual de entrega prevalece para todo saldo; somente coleta manual aplica SLA por parcela',()=>{
  const linha=base({coletas:[plano('2026-10-25',35)],entregas:[plano('2026-10-26',10)]});
  const chave=portal([linha]).itens[0].chave;
  const somenteColeta=portal([linha],{[chave]:{dataColeta:'2026-10-28',versao:1}}).itens[0];
  assert.equal(somenteColeta.dtColetaPrevista,'2026-10-28');
  assert.equal(somenteColeta.origemColetaPrevisao,'Manual');
  assert.equal(somenteColeta.saldo,90);
  assert.equal(somenteColeta.previsoesEntrega.reduce((s,p)=>s+p.volume,0),90);
  assert.deepEqual(plain(somenteColeta.previsoesEntrega.map(p=>[p.data,p.volume,p.origem])),
    [['2026-10-27',25,'Coleta TP + SLA'],['2026-10-30',65,'Coleta manual + SLA']]);
  const manual=portal([linha],{[chave]:{dataColeta:'2026-10-28',dataEntrega:'2026-10-29'}}).itens[0];
  assert.deepEqual(plain(manual.previsoesEntrega.map(p=>[p.data,p.volume,p.origem])),
    [['2026-10-29',90,'Manual']]);
  assert.equal(manual.origemPrevisao,'Manual');
});

test('previsão manual vencida não cai silenciosamente para o PCP ou para hoje',()=>{
  const linha=base({'Coleta/Internalização de estoque final (re) plan':'2026-10-27'});
  const chave=portal([linha]).itens[0].chave;
  const i=portal([linha],{[chave]:{dataColeta:'2026-10-23',dataEntrega:'2026-10-25'}}).itens[0];
  assert.equal(i.dtColetaManual,'2026-10-23');assert.equal(i.dtEntregaManual,'2026-10-25');
  assert.equal(i.dtColetaPrevista,'');assert.equal(i.dtPrevisao,'');
  assert.equal(i.origemPrevisao,'Manual vencida');assert.equal(i.semPrevisaoVolume,100);
  assert.equal(i.dtEntregaPCP,'2026-10-29');
});

test('sem SLA válido não inventa previsão; entrega manual explícita ainda funciona',()=>{
  const linha=base({'Coleta/Internalização de estoque final (re) plan':'2026-10-29'});
  const {itens}=portal([linha],{},{semSLA:true});
  assert.equal(itens[0].dtEntregaPCP,'');assert.equal(itens[0].semPrevisaoVolume,100);
  const chave=itens[0].chave;
  const manual=portal([linha],{[chave]:{dataEntrega:'2026-11-02'}},{semSLA:true}).itens[0];
  assert.equal(manual.dtPrevisao,'2026-11-02');assert.equal(manual.semPrevisaoVolume,0);
});

test('acabadora usa total CD inclusive zero explícito; movimento futuro não é TP realizado',()=>{
  const itens=portal([base({_SOURCE:'PCP_ACABADORAS','TIRAGEM A ENTREGAR (total por CD)':0,TIRAGEM:100,
    coletas:[plano('2026-10-27',90)],entregas:[plano('2026-10-29',90)]})]).itens;
  assert.equal(itens[0].total,0);assert.equal(itens[0].coletado,0);assert.equal(itens[0].entregue,0);
  assert.equal(itens[0].status,'Coletado e entregue');
});

test('movimentos do mesmo mapa não duplicam entre PCP e acabadora',()=>{
  const movimento={data:'2026-10-25',volume:40,linhaMapa:123};
  const linhas=[base({coletas:[movimento]}),base({_SOURCE:'PCP_ACABADORAS',coletas:[movimento],
    'TIRAGEM A ENTREGAR (total por CD)':30})];
  const itens=portal(linhas).itens;
  assert.equal(itens.reduce((s,i)=>s+i.coletado,0),40);
});

test('Sheets tem Quadro + Base_SKUs, datas e números em base zero e exporta toda a base',()=>{
  const linhas=[base({SKU_REAL:'001'}),base({SKU_REAL:'002',CD_FINAL:'CD JDI'})];
  const {modelo,itens}=portal(linhas);
  const abas=modelo.exportar(itens,'2026-10-20','2026-10-30');
  assert.deepEqual(plain(abas.map(s=>s.nome)),['Quadro','Base_SKUs']);
  assert.equal(abas[1].linhas.length,2);
  assert.deepEqual(plain(abas[1].colunasData),[22,23,24,25,26,27]);
  assert.deepEqual(plain(abas[1].colunasNumero),[15,16,17,18,19,20,21,37,38]);
  assert.deepEqual(plain(abas[0].colunasNumero),Array.from({length:abas[0].cabecalho.length-2},(_,i)=>i+2));
  for (const spec of abas) assert(spec.linhas.every(r=>r.length===spec.cabecalho.length));
  for(const nome of ['SKU','Marca','Série','Descrição','Personalizado','Tipo','Status',
    'Coleta TP (datas reais)','Entrega TP (datas reais)','Coleta PCP original',
    'Entrega PCP + SLA original','Coleta manual','Entrega manual','Origem da previsão']) {
    assert(abas[1].cabecalho.includes(nome),nome);
  }
});

test('interface está incluída depois do modelo e mantém funções legadas de Entregas CD',()=>{
  const index=codigo('Index.html');
  assert(index.indexOf("include('Scripts_EntregasCD_Modelo')") < index.indexOf("include('abaEntregasCD')"));
  assert(index.indexOf("include('abaEntregasCD')") < index.indexOf("include('Scripts_EntregasCD_Controle')"));
  const tela=codigo('abaEntregasCD.html');
  assert.match(tela,/pgCalcularEntregaCDFunil/);assert.match(tela,/pgExportarVisaoEntregaCD/);
  const ui=codigo('Scripts_EntregasCD_Controle.html');
  for(const nome of ['pgECDRender','pgECDSalvar','pgECDExportar','getPrevisoesEntregaCDPortal',
    'salvarPrevisaoEntregaCDPortal','gerarPlanilhaEntregasCD']) assert(ui.includes(nome),nome);
});
