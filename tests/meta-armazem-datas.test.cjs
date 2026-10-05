const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'abaMetaArmazem.html'), 'utf8');

test('Meta Armazem usa realizado e depois somente replan, sem fallback de baseline', () => {
  assert.match(source, /Coleta\/Internalização de estoque Final Real/);
  assert.match(source, /Coleta\/Internalização de estoque final \(re\) plan/);
  assert.match(source, /fimColetaUsada=fimRealColeta\|\|fimReplanColeta\|\|null/);
  assert.doesNotMatch(source, /pgDataPlanoColetaLinha/);
  assert.match(source, /baseline não é utilizada/);
});

test('volume realizado no CD é classificado pela data real', () => {
  assert.match(source, /realCDRaw=campo\('TIRAGEM CONFIRMADA CD'\)/);
  assert.match(source, /dtRealCD=data\(l\._DT_ENTREGUE_CD_REAL/);
  assert.match(source, /realDentro=function\(meta\)/);
  assert.match(source, /semDataReal=realCD>0&&!dtRealCD\?realCD:0/);
});

test('saldo previsto usa apenas o volume ainda não realizado', () => {
  assert.match(source, /pendentePlanejado=Math\.max\(0,total-realCD\)/);
  assert.match(source, /pendentePlanejado\*rateio\.fracao/);
  assert.match(source, /rateioDia:rateio&&!rateio\.entregaUnica\?pendentePlanejado\/rateio\.dias:null/);
});
