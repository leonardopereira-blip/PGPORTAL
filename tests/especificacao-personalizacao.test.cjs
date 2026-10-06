const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leitura = fs.readFileSync(path.join(__dirname, '..', 'LeituraCacheSheets.js'), 'utf8');
const code = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('Especificacao cruza somente as colunas pedidas por SKU', () => {
  assert.match(leitura, /'Especificacao'!B2:B/);
  assert.match(leitura, /'Especificacao'!Q2:Q/);
  assert.match(leitura, /'Especificacao'!BU2:BU/);
  assert.match(leitura, /CAPA PERSONALIZADA/);
});

test('dashboard grava Sim ou Nao por SKU para os dois filtros', () => {
  assert.match(code, /CLIENTE_PERSONALIZADO/);
  assert.match(code, /CAPA_PERSONALIZADA/);
  assert.match(code, /aplicarEspecificacao\(obj\)/);
  assert.match(code, /esp && esp\.clientePersonalizado \? "Sim" : "Não"/);
  assert.match(code, /esp && esp\.capaPersonalizada \? "Sim" : "Não"/);
});

test('Cliente personalizado e Capa personalizada sao filtros gerais', () => {
  assert.match(front, /'Cliente personalizado': new Set\(\)/);
  assert.match(front, /'Capa personalizada': new Set\(\)/);
  assert.match(front, /'Cliente personalizado': 'CLIENTE_PERSONALIZADO'/);
  assert.match(front, /'Capa personalizada': 'CAPA_PERSONALIZADA'/);
});
