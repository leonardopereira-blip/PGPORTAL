const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('base do denominador ignora destino, mas respeita origem selecionada', () => {
  assert.match(source, /filtroExtra\(l,\s*\{\s*ignorarOrigem:\s*true,\s*ignorarDestino:\s*true\s*\}\)/);
  assert.match(source, /if\s*\(daOrigem\)\s*window\.dadosSemFiltroCD\.push\(l\)/);
  assert.match(source, /\[l\._SOURCE,\s*l\.BASE,\s*l\._base\]\.some/);
});

test('filtro extra permite ignorar destino separadamente da origem', () => {
  assert.match(source, /if\s*\(!opcoes\.ignorarOrigem\s*&&\s*origem\s*!==\s*'TODOS'/);
  assert.match(source, /if\s*\(!opcoes\.ignorarDestino\s*&&\s*destino\s*!==\s*'TODOS'\)/);
});
