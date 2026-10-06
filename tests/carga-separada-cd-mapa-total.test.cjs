const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'Main.html'), 'utf8');
const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('abertura do portal carrega somente fontes de Produção', () => {
  const inicio = main.indexOf('const fontesBackground = [');
  const fim = main.indexOf('];', inicio);
  const bloco = main.slice(inicio, fim + 2);
  assert.match(bloco, /getMatrizSLAPortal/);
  assert.match(bloco, /getForecastsColetaPortal/);
  assert.match(bloco, /getDadosCockpit_Cache/);
  assert.match(bloco, /getDadosMapaSaida_Cache/);
  assert.doesNotMatch(bloco, /getDadosPreProducao_Cache/);
  assert.doesNotMatch(bloco, /getDadosQualidade_Cache/);
  assert.doesNotMatch(bloco, /getDadosPPM_Cache/);
  assert.doesNotMatch(bloco, /getDadosAlocacao_Cache/);
  assert.doesNotMatch(bloco, /getDadosChamados_Cache/);
  assert.doesNotMatch(bloco, /getDadosInspecaoCDs_Cache/);
});

test('PCP usa CD_MAPA diretamente no filtro e roteamento', () => {
  assert.match(front, /'CD Destino': 'CD_MAPA'/);
  assert.match(front, /categoria !== 'CD Destino'/);
  assert.match(front, /: \(l\.CD_MAPA \?\? ''\)/);
  assert.match(front, /const cdPCP = fonteAcabadora[\s\S]*?: \(l\['CD_MAPA'\] \?\? ''\)/);
});

test('Total Base geral não é substituído pela referência bruta alternativa', () => {
  assert.match(front, /const pgTotalBrutoV56 = tGeral;/);
  assert.match(front, /00 - Total Base \(\$\{window\.formatarBR\(pgTotalBrutoV56\)\}/);
});
