const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const cache = fs.readFileSync(path.join(__dirname, '..', 'SalvaJson.js'), 'utf8');

test('front usa cache para Mapa de Saida e preserva cache ja carregado', () => {
  assert.equal((front.match(/\.getDadosMapaSaida\(\)/g) || []).length, 0);
  assert.ok((front.match(/\.getDadosMapaSaida_Cache\(\)/g) || []).length >= 2);
  assert.match(front, /if\s*\(window\.MAPA_SAIDA_CACHE\s*&&\s*Object\.keys\(window\.MAPA_SAIDA_CACHE\)\.length\)\s*return/);
});

test('cache do Mapa de Saida nao faz fallback para leitura direta', () => {
  const fn = cache.slice(cache.indexOf('function getDadosMapaSaida_Cache'));
  assert.doesNotMatch(fn, /return\s+getDadosMapaSaida\(\)/);
  assert.match(fn, /return\s+\{\}/);
});
