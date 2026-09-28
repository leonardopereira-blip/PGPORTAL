const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const loader = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');

test('Giro Semanal mostra serie real mesmo quando um grupo tem coleta parcial', () => {
  // A tabela principal possui duas interpolacoes: tooltip e texto visivel.
  const expressoes = front.match(/String\(g\.serie \?\? '-'\)/g) || [];
  assert.equal(expressoes.length, 2, 'tooltip e texto devem usar exclusivamente g.serie');
  assert.doesNotMatch(front, /g\.coletadoAMenos\s*\?\s*g\.cd\s*:\s*g\.serie/);

  for (const expr of expressoes) {
    for (const g of [
      { serie: '2 SERIE', cd: 'CD JDI', coletadoAMenos: true },
      { serie: '6 ANO', cd: 'RAIZES', coletadoAMenos: true },
      { serie: 'INF IV', cd: 'POSIGRAF', coletadoAMenos: true },
      { serie: '3 ANO', cd: 'KN', coletadoAMenos: false }
    ]) {
      assert.equal(vm.runInNewContext(expr, { g }), g.serie);
    }
    assert.equal(vm.runInNewContext(expr, { g: { cd: 'CD JDI', coletadoAMenos: true } }), '-');
  }
});

test('Giro mantem CD em campo separado e agrupamento preserva serie e destino', () => {
  assert.match(front, /let serie = String\(l\["SÉRIE"\]/);
  assert.match(front, /let cd = String\(l\["CD DESTINO"\]/);
  assert.match(front, /chaveGrupo = `\$\{grafica\}\|\$\{marca\}\|\$\{serie\}\|\$\{envio\}\|\$\{cd\}`/);
  assert.match(front, /<th class="p-1\.5 border-r border-slate-200">CD Destino<\/th>/);
  assert.match(loader, /var headersPCP = dataPCP\[0\]\.map\(limparHeader\)/);
  assert.match(loader, /var headersAcab = dataAcab\[0\]\.map\(limparHeader\)/);
});
