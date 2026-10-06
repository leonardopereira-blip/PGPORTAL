const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('PCP_ACABADORAS usa TIRAGEM A ENTREGAR e nao elimina linha por CARACTERISTICA=CANCELADO', () => {
  assert.match(code, /if\(dataAcab\[i\]\.length > 43\) obj\["TIRAGEM"\] = dataAcab\[i\]\[43\] \|\| 0/);
  assert.doesNotMatch(code, /statusAcab[\s\S]{0,180}if\s*\(statusAcab\s*===\s*"CANCELADO"\)\s*continue/);
});

test('Total Base soma literalmente cada linha canonica filtrada', () => {
  assert.match(front, /let tGeral = 0;/);
  assert.match(front, /linhasBaseCanonica\.forEach\(l => \{[\s\S]*?tGeral \+= tBaseCanon;/);
  assert.doesNotMatch(front, /baseTotalCanonica\[chaveCanon\]/);
});

test('roteamento especial continua: vazio WALPRINT e REPROSET vao para Acabadora', () => {
  assert.match(front, /PG_GRAFICAS_FORCAM_ACABADORA = new Set\(\['WALPRINT', 'REPROSET'\]\)/);
  assert.match(front, /return pgDestinoVazio\(l\) \|\|[\s\S]*?pgGraficaForcaAcabadora\(l\)/);
});
