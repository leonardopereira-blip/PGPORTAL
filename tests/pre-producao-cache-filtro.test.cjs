const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'PreProducao.html'), 'utf8');

test('Pre usa cache da PGBM na abertura antes de buscar novamente', () => {
  assert.match(source, /window\.receberDadosPreProd = function/);
  assert.match(source, /window\.DADOS_PREPROD_CACHE && window\.receberDadosPreProd/);
});

test('filtro ENVIO 1 é reconciliado com a base carregada', () => {
  assert.match(source, /const enviosValidos = new Set/);
  assert.match(source, /if \(selecoesFiltrosPre\.envio\.length === 0 && enviosValidos\.has\('1'\)\)/);
  assert.match(source, /selecoesFiltrosPre\.envio = \['1'\]/);
});

test('Atualizar Base continua lendo getDadosPreProducao da PGBM', () => {
  assert.match(source, /\.getDadosPreProducao\(\);/);
});
