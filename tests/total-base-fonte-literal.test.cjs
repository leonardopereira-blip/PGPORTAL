const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('Atualizar da Produção regenera apenas o cache de Produção', () => {
  const ini = source.indexOf('function atualizarDadosGeral()');
  const fim = source.indexOf('window.pgSolicitacaoCancelada', ini);
  const bloco = source.slice(ini, fim);
  assert.match(bloco, /\.atualizarCacheDashboard\(\)/);
  assert.doesNotMatch(bloco, /getDadosDashboard\(\)/);
  assert.doesNotMatch(bloco, /atualizarTodoOCache/);
});

test('Total Base usa fonte literal separada das demais visões', () => {
  assert.match(source, /window\.DADOS_PCP_TOTAL_FONTE = dadosFonte\.slice\(\)/);
  assert.match(source, /const baseGeralTotal = \(window\.DADOS_PCP_TOTAL_FONTE \|\| window\.dadosGlobais \|\| \[\]\)\.filter/);
  const ini = source.indexOf('const baseGeralTotal =');
  const fim = source.indexOf('// Base já com todos os filtros globais', ini);
  const bloco = source.slice(ini, fim);
  assert.doesNotMatch(bloco, /pgSolicitacaoCancelada/);
  assert.doesNotMatch(bloco, /pgLinhasUnicas/);
});

test('Total canônico aplica Origem/Destino sobre a fonte literal', () => {
  assert.match(source, /const baseOrigemTotal = baseGeralTotal\.filter/);
  assert.match(source, /let totalCanonico = graficaAcabadoraExclusivo[\s\S]*?baseOrigemTotal\.filter/);
  assert.match(source, /tGeral \+= tBaseCanon/);
});
