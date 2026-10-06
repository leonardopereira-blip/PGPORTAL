const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

function total(linhas) {
  const context = vm.createContext({
    window: { arredondar: Number },
    linhasBaseCanonica: linhas
  });
  vm.runInContext(source.slice(source.indexOf('    const pgChavesLinhas ='),
    source.indexOf('    // As visões por fase compartilham')), context);
  const inicio = source.indexOf('    const baseTotalCanonica =');
  assert.ok(inicio >= 0, 'Total usa a identidade das linhas da base canônica');
  vm.runInContext(source.slice(inicio, source.indexOf('    // IMPORTANTE:', inicio)) +
    '\nresultado = Object.values(baseTotalCanonica).reduce((a, b) => a + b, 0);', context);
  return context.resultado;
}

const row = (id, tiragem, fonte = 'PCP') => ({
  _ROW_ID: id, _SOURCE: fonte, Chave: 'MESMA-OP-SKU', TIRAGEM: tiragem,
  UNIDADE: 'SAS', 'GRÁFICA': 'LOGPRINT'
});

test('Total preserva lotes físicos distintos da mesma OP/SKU', () => {
  assert.equal(total([row('PCP:2', 100), row('PCP:3', 250)]), 350);
});

test('reenvio da mesma linha em outra fatia não infla o Total', () => {
  assert.equal(total([row('PCP:2', 100), row('PCP:2', 100), row('PCP:3', 250)]), 350);
});

test('linhas físicas das duas fontes conservam suas tiragens', () => {
  assert.equal(total([row('2', 100), row('2', 60, 'ACABADORA')]), 160);
});
