const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','Scripts_Giro_Registro.html'),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,'');
function el(value='') {
  const e={value,defaultValue:value,dataset:{},children:[],disabled:false,attributes:{},textContent:'',
    setAttribute(k,v){this.attributes[k]=v;},appendChild(c){this.children.push(c);c.parentElement=this;return c;},
    querySelector(sel){return this.children.find(c=>sel==='[data-pg-registro-status]'&&c.dataset.pgRegistroStatus)||null;},
    classList:{contains:()=>false}};
  return e;
}
function app() {
  const chamadas=[],listeners={},inputs=[],timers=[];let renders=0;
  const document={activeElement:null,hidden:false,createElement:()=>el(),getElementById:()=>null,
    querySelectorAll:s=>s==='[data-pg-previsoes]'?inputs.filter(i=>i.dataset.pgPrevisoes):s==='[data-pg-obs-chave]'?inputs.filter(i=>i.dataset.pgObsChave):[]};
  const builder=()=>{
    let ok,fail; const run=new Proxy({}, {get:(_,nome)=>nome==='withSuccessHandler'?(f)=>{ok=f;return run;}:
      nome==='withFailureHandler'?(f)=>{fail=f;return run;}:(...args)=>chamadas.push({nome,args,ok,fail})});return run;
  };
  const window={HISTORICO_OBS_GIRO:{master:{},sku:{}},CONTEXTOS_TEMP:{},PG_ECD_PREVISOES:{},
    reFiltrarTabelaGiro:()=>{renders++;},setTimeout:f=>{timers.push(f);return timers.length;},
    crypto:{randomUUID:(()=>{let n=0;return ()=>'uuid-0000000-'+(++n);})()},
    addEventListener:(n,f)=>(listeners[n]||=[]).push(f),
    dispatchEvent:e=>(listeners[e.type]||[]).forEach(f=>f(e)),
    pgEntregasCDModelo:{chave:l=>l.chave}};
  const c={window,document,google:{script:{get run(){return builder();}}},Intl,Date,console,
    CustomEvent:class{constructor(type,props){this.type=type;Object.assign(this,props);}},dtHojeISO:'2026-10-27'};
  vm.createContext(c);vm.runInContext(source,c);
  const input=value=>{const i=el(value);i.parentElement=el();i.parentElement.appendChild(i);inputs.push(i);return i;};
  return {window,document,chamadas,input,inputs,renders:()=>renders};
}
const chave=sku=>JSON.stringify(['ECD1','PCP','COC','LOGPRINT',sku,'CD FOR','V1','','','']);
test('observação aparece imediatamente, mantém campo livre e confirma sem redesenhar Giro',()=>{
  const a=app(),i=a.input('Analista confirmou');
  a.window.salvarObsFront('SKU','CHAVE',i);
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.CHAVE[0].obs,'Analista confirmou');
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.CHAVE[0].pendente,true);
  assert.equal(i.disabled,false);assert.equal(a.chamadas.length,1);
  const req=a.chamadas[0];assert.equal(req.nome,'salvarObsGiroPortal');
  req.ok({success:true,id:req.args[4],tipo:'SKU',chave:'CHAVE',obs:req.args[2],data:'27/10/2026 11:30:00',user:'ana@arco'});
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.CHAVE.length,1);
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.CHAVE[0].pendente,false);
  assert.equal(a.renders(),0);assert.equal(a.window.pgGiroRegistroEstado.pendentes.size,0);
});
test('duas notas no mesmo campo preservam ordem de envio e cada intenção tem ID próprio',()=>{
  const a=app(),i=a.input('Primeira');a.window.salvarObsFront('MASTER','K',i);
  i.value='Segunda';a.window.salvarObsFront('MASTER','K',i);
  assert.equal(a.chamadas.length,1);assert.equal(a.window.HISTORICO_OBS_GIRO.master.K.length,2);
  a.chamadas[0].ok({success:true,id:a.chamadas[0].args[4],tipo:'MASTER',chave:'K',obs:'Primeira',data:'27/10/2026 10:00:00'});
  assert.equal(a.chamadas.length,2);assert.equal(a.chamadas[1].args[2],'Segunda');
  assert.notEqual(a.chamadas[0].args[4],a.chamadas[1].args[4]);
});
test('falha conserva nota e repetir reusa o ID para não duplicar',()=>{
  const a=app(),i=a.input('Texto preservado');a.window.salvarObsFront('SKU','K',i);
  const req=a.chamadas[0];req.fail({message:'sem rede'});
  assert.equal(a.window.pgGiroRegistroEstado.pendentes.size,1);
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].erro,true);
  const status=i.parentElement.querySelector('[data-pg-registro-status]');
  status.children.at(-1).onclick();assert.equal(a.chamadas.length,2);
  assert.equal(a.chamadas[1].args[4],req.args[4]);assert.equal(i.value,'Texto preservado');
});
test('nova nota depois de falha retoma a primeira requisição e escoa a fila sem perder texto',()=>{
  const a=app(),i=a.input('Primeira');a.window.salvarObsFront('SKU','K',i);
  const primeira=a.chamadas[0];primeira.fail({message:'rede indisponível'});
  i.value='Segunda';a.window.salvarObsFront('SKU','K',i);
  assert.equal(a.chamadas.length,2);assert.equal(a.chamadas[1].args[4],primeira.args[4]);
  a.chamadas[1].ok({success:true,id:primeira.args[4],tipo:'SKU',chave:'K',obs:'Primeira',data:'27/10/2026 10:00:00'});
  assert.equal(a.chamadas.length,3);assert.equal(a.chamadas[2].args[2],'Segunda');
});
test('delta incorpora notas de outro usuário sem apagar o rascunho no campo',()=>{
  const a=app(),i=a.input('Rascunho ainda digitando');
  i.dataset={pgObsTipo:'SKU',pgObsChave:'K',pgObsSalva:'Nota antiga'};
  a.window.OBS_GIRO_CARREGADO=true;a.window.pgGiroSincronizar();
  a.chamadas[0].ok({success:true,alterado:true,parcial:true,revisao:{id:'r2'},
    historico:{sku:{K:[{id:'outro',obs:'Nota de outra pessoa',user:'bia',data:'27/10/2026 11:30:00'}]}}});
  assert.equal(i.value,'Rascunho ainda digitando');
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].obs,'Nota de outra pessoa');
});
test('Nova data faz um patch em lote e atualiza o mesmo cache usado pelo calendário',()=>{
  const a=app(),k1=chave('SKU1'),k2=chave('SKU2'),i=a.input('2026-10-30');
  a.window.PG_ECD_PREVISOES[k1]={dataColeta:'2026-10-28',dataEntrega:'2026-10-29',versao:1};
  i.dataset={pgPrevisoes:JSON.stringify([k1,k2]),pgDataSalva:''};
  a.window.pgGiroSalvarNovaData(i);
  assert.equal(a.window.PG_ECD_PREVISOES[k1].dataEntrega,'2026-10-30');
  assert.equal(a.window.PG_ECD_PREVISOES[k1].dataColeta,'2026-10-28');
  const req=a.chamadas[0];assert.equal(req.nome,'salvarPrevisoesEntregaCDPortal');
  assert.equal(req.args[0].previsoes.length,2);assert.equal(req.args[0].previsoes[0].campos.join(','),'dataEntrega');
  req.ok({success:true,previsoes:{[k1]:{dataEntrega:'2026-10-30',versao:2},[k2]:{dataEntrega:'2026-10-30',versao:1}}});
  assert.equal(i.disabled,false);assert.equal(i.dataset.pgDataSalva,'2026-10-30');
});
test('falha de Nova data restaura somente a própria edição otimista',()=>{
  const a=app(),k=chave('SKU1'),i=a.input('2026-10-30');
  a.window.PG_ECD_PREVISOES[k]={dataEntrega:'2026-10-29',versao:1};
  i.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:'2026-10-29'};
  a.window.pgGiroSalvarNovaData(i);
  a.window.PG_ECD_PREVISOES[k]={dataEntrega:'2026-11-02',versao:3};
  a.chamadas[0].fail({message:'sem rede'});
  assert.equal(a.window.PG_ECD_PREVISOES[k].dataEntrega,'2026-11-02');
  assert.equal(i.dataset.pgDataSalva,'2026-10-29');assert.equal(i.disabled,false);
});
test('falha sem edição concorrente desfaz a previsão provisória e preserva texto para retry',()=>{
  const a=app(),k=chave('SKU1'),i=a.input('2026-10-30');
  a.window.PG_ECD_PREVISOES[k]={dataEntrega:'2026-10-29',versao:1};
  i.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:'2026-10-29'};
  a.window.pgGiroSalvarNovaData(i);a.chamadas[0].fail({message:'sem rede'});
  assert.equal(a.window.PG_ECD_PREVISOES[k].dataEntrega,'2026-10-29');
  assert.equal(i.value,'2026-10-30');assert.equal(i.disabled,false);
});
test('nova intenção substitui retry de data antiga para a mesma chave',()=>{
  const a=app(),k=chave('SKU1'),i=a.input('2026-10-30');
  i.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:''};
  a.window.pgGiroSalvarNovaData(i);a.chamadas[0].fail({message:'sem rede'});
  i.value='2026-11-02';a.window.pgGiroSalvarNovaData(i);
  assert.equal(a.window.pgGiroRegistroEstado.datasPendentes.size,1);
  assert.equal(a.chamadas[1].args[0].previsoes[0].dataEntrega,'2026-11-02');
  assert.notEqual(a.chamadas[0].args[0].requestId,a.chamadas[1].args[0].requestId);
});
test('snapshot completo parcial de origem conserva histórico carregado e notas ainda não confirmadas',()=>{
  const a=app(),i=a.input('Pendente');
  a.window.HISTORICO_OBS_GIRO.sku.EXCLUIDA=[{id:'antigo',obs:'Excluída na origem'}];
  a.window.salvarObsFront('SKU','K',i);a.window.pgGiroSincronizar();
  a.chamadas[1].ok({success:true,alterado:true,parcial:false,historico:{master:{},sku:{}},previsoes:{},revisao:{id:'r'}});
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.EXCLUIDA[0].obs,'Excluída na origem');
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].obs,'Pendente');
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].pendente,true);
});

test('recuperação histórica durante digitação preserva foco, rascunho e nota atual até sair do campo',()=>{
  const a=app(),k='GRAFICA|MARCA|6 ANO|V1|RAIZES',i=a.input('Rascunho ainda digitando');
  let aoSair;
  i.tagName='INPUT';
  i.addEventListener=(nome,fn)=>{if(nome==='blur')aoSair=fn;};
  i.dataset={pgObsTipo:'MASTER',pgObsChave:k,pgObsSalva:'Nota de hoje'};
  a.document.activeElement=i;
  a.document.getElementById=id=>id==='abaGiroSemanal'?{classList:{contains:()=>false}}:null;
  a.window.HISTORICO_OBS_GIRO.master[k]=[
    {id:'hoje',data:'28/10/2026 15:21:31',obs:'Nota de hoje',user:'ana'}];
  a.window.pgGiroSincronizar();
  a.chamadas.find(c=>c.nome==='buscarHistoricoObsGiroLeve').ok({success:true,historico:{master:{[k]:[
    {id:'recuperada',data:'26/10/2026 09:24:12',obs:'Observação recuperada',user:'bia'}]},sku:{}}});
  assert.equal(i.value,'Rascunho ainda digitando');
  assert.equal(i.dataset.pgObsSalva,'Nota de hoje');
  assert.equal(a.document.activeElement,i);
  assert.equal(a.renders(),0,'recuperação aguarda blur antes de redesenhar a linha');
  assert.deepEqual(Array.from(a.window.HISTORICO_OBS_GIRO.master[k],e=>e.id),['hoje','recuperada']);
  assert.equal(a.window.pgGiroHistoricoParaChave('MASTER',k)[0].obs,'Nota de hoje');
  assert.equal(typeof aoSair,'function');
  aoSair();
  assert.equal(a.renders(),1);
});
test('campo compartilhado calcula data comum e não aceita chave sem destino',()=>{
  const a=app(),k=chave('SKU1');a.window.PG_ECD_PREVISOES[k]={dataEntrega:'2026-10-30'};
  const h=a.window.pgGiroCampoNovaData([{chave:k}],'data1');assert.match(h,/value="2026-10-30"/);
  const invalida=JSON.stringify(['ECD1','PCP','COC','LOGPRINT','SKU1','N/A','V1','','','']);
  assert.doesNotMatch(a.window.pgGiroCampoNovaData([{chave:invalida}],'data2'),/<input/);
});

test('Nova data conserva pedido e retry no campo recriado depois de ordenar ou filtrar',()=>{
  const a=app(),k=chave('SKU1'),original=a.input('2026-10-30');
  a.window.PG_ECD_PREVISOES[k]={dataEntrega:'2026-10-29',dataColeta:'2026-10-28',versao:1};
  original.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:'2026-10-29'};
  a.window.pgGiroSalvarNovaData(original);
  const req=a.chamadas[0],requestId=req.args[0].requestId;
  a.inputs.splice(a.inputs.indexOf(original),1);
  const novo=a.input('2026-10-30');
  novo.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:'2026-10-30'};
  a.window.reFiltrarTabelaGiro();
  assert.equal(novo.disabled,true);
  assert.equal(novo.dataset.pgDataPendente,requestId);
  req.fail({message:'rede indisponível'});
  assert.equal(novo.disabled,false);
  assert.equal(novo.value,'2026-10-30','preserva a intenção no campo atual');
  const status=novo.parentElement.querySelector('[data-pg-registro-status]');
  assert.match(status.textContent,/rede indisponível/);
  status.children.at(-1).onclick();
  assert.equal(a.chamadas[1].args[0].requestId,requestId,'retry reusa o ID do lote');
  assert.equal(novo.disabled,true);
  a.chamadas[1].ok({success:true,previsoes:{[k]:{dataEntrega:'2026-10-30',dataColeta:'2026-10-28',versao:2}}});
  assert.equal(novo.disabled,false);
  assert.equal(novo.dataset.pgDataPendente,undefined);
  assert.equal(novo.dataset.pgDataSalva,'2026-10-30');
  assert.equal(novo.parentElement.querySelector('[data-pg-registro-status]').textContent,'Salvo');
  assert.equal(a.window.pgGiroRegistroEstado.datasPendentes.size,0);
});

test('falha de data com linha escondida reaparece com retry quando o filtro retorna',()=>{
  const a=app(),k=chave('SKU1'),original=a.input('2026-10-30');
  a.window.PG_ECD_PREVISOES[k]={dataEntrega:'2026-10-29',versao:1};
  original.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:'2026-10-29'};
  a.window.pgGiroSalvarNovaData(original);
  a.inputs.splice(a.inputs.indexOf(original),1);a.window.reFiltrarTabelaGiro();
  a.chamadas[0].fail({message:'rede indisponível'});
  const novo=a.input('2026-10-29');
  novo.dataset={pgPrevisoes:JSON.stringify([k]),pgDataSalva:'2026-10-29'};
  a.window.reFiltrarTabelaGiro();
  assert.equal(novo.value,'2026-10-30');
  assert.match(novo.parentElement.querySelector('[data-pg-registro-status]').textContent,/Data não salva/);
});

test('snapshot completo conserva falha de nota e reenviar limpa o erro com o mesmo ID',()=>{
  const a=app(),i=a.input('Falhou');a.window.salvarObsFront('SKU','K',i);
  const req=a.chamadas[0];req.fail({message:'sem rede'});
  a.window.pgGiroSincronizar();
  a.chamadas[1].ok({success:true,alterado:true,parcial:false,historico:{master:{},sku:{}},previsoes:{},revisao:{id:'r'}});
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].erro,true);
  a.window.reFiltrarTabelaGiro();
  const status=i.parentElement.querySelector('[data-pg-registro-status]');
  assert.match(status.textContent,/Falha ao salvar/);
  status.children.at(-1).onclick();
  assert.equal(a.chamadas[2].args[4],req.args[4]);
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].erro,undefined);
});

test('resposta atrasada da nota A não substitui nota B posterior salva no mesmo segundo',()=>{
  const a=app(),i=a.input('Nota A');a.window.salvarObsFront('SKU','K',i);
  const req=a.chamadas[0];
  a.window.OBS_GIRO_CARREGADO=true;a.window.pgGiroSincronizar();
  a.chamadas[1].ok({success:true,alterado:true,parcial:true,revisao:{id:'r2'},
    historico:{sku:{K:[{id:'nota-B',obs:'Nota B',user:'bia',data:'27/10/2026 11:30:00',sequencia:3}]}}});
  req.ok({success:true,id:req.args[4],tipo:'SKU',chave:'K',obs:'Nota A',
    data:'27/10/2026 11:30:00',sequencia:2});
  assert.equal(a.window.HISTORICO_OBS_GIRO.sku.K[0].obs,'Nota B');
  assert.equal(i.value,'Nota B','campo livre acompanha o registro confirmado mais recente');
});

test('histórico reaparece mesmo quando a sincronização combinada de previsões falha',()=>{
  const a=app(),k='GRAFICA|MARCA|SERIE|V1|CD',i=a.input('');
  a.document.getElementById=id=>id==='abaGiroSemanal'?{classList:{contains:()=>false}}:null;
  i.dataset={pgObsTipo:'MASTER',pgObsChave:k,pgObsSalva:''};
  a.window.pgGiroSincronizar();
  assert.deepEqual(a.chamadas.map(c=>c.nome).sort(),['buscarAtualizacoesGiroPortal','buscarHistoricoObsGiroLeve']);
  a.chamadas.find(c=>c.nome==='buscarAtualizacoesGiroPortal').fail({message:'Falha na previsão de CD'});
  a.chamadas.find(c=>c.nome==='buscarHistoricoObsGiroLeve').ok({success:true,historico:{master:{[k]:[
    {id:'hist-1',data:'27/10/2026 10:00:00',obs:'Obs recuperada',user:'ana'}]},sku:{}}});
  assert.equal(a.window.HISTORICO_OBS_GIRO.master[k][0].obs,'Obs recuperada');
  assert.equal(i.value,'Obs recuperada');
  assert.equal(a.window.OBS_GIRO_CARREGADO,true);
  assert.equal(a.renders(),1);
});
test('snapshot combinado vazio não apaga observação recuperada e retry não duplica histórico',()=>{
  const a=app(),k='GRAFICA|MARCA|SERIE|V1|CD';
  a.document.getElementById=id=>id==='abaGiroSemanal'?{classList:{contains:()=>false}}:null;
  a.window.pgGiroSincronizar();
  a.chamadas.find(c=>c.nome==='buscarHistoricoObsGiroLeve').ok({success:true,historico:{master:{[k]:[
    {id:'hist-1',data:'27/10/2026 10:00:00',obs:'Preservada'}]},sku:{}}});
  a.chamadas.find(c=>c.nome==='buscarAtualizacoesGiroPortal').ok({success:true,alterado:true,parcial:false,
    historico:{master:{},sku:{}},previsoes:{},revisao:{id:'r1'}});
  assert.equal(a.window.HISTORICO_OBS_GIRO.master[k][0].obs,'Preservada');
  a.window.pgGiroSincronizar();
  assert.equal(a.chamadas.length,3,'leitura de recuperação roda uma vez após sucesso');
  a.chamadas[2].ok({success:true,alterado:true,parcial:true,
    historico:{master:{[k]:[{id:'hist-1',data:'27/10/2026 10:00:00',obs:'Preservada'}]}},
    previsoes:{},revisao:{id:'r2'}});
  assert.equal(a.window.HISTORICO_OBS_GIRO.master[k].length,1);
});

test('recuperação atualiza filtros por observação mesmo após primeira sincronização vazia',()=>{
  const a=app(),k='GRAFICA|MARCA|SERIE|V1|CD';
  a.document.getElementById=id=>id==='abaGiroSemanal'?{classList:{contains:()=>false}}:null;
  a.window.pgGiroSincronizar();
  a.chamadas.find(c=>c.nome==='buscarAtualizacoesGiroPortal').ok({success:true,alterado:true,parcial:false,
    historico:{master:{},sku:{}},previsoes:{},revisao:{id:'r1'}});
  assert.equal(a.renders(),1);
  a.chamadas.find(c=>c.nome==='buscarHistoricoObsGiroLeve').ok({success:true,historico:{master:{[k]:[
    {id:'hist-1',data:'27/10/2026 10:00:00',obs:'Voltou'}]},sku:{}}});
  assert.equal(a.renders(),2,'o filtro da tabela deve refletir as observações recuperadas');
  assert.equal(a.window.HISTORICO_OBS_GIRO.master[k][0].obs,'Voltou');
});
