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
  'GRÁFICA_MAPA': 'BRADESCO', ENVIO: 'V1', SKU_REAL: 'SKU-SAS',
  CD_MAPA: 'CD RP', 'TIRAGEM COLETADA': 200, Coleta_TP: dataManual,
  TIRAGEM: 200, GIRO_TOTAL_BA: 200, ...extra
});
const movimento = (l, extra = {}) => ({
  eventoTPVersao: 2, linhaMapa: 2, codigoMapa: 'MP-1', chaveMapa: 'CHAVE-MAPA',
  marca: l.MARCA_FINAL, grafica: l['GRÁFICA_MAPA'] || l.GRAFICA_FINAL,
  sku: l.SKU_REAL || l.SKU, destino: l._SOURCE === 'ACABADORA' ? l['CD DESTINO'] : l.CD_MAPA,
  envio: l.ENVIO, volumeColetado: 100, volumeSolicitado: 100,
  coletaTP: '2026-11-05', entregaTP: '2026-11-06', ...extra
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
const coleta = (w, l) => w.pgEventosTPLinha(l, 'coleta', hoje, l['TIRAGEM COLETADA'], l.Coleta_TP);
const datasVolumes = eventos => Array.from(eventos, e => [e.data, e.volume]);

for (const [nome, extra] of [
  ['SAS Bradesco', {}],
  ['PC', { MARCA_FINAL: 'PC', SKU_REAL: 'SKU-PC' }],
  ['acabadora COC', { _SOURCE: 'ACABADORA', MARCA_FINAL: 'COC',
    GRAFICA_FINAL: 'FELK', 'GRÁFICA_MAPA': 'FELK', SKU_REAL: 'SKU-COC',
    SKU: 'SKU-COC', 'CD DESTINO': 'CD RP', ENVIO: '' }]
]) test(nome + ': complemento manual preserva a parcela do mapa e fecha no PCP', () => {
  const l = linha(extra), m = movimento(l);
  const w = portal(l, [m]), eventos = coleta(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-05', 100], [dataManual, 100]]);
  assert.equal(eventos[0].codigoMapa, 'MP-1');
  assert.equal(eventos[0].linhaMapa, 2);
  assert.equal(eventos.conciliacao.modo, 'mesclado');
  assert.equal(eventos.conciliacao.motivo, 'coleta-manual-complementar-pcp');
  assert.equal(eventos.conciliacao.volumeComplementarPCP, 100);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 200);
  assert.equal(w.pgSomaEventosTP(eventos, '2026-11-09'), 100);
  assert.equal(w.pgSomaEventosTP(eventos, dataManual, 'dia'), 100);
  assert.equal(w.pgEventosTPLinha(l, 'coleta', hoje, 200, dataManual), eventos);
  assert.equal(w.pgSomaEventosTP(coleta(w, l), hoje), 200, 'consultar de novo nao duplica a coleta');
  assert.equal(m.volumeColetado, 100, 'nao altera a fonte do mapa');
  assert.equal(m.coletaTP, '2026-11-05');
});

test('mapa conciliado conserva as parcelas e datas existentes mesmo com outra data no PCP', () => {
  const l = linha(), w = portal(l, [movimento(l), movimento(l, {
    linhaMapa: 3, codigoMapa: 'MP-2', coletaTP: '2026-11-07'
  })]);
  const eventos = coleta(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-05', 100], ['2026-11-07', 100]]);
  assert.equal(eventos.conciliacao.modo, 'eventos');
  assert.equal(eventos.conciliacao.motivo, 'an-realizado-por-data');
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 200);
});

test('AN zero permite a coleta manual datada sem transformar o solicitado em realizado', () => {
  const l = linha(), w = portal(l, [movimento(l, { volumeColetado: 0,
    volumeSolicitado: 9999, coletaTP: null })]);
  const eventos = coleta(w, l);
  assert.deepEqual(datasVolumes(eventos), [[dataManual, 200]]);
  assert.equal(eventos.conciliacao.volumeComplementarPCP, 200);
});

test('PCP menor que AN usa somente a quantidade e a data manuais', () => {
  const l = linha({ 'TIRAGEM COLETADA': 80 }), w = portal(l, [movimento(l)]);
  const eventos = coleta(w, l);
  assert.deepEqual(simples(eventos), [{ data: dataManual, volume: 80 }]);
  assert.equal(eventos.conciliacao.modo, 'legado');
  assert.equal(eventos.conciliacao.motivo, 'coleta-manual-pcp');
  assert.equal(w.pgSomaEventosTP(eventos, '2026-11-09'), 0);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 80, 'nao soma a quantidade do mapa');
});

test('sem parcelas da identidade a coleta continua seguindo o PCP datado', () => {
  const l = linha(), w = portal(l, [movimento(l, { sku: 'OUTRO-SKU' })]);
  const eventos = coleta(w, l);
  assert.deepEqual(simples(eventos), [{ data: dataManual, volume: 200 }]);
  assert.equal(eventos.conciliacao.motivo, 'realizado-sem-parcelas');
});

test('quantidade zerada nao recupera AN nem cria complemento', () => {
  const l = linha({ 'TIRAGEM COLETADA': 0 }), w = portal(l, [movimento(l)]);
  const eventos = coleta(w, l);
  assert.deepEqual(simples(eventos), []);
  assert.equal(eventos.conciliacao.motivo, 'sem-volume-formula');
});

test('complemento exige data manual valida e realizada; hoje e aceito', () => {
  for (const dt of ['', null, '2026-02-30', '2026-11-12']) {
    const l = linha({ Coleta_TP: dt }), w = portal(l, [movimento(l)]);
    const eventos = coleta(w, l);
    assert.deepEqual(simples(eventos), [{ data: '2026-11-05', volume: 100 }], String(dt));
    assert.equal(eventos.conciliacao.motivo, 'an-realizado-por-data',
      'sem data manual válida não apaga o realizado confirmado pelo mapa');
  }
  const l = linha({ Coleta_TP: hoje }), w = portal(l, [movimento(l)]);
  assert.deepEqual(datasVolumes(coleta(w, l)), [['2026-11-05', 100], [hoje, 100]]);
});

test('complemento nao abrange parcelas AN futuras ou sem data', () => {
  for (const dt of [null, '2026-11-12']) {
    const l = linha({ 'TIRAGEM COLETADA': 250, TIRAGEM: 250, GIRO_TOTAL_BA: 250 });
    const w = portal(l, [movimento(l), movimento(l, {
      linhaMapa: 3, codigoMapa: 'MP-2', coletaTP: dt
    })]);
    const eventos = coleta(w, l);
    assert.deepEqual(datasVolumes(eventos), [['2026-11-05', 100], [dataManual, 50]], String(dt));
    assert.equal(eventos.conciliacao.volumeComplementarPCP, 50);
    assert.equal(w.pgSomaEventosTP(eventos, hoje), 150,
      'os 100 ja cobertos por AN sem data realizada nao viram complemento');
  }
});

test('mapa conciliado com parcela futura ou sem data mantem o descarte atual', () => {
  for (const dt of [null, '2026-11-12']) {
    const l = linha(), w = portal(l, [movimento(l), movimento(l, {
      linhaMapa: 3, codigoMapa: 'MP-2', coletaTP: dt
    })]);
    const eventos = coleta(w, l);
    assert.deepEqual(datasVolumes(eventos), [['2026-11-05', 100]], String(dt));
    assert.equal(eventos.conciliacao.modo, 'eventos');
    assert.equal(eventos.conciliacao.motivo, 'an-realizado-por-data');
    assert.equal(w.pgSomaEventosTP(eventos, hoje), 100);
  }
});

test('correcao de duplicidade 2x permanece soberana e nao vira complemento', () => {
  const l = linha(), w = portal(l, [movimento(l, { volumeColetado: 250 }),
    movimento(l, { linhaMapa: 3, codigoMapa: 'MP-2', volumeColetado: 150,
      coletaTP: '2026-11-07' })]);
  const eventos = coleta(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-05', 125], ['2026-11-07', 75]]);
  assert.equal(eventos.conciliacao.fatorDuplicidade, 0.5);
  assert.equal(eventos.conciliacao.motivo, 'an-realizado-corrigido-2x');
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 200);
});

test('complemento e calculado depois da correcao 2x de AN', () => {
  const l = linha({ 'TIRAGEM COLETADA': 250 }), w = portal(l, [movimento(l, { volumeColetado: 400 })]);
  const eventos = coleta(w, l);
  assert.deepEqual(datasVolumes(eventos), [['2026-11-05', 200], [dataManual, 50]]);
  assert.equal(eventos.conciliacao.fatorDuplicidade, 0.5);
  assert.equal(eventos.conciliacao.volumeComplementarPCP, 50);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 250);
});

test('coleta e entrega recebem complementos nas respectivas datas manuais', () => {
  const l = linha({ Entrega_TP: hoje }), w = portal(l, [movimento(l)]);
  const eventosColeta = coleta(w, l);
  const eventosEntrega = w.pgEventosTPLinha(l, 'entrega', hoje, 200, l.Entrega_TP);
  assert.deepEqual(datasVolumes(eventosColeta), [['2026-11-05', 100], [dataManual, 100]]);
  assert.deepEqual(datasVolumes(eventosEntrega), [['2026-11-06', 100], [hoje, 100]]);
  assert.equal(eventosColeta.conciliacao.motivo, 'coleta-manual-complementar-pcp');
  assert.equal(eventosEntrega.conciliacao.motivo, 'entrega-manual-complementar-pcp');
  assert.equal(w.pgSomaEventosTP(eventosEntrega, dataManual, 'dia'), 0,
    'data manual da coleta nao se torna data de entrega');
});

test('agenda continua usando a tiragem agendada e a data da parcela com AN zero', () => {
  const l = linha({ 'TIRAGEM AGENDADA': 80 });
  const w = portal(l, [movimento(l, { volumeColetado: 0, volumeSolicitado: 80,
    coletaTP: null, dataAgendada: '2026-11-13' })]);
  coleta(w, l);
  w.pgEventosTPLinha(l, 'entrega', hoje, 200, dataManual);
  const eventos = w.pgEventosAgendaMapaLinha(l, hoje, 80, '2026-11-13');
  assert.deepEqual(datasVolumes(eventos), [['2026-11-13', 80]]);
  assert.equal(eventos.conciliacao.motivo, 'tiragem-agendada-por-parcela');
});
