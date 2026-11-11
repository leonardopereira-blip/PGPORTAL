const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Eventos_TP.html'), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const hoje = '2026-11-11';
const dataManual = '2026-11-10';
const linha = extra => ({
  _SOURCE: 'PCP', MARCA_FINAL: 'SAS', GRAFICA_FINAL: 'BRADESCO',
  'GRÁFICA_MAPA': 'BRADESCO', ENVIO: 'V1', SKU_REAL: 'SKU-SAS', CD_MAPA: 'CD RP',
  'TIRAGEM COLETADA': 200, Coleta_TP: '2026-11-08', Entrega_TP: dataManual,
  TIRAGEM: 200, GIRO_TOTAL_BA: 200, ...extra
});
const movimento = (l, extra = {}) => ({
  eventoTPVersao: 2, linhaMapa: 2, codigoMapa: 'MP-1', chaveMapa: 'CHAVE-MAPA',
  marca: l.MARCA_FINAL, grafica: l['GRÁFICA_MAPA'] || l.GRAFICA_FINAL,
  sku: l.SKU_REAL || l.SKU, destino: l._SOURCE === 'ACABADORA' ? l['CD DESTINO'] : l.CD_MAPA,
  envio: l.ENVIO, volumeColetado: 100, volumeSolicitado: 100,
  coletaTP: '2026-11-04', entregaTP: '2026-11-06', ...extra
});
function portal(l, movimentos = []) {
  const w = {
    dadosGlobais: [l],
    MAPA_SAIDA_CACHE: { __agendaTPCompleta: true, __forecastTP: { conferido: true },
      __eventosTPAtuais: movimentos },
    pgNumeroPrazoV35: v => Number(v) || 0
  };
  vm.runInNewContext(script, { window: w });
  return w;
}
const simples = e => JSON.parse(JSON.stringify(e));
const entrega = (w, l) => w.pgEventosTPLinha(l, 'entrega', hoje, l['TIRAGEM COLETADA'], l.Entrega_TP);
const datasVolumes = eventos => Array.from(eventos, e => [e.data, e.volume]);

for (const [nome, extra] of [
  ['SAS Bradesco', {}],
  ['PC', { MARCA_FINAL: 'PC', SKU_REAL: 'SKU-PC' }],
  ['acabadora COC', { _SOURCE: 'ACABADORA', MARCA_FINAL: 'COC', GRAFICA_FINAL: 'FELK',
    'GRÁFICA_MAPA': 'FELK', SKU_REAL: 'SKU-COC', SKU: 'SKU-COC', 'CD DESTINO': 'CD RP', ENVIO: '' }]
]) test(nome + ': entrega manual complementa o mapa com sua propria data', () => {
  const l = linha(extra), m = movimento(l), w = portal(l, [m]);
  const eventos = entrega(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-06', 100], [dataManual, 100]]);
  assert.equal(eventos[0].codigoMapa, 'MP-1');
  assert.equal(eventos[0].linhaMapa, 2);
  assert.equal(eventos.conciliacao.modo, 'mesclado');
  assert.equal(eventos.conciliacao.motivo, 'entrega-manual-complementar-pcp');
  assert.equal(eventos.conciliacao.volumeComplementarPCP, 100);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 200);
  assert.equal(w.pgSomaEventosTP(eventos, '2026-11-09'), 100);
  assert.equal(w.pgSomaEventosTP(eventos, l.Coleta_TP, 'dia'), 0,
    'a data da coleta nao antecipa a entrega manual');
  assert.equal(entrega(w, l), eventos, 'consultas repetidas reutilizam o resultado sem somar novamente');
  assert.equal(w.pgSomaEventosTP(entrega(w, l), hoje), 200);
  assert.equal(m.volumeColetado, 100);
  assert.equal(m.entregaTP, '2026-11-06');
});

test('entrega manual valida independe de Coleta_TP manual ausente', () => {
  const l = linha({ Coleta_TP: '' }), w = portal(l, [movimento(l)]);
  assert.deepEqual(datasVolumes(entrega(w, l)), [['2026-11-06', 100], [dataManual, 100]]);
});

test('entrega conciliada preserva as datas de cada mapa e ignora a data agregada do PCP', () => {
  const l = linha(), w = portal(l, [movimento(l), movimento(l, {
    linhaMapa: 3, codigoMapa: 'MP-2', entregaTP: '2026-11-09'
  })]);
  const eventos = entrega(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-06', 100], ['2026-11-09', 100]]);
  assert.equal(eventos.conciliacao.modo, 'eventos');
  assert.equal(eventos.conciliacao.motivo, 'an-realizado-por-data');
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 200);
});

test('entrega com AN zero usa somente a quantidade manual positiva e datada', () => {
  const l = linha(), w = portal(l, [movimento(l, {
    volumeColetado: 0, volumeSolicitado: 9999, entregaTP: null
  })]);
  const eventos = entrega(w, l);
  assert.deepEqual(datasVolumes(eventos), [[dataManual, 200]]);
  assert.equal(eventos.conciliacao.volumeComplementarPCP, 200);
});

test('entrega com PCP menor que AN usa o PCP uma unica vez na data de entrega', () => {
  const l = linha({ 'TIRAGEM COLETADA': 80 }), w = portal(l, [movimento(l)]);
  const eventos = entrega(w, l);
  assert.deepEqual(simples(eventos), [{ data: dataManual, volume: 80 }]);
  assert.equal(eventos.conciliacao.modo, 'legado');
  assert.equal(eventos.conciliacao.motivo, 'entrega-manual-pcp');
  assert.equal(w.pgSomaEventosTP(eventos, '2026-11-09'), 0);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 80);
});

test('entrega sem mapa da identidade continua seguindo o PCP datado', () => {
  const l = linha(), w = portal(l, [movimento(l, { sku: 'OUTRO-SKU' })]);
  const eventos = entrega(w, l);
  assert.deepEqual(simples(eventos), [{ data: dataManual, volume: 200 }]);
  assert.equal(eventos.conciliacao.motivo, 'realizado-sem-parcelas');
});

test('entrega exige quantidade positiva e nao recupera AN com PCP zerado', () => {
  for (const n of [0, -1, null, NaN]) {
    const l = linha({ 'TIRAGEM COLETADA': n }), w = portal(l, [movimento(l)]);
    const eventos = entrega(w, l);
    assert.deepEqual(simples(eventos), [], String(n));
    assert.equal(eventos.conciliacao.motivo, 'sem-volume-formula');
  }
});

test('entrega exige sua propria data manual valida ate hoje, mesmo com coleta realizada', () => {
  for (const dt of ['', null, '2026-02-30', '2026-11-12']) {
    const l = linha({ Entrega_TP: dt }), w = portal(l, [movimento(l)]);
    const eventos = entrega(w, l);
    assert.deepEqual(simples(eventos), [], String(dt));
    assert.equal(eventos.conciliacao.motivo, 'quantidade-nao-concilia-tiragem-coletada');
  }
  const l = linha({ Entrega_TP: hoje }), w = portal(l, [movimento(l)]);
  assert.deepEqual(datasVolumes(entrega(w, l)), [['2026-11-06', 100], [hoje, 100]]);
});

test('complemento de entrega desconta AN futuro e sem data antes de calcular o saldo manual', () => {
  for (const dt of [null, '2026-11-12']) {
    const l = linha({ 'TIRAGEM COLETADA': 250, TIRAGEM: 250, GIRO_TOTAL_BA: 250 });
    const w = portal(l, [movimento(l), movimento(l, {
      linhaMapa: 3, codigoMapa: 'MP-2', entregaTP: dt
    })]);
    const eventos = entrega(w, l);
    assert.deepEqual(datasVolumes(eventos), [['2026-11-06', 100], [dataManual, 50]], String(dt));
    assert.equal(eventos.conciliacao.volumeComplementarPCP, 50);
    assert.equal(w.pgSomaEventosTP(eventos, hoje), 150,
      'a parcela AN sem entrega realizada nao se transforma em entrega manual');
  }
});

test('entrega conciliada com parcela futura ou sem data mantem o descarte atual', () => {
  for (const dt of [null, '2026-11-12']) {
    const l = linha(), w = portal(l, [movimento(l), movimento(l, {
      linhaMapa: 3, codigoMapa: 'MP-2', entregaTP: dt
    })]);
    const eventos = entrega(w, l);
    assert.deepEqual(datasVolumes(eventos), [['2026-11-06', 100]], String(dt));
    assert.equal(eventos.conciliacao.modo, 'eventos');
    assert.equal(eventos.conciliacao.motivo, 'an-realizado-por-data');
    assert.equal(w.pgSomaEventosTP(eventos, hoje), 100);
  }
});

test('entrega mantem a correcao 2x nas datas de cada parcela do mapa', () => {
  const l = linha(), w = portal(l, [movimento(l, { volumeColetado: 250 }),
    movimento(l, { linhaMapa: 3, codigoMapa: 'MP-2', volumeColetado: 150,
      entregaTP: '2026-11-09' })]);
  const eventos = entrega(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-06', 125], ['2026-11-09', 75]]);
  assert.equal(eventos.conciliacao.fatorDuplicidade, 0.5);
  assert.equal(eventos.conciliacao.motivo, 'an-realizado-corrigido-2x');
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 200);
});

test('complemento de entrega usa AN ja corrigido em 2x', () => {
  const l = linha({ 'TIRAGEM COLETADA': 250 }), w = portal(l, [movimento(l, { volumeColetado: 400 })]);
  const eventos = entrega(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-06', 200], [dataManual, 50]]);
  assert.equal(eventos.conciliacao.fatorDuplicidade, 0.5);
  assert.equal(eventos.conciliacao.volumeComplementarPCP, 50);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 250);
});

test('entrega manual nao altera a tiragem e a data da agenda com AN zero', () => {
  const l = linha({ 'TIRAGEM AGENDADA': 80 });
  const w = portal(l, [movimento(l, { volumeColetado: 0, volumeSolicitado: 80,
    coletaTP: null, entregaTP: null, dataAgendada: '2026-11-13' })]);
  entrega(w, l);
  const eventos = w.pgEventosAgendaMapaLinha(l, hoje, 80, '2026-11-13');
  assert.deepEqual(datasVolumes(eventos), [['2026-11-13', 80]]);
  assert.equal(eventos.conciliacao.motivo, 'tiragem-agendada-por-parcela');
});
