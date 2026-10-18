const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const helper = fonte.match(/window\.pgREPercentualExibido = function\(valor\) \{[\s\S]*?\n\};/);
assert.ok(helper, 'Função única de arredondamento da Report Executiva');

const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(helper[0], ctx);
const exibir = ctx.window.pgREPercentualExibido;

test('percentual sobe ao inteiro superior, sem ultrapassar 100%', () => {
  for (const [bruto, exibido] of [
    [0, 0], [0.01, 1], [86, 86], [86.0001, 87],
    [86.49, 87], [86.5, 87], [86.99, 87], [99.01, 100],
    [100, 100], [100.01, 100], [-1, 0], [NaN, 0]
  ]) {
    assert.equal(exibir(bruto), exibido, String(bruto));
  }
});

test('tabela, curva e tooltip usam o mesmo percentual exibido', () => {
  assert.match(fonte, /const pctTxt = v => \x60\$\{window\.pgREPercentualExibido\(v\)\}%\x60;/);
  assert.match(fonte, /const txt = \x60\$\{window\.pgREPercentualExibido\(valor\)\}%\x60;/);
  assert.match(fonte, /window\.pgREPercentualExibido\(context\.raw\)/);
  assert.equal(exibir(86.5), 87);
});

test('bolinhas de status seguem os percentuais exibidos', () => {
  assert.match(fonte, /const realExibido = window\.pgREPercentualExibido\(real\);/);
  assert.match(fonte, /const planExibido = window\.pgREPercentualExibido\(plan\);/);
});

test('cálculos e dados brutos da curva continuam sem arredondamento', () => {
  assert.match(fonte, /metaPct\.push\(total > 0 \? Math\.min\(100, \(meta \/ total\) \* 100\) : 0\);/);
  assert.match(fonte, /const pct = \(n, d\) => \{/);
  assert.match(fonte, /return Math\.max\(0, Math\.min\(100, \(Number\(n \|\| 0\) \/ d\) \* 100\)\);/);
});
