const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('CD Destino visual usa CD_MAPA', () => {
  assert.match(source, /'CD Destino': 'CD_MAPA'/);
  assert.match(source, /categoria !== 'CD Destino'/);
  assert.match(source, /: \(l\.CD_MAPA \?\? ''\)/);
});

test('roteamento PCP usa WALPRINT e REPROSET no destino, preservando as graficas de origem', () => {
  const inicio = source.indexOf("    const PG_ACABADORAS = ['HR'");
  const fim = source.indexOf('    function pgCasaGrafica(', inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  const trecho = source.slice(inicio, fim);

  const context = vm.createContext({ window: {} });
  vm.runInContext(trecho, context);
  const w = context.window;

  const row = (grafica, cdMapa) => ({
    _SOURCE: 'PCP',
    'GRÁFICA': grafica,
    CD_MAPA: cdMapa
  });

  assert.equal(w.pgEhDestinoAcabadora(row('WALPRINT', 'CD JDI')), false);
  assert.equal(w.pgEhDestinoAcabadora(row('REPROSET', 'CD FOR')), false);
  assert.equal(w.pgEhDestinoAcabadora(row('LOGPRINT', 'WALPRINT')), true);
  assert.equal(w.pgEhDestinoAcabadora(row('LOGPRINT', 'REPROSET')), true);
  assert.equal(w.pgEhDestinoAcabadora(row('LOGPRINT', '')), true);
  assert.equal(w.pgEhDestinoCD(row('WALPRINT', 'CD JDI')), true);
  assert.equal(w.pgEhDestinoCD(row('REPROSET', 'CD FOR')), true);
  assert.equal(w.pgEhDestinoCD(row('LOGPRINT', 'WALPRINT')), false);
  assert.equal(w.pgEhDestinoCD(row('LOGPRINT', 'REPROSET')), false);
  assert.equal(w.pgEhDestinoCD(row('LOGPRINT', '')), false);
  assert.equal(w.pgEhDestinoCD(row('LOGPRINT', 'CD JDI')), true);
});

test('CD DESTINO original nao substitui CD_MAPA vazio na PCP', () => {
  assert.match(source, /const cdPCP = fonteAcabadora[\s\S]*?: \(l\['CD_MAPA'\] \?\? ''\)/);
});
