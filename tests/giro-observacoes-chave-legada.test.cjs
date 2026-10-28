const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname,'..');
const globais = fs.readFileSync(path.join(root,'Scripts_Globais_2.html'),'utf8');
const backend = fs.readFileSync(path.join(root,'Code.js'),'utf8');
const registro = fs.readFileSync(path.join(root,'Scripts_Giro_Registro.html'),'utf8')
  .replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');

function ambiente(master = {}, sku = {}) {
  const window = {HISTORICO_OBS_GIRO:{master,sku},addEventListener(){},setTimeout(){}};
  const document = {getElementById(){return null;},querySelectorAll(){return [];}};
  const ctx = vm.createContext({window,document,Date,Intl,console});
  const comeco = globais.indexOf('window.pgGiroChaveObs = function(tipo, chave) {');
  const fim = globais.indexOf('\n};',comeco) + 3;
  assert(comeco >= 0 && fim > comeco,'função de normalização encontrada');
  vm.runInContext(globais.slice(comeco,fim),ctx);
  const inicioBackend = backend.indexOf('function pgGiroNormalizarChave_(tipo, chave)');
  const fimBackend = backend.indexOf('\nfunction pgGiroTextoComparavel_',inicioBackend);
  assert(inicioBackend >= 0 && fimBackend > inicioBackend,'normalização do backend encontrada');
  vm.runInContext(backend.slice(inicioBackend,fimBackend),ctx);
  vm.runInContext(registro,ctx);
  return {window,normalizarServidor:ctx.pgGiroNormalizarChave_};
}
const evento = (id,data) => ({id,obs:id,data,user:'pcp'});

test('chaves atuais e antigas de série têm a mesma identidade no servidor e no portal',()=>{
  const {window,normalizarServidor}=ambiente();
  const antigos=['REPROSET|COC|9O ANO|V1|KN','WALPRINT|COC|2A SERIE|V4|KN'];
  const atuais=['REPROSET|COC|9º ANO|V1|KN','WALPRINT|COC|2ª SÉRIE|V4|KN'];
  for(let i=0;i<antigos.length;i++){
    assert.equal(normalizarServidor('MASTER',antigos[i]),window.pgGiroChaveObs('MASTER',atuais[i]));
  }
});

test('campo prioriza chave específica e histórico completo conserva a legada sem misturar outro CD ou envio',()=>{
  const {window}=ambiente({
    'REPROSET|COC|9O ANO':[evento('antiga','01/10/2026 10:00:00')],
    'REPROSET|COC|9º ANO|V1|CD JDI':[evento('jdi','02/10/2026 10:00:00')],
    'REPROSET|COC|9º ANO|V1|CD FOR':[evento('for','03/10/2026 10:00:00')],
    'REPROSET|COC|9º ANO|V2|CD FOR':[evento('outro-envio','04/10/2026 10:00:00')]
  });
  const ids = cd => Array.from(window.pgGiroHistoricoParaChave('MASTER',`REPROSET|COC|9º ANO|V1|${cd}`),e=>e.id).sort();
  assert.deepEqual(ids('CD JDI'),['jdi']);
  assert.deepEqual(ids('CD FOR'),['for']);
  const completos = cd => Array.from(window.pgGiroHistoricoCompletoParaChave('MASTER',`REPROSET|COC|9º ANO|V1|${cd}`),e=>e.id);
  assert.deepEqual(completos('CD JDI'),['jdi','antiga']);
  assert.deepEqual(completos('CD FOR'),['for','antiga']);
  assert.deepEqual(ids('CD RP'),['antiga'],'sem chave específica, campo recupera a legada');
  assert.equal(window.pgGiroHistoricoParaChave('MASTER','OUTRA|COC|9º ANO|V1|CD FOR').length,0);
});

test('histórico de recuperação mantém datas e nota atual no campo mesmo com legado recente',()=>{
  const {window}=ambiente({
    'GRAFICA|MARCA|6O ANO':[evento('recuperada-sem-cd','26/10/2026 18:00:00')],
    'GRAFICA|MARCA|6º ANO|V1|RAIZES':[
      evento('hoje','28/10/2026 15:21:31'),
      evento('recuperada-com-cd','22/10/2026 10:00:00')]
  });
  const chave='GRAFICA|MARCA|6º ANO|V1|RAIZES';
  const campo=window.pgGiroHistoricoParaChave('MASTER',chave);
  assert.deepEqual(Array.from(campo,e=>e.id),['hoje','recuperada-com-cd']);
  const historico=window.pgGiroHistoricoCompletoParaChave('MASTER',chave);
  assert.deepEqual(Array.from(historico,e=>e.id),['hoje','recuperada-sem-cd','recuperada-com-cd']);
  assert.equal(historico[1].data,'26/10/2026 18:00:00');
  assert.equal(campo[0].data,'28/10/2026 15:21:31');
});

test('série composta com barras conserva a observação legada no grupo correto',()=>{
  const {window}=ambiente({'META|CQT|9 ANO | 1 SERIE':[evento('composta','04/10/2026 10:00:00')]});
  const hist=window.pgGiroHistoricoParaChave('MASTER','META|CQT|9º ANO|1ª SÉRIE|V1|POSIGRAF');
  assert.equal(hist.length,1);
  assert.equal(hist[0].id,'composta');
  assert.equal(hist[0].pgObsLegada,true);
});

test('SKU legado com tiragem na chave não muda de destino e não duplica eventos',()=>{
  const {window,normalizarServidor}=ambiente({},{
    'META|COC|CCP26PP32312005|16|V1|KN':[evento('sku1','05/10/2026 10:00:00')],
    'META|COC|CCP26PP32312005|V1|KN':[evento('sku1','05/10/2026 10:00:00')]
  });
  assert.equal(normalizarServidor('SKU','META|COC|CCP26PP32312005|16|V1|KN'),
    'META|COC|CCP26PP32312005|V1|KN');
  const hist=window.pgGiroHistoricoParaChave('SKU','META|COC|CCP26PP32312005|V1|KN');
  assert.equal(hist.length,1,'um mesmo evento não pode aparecer duas vezes');
  assert.equal(window.pgGiroHistoricoParaChave('SKU','META|COC|CCP26PP32312005|V1|OUTRO').length,0);
});
