const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'abaMetaArmazem.html'), 'utf8');

test('Meta Armazem usa TIRAGEM COLETADA com Entrega_TP como realizado', () => {
  assert.match(source, /coletadaBruta=Math\.min\(total,volume\(campo\('TIRAGEM COLETADA'\)\)\)/);
  assert.match(source, /entregaTPRaw=campo\('Entrega_TP'\)\|\|l\.DATA_EA\|\|''/);
  assert.match(source, /realizadoTem=coletadaBruta>0&&!!dtEntregaTP/);
  assert.match(source, /realDentro=function\(meta\)\{return realizado>0&&dtEntregaTP<=meta\?realizado:0;\}/);
  assert.doesNotMatch(source, /TIRAGEM CONFIRMADA CD/);
  assert.doesNotMatch(source, /_DT_ENTREGUE_CD_REAL/);
});

test('somente o saldo nao realizado usa o replan', () => {
  assert.match(source, /pendentePlanejado=Math\.max\(0,total-realizado\)/);
  assert.match(source, /rateio=pendentePlanejado>0&&replanValido&&inicioPlan&&dtPlan/);
  assert.match(source, /pendentePlanejado\*rateio\.fracao/);
  assert.match(source, /rateioDia:rateio&&!rateio\.entregaUnica\?pendentePlanejado\/rateio\.dias:null/);
});

test('coletado sem Entrega_TP volta ao planejamento em vez de Sem previsao', () => {
  assert.match(source, /var realizado=realizadoTem\?coletadaBruta:0/);
  assert.match(source, /var pendentePlanejado=Math\.max\(0,total-realizado\)/);
  assert.match(source, /var semData=pendentePlanejado>0&&!rateioAplicado\?pendentePlanejado:0/);
  assert.doesNotMatch(source, /semDataReal/);
});

test('Meta Armazem nao usa baseline e invalida replan ausente ou invertido', () => {
  assert.match(source, /replanValido=!!inicioColeta&&!!fimReplanColeta&&fimReplanColeta>=inicioColeta/);
  assert.match(source, /fimReplanColeta<inicioColeta\?'Coleta Fim \(re\)plan anterior ao início'/);
  assert.doesNotMatch(source, /COLETA\/INTERNALIZAÇÃO FIM BASELINE/);
  assert.doesNotMatch(source, /Coleta\/Internalização de estoque Final Real/);
});

test('Visao e Tipo de material usam menus suspensos de selecao unica', () => {
  assert.match(source, /<select id="maVisao"/);
  assert.match(source, /<select id="maTipoMaterial"/);
  assert.match(source, /window\.pgMATipoMaterial=function/);
  assert.match(source, /estado\.tipoMaterial==='TODOS'\?base:base\.filter/);
});
