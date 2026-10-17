const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fonte = arquivo => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
const codigo = fonte('Code.js');
const filtros = fonte('Scripts_Globais_2.html');
const armazem = fonte('abaMetaArmazem.html');
const auditoria = fonte('AuditoriaMetaArmazem.js');
const exportador = fonte('ExportadorExcel.html');

test('PES deixa a carga somente quando a marca e PES e envio e V1', () => {
  assert.match(codigo, /return marca === 'PES' && envio === 'V1'/);
  assert.equal((codigo.match(/if \(pgExcluirPESV1_\(obj\)\) continue;/g) || []).length, 2);
});

test('Avaliacao EI vira Sim/Nao e aparece nos filtros gerais', () => {
  assert.match(codigo, /obj\["AVALIACAO"\] = personalizacaoSimNao\(dataPCP\[i\]\[138\]\)/);
  assert.match(filtros, /'Avaliação': new Set\(\['Sim', 'Não'\]\)/);
  assert.match(filtros, /'Avaliação': 'AVALIACAO'/);
});

test('Avaliacao Sim fixa meta em 26\/10 sem interferencia da Posi', () => {
  assert.match(armazem, /META_AVALIACAO = '2026-10-26'/);
  assert.match(armazem, /avaliacaoSim\?META_AVALIACAO:metaOriginal\(marca\)/);
  assert.match(armazem, /elegivel=!avaliacaoSim&&!!regras&&dataAcordada>alvo/);
});

test('Auditoria exporta mesmo conjunto de colunas, sem OP e com Tipo na posição original', () => {
  const a = armazem.match(/var cabecalho=\[([\s\S]*?)\];/);
  const b = auditoria.match(/var colunas = \[([\s\S]*?)\];/);
  assert.ok(a && b);
  const extrair = s => [...s.matchAll(/'([^']+)'/g)].map(m => m[1]);
  const cols = extrair(a[1]);
  assert.deepEqual(cols, extrair(b[1]));
  assert.equal(cols[36], 'Tipo');
  assert.ok(cols.indexOf('Entregue Geral') > cols.indexOf('Tipo'));
  assert.ok(!cols.includes('OP'));
  assert.ok(!cols.includes('Série original'));
  assert.equal(cols.filter(nome=>nome==='Personalização').length,1);
});

test('Percentuais mostram graficas fora e XLSX possui fallback e tipos', () => {
  assert.match(armazem, /function detalhePercentualMeta\(resumo,modo\)/);
  assert.match(armazem, /Gráficas fora:/);
  assert.match(armazem, /window\.pgGerarExcelAbas/);
  assert.match(exportador, /'Entrega TP real'/);
  assert.match(exportador, /'Tiragem coletada'/);
});
