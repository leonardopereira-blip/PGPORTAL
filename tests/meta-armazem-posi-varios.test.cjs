const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'abaMetaArmazem.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
if (!script) throw new Error('Motor Meta Armazém não encontrado');

function motor() {
  const w = { filtrosGeraisIniciados:true, aplicarFiltros(){ this.chamadas=(this.chamadas||0)+1; } };
  const ctx = { window:w, console, document:{} };
  vm.runInNewContext(script, ctx, { filename:'abaMetaArmazem.html' });
  return w;
}
const linha = (marca, extra={}) => ({
  MARCA_FINAL:marca, UNIDADE:marca, GRAFICA_FINAL:'POSIGRAF', CD_FINAL:'POSIGRAF',
  SEGMENTO:'ENSINO FUNDAMENTAL 2', TIPO:'ALUNO', 'SÉRIE':'Vários', ...extra
});

test('Posigraf CQT/SPE Vários usa a última data acordada da marca', () => {
  const w=motor();
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('CQT')), '2026-11-10');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE')), '2026-11-20');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{'SÉRIE':'6º ANO',serie_corrigida:'Vários'})), '2026-11-20');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{'SÉRIE':'6º ANO|7º ANO'})), '2026-11-20');
  assert.deepEqual(Array.from(w.pgMAMetasPossiveisDaLinha(linha('CQT'))), ['2026-10-15','2026-11-10']);
  assert.deepEqual(Array.from(w.pgMAMetasPossiveisDaLinha(linha('SPE'))), ['2026-10-15','2026-11-20']);
});

test('exceção Vários não modifica série específica, outras gráficas, CDs ou avaliação', () => {
  const w=motor();
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{'SÉRIE':'6º ANO'})), '2026-11-10');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{'SÉRIE':'1ª SERIE',SEGMENTO:'ENSINO MEDIO'})), '2026-11-12');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{GRAFICA_FINAL:'LOGPRINT'})), '2026-10-15');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{CD_FINAL:'CD JDI'})), '2026-10-15');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE',{AVALIACAO:'Sim'})), '2026-10-26');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('COC')), '2026-10-15');
});

test('cenário Combinado Posi Fere a Meta continua aplicando prazo original', () => {
  const w=motor();
  w.pgMACenario('sem');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('CQT')), '2026-10-15');
  assert.equal(w.pgMAMetaAplicadaDaLinha(linha('SPE')), '2026-10-15');
  assert.equal(w.chamadas, 1);
});
