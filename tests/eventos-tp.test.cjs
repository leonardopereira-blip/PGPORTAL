const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Eventos_TP.html'), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const hoje = '2026-10-08';
const primeiraData = '2026-07-31';
const segundaData = '2026-09-04';
const linha = overrides => ({
  _SOURCE: 'PCP', MARCA_FINAL: 'COC', GRAFICA_FINAL: 'FORMA CERTA',
  ENVIO: 'V1', SKU_REAL: 'CCP25PP26111801', CD_MAPA: 'ANTILHAS', ...overrides
});
const evento = overrides => ({
  eventoTPVersao: 1, chaveMapa: 'COCANTILHASFORMA CERTACCP25PP26111801V1',
  linhaMapa: 745, codigoMapa: 'MP 95 V1 COC FC', marca: 'COC', destino: 'ANTILHAS',
  grafica: 'FORMA CERTA', sku: 'CCP25PP26111801', envioRaw: 'V1 - 27', envio: 'V1',
  kit: 'KIT-1', volumeColetado: 1280, coletaTP: primeiraData, entregaTP: '2026-08-03', ...overrides
});
const segunda = overrides => evento({ linhaMapa: 1881, codigoMapa: 'MP-506731-COC-V1-FORMACERTA',
  volumeColetado: 123, coletaTP: segundaData, entregaTP: segundaData, ...overrides });
function portal(mapa) {
  const ctx = vm.createContext({ window: { MAPA_SAIDA_CACHE: mapa } });
  vm.runInContext(source, ctx);
  return ctx.window;
}
const valores = eventos => JSON.parse(JSON.stringify(eventos));
const legacy = (quantidade = 1403, dt = primeiraData) => [{ data: dt, volume: quantidade }];

test('dois codigos redistribuem 1403 nas datas comprovadas e preservam hoje', () => {
  const mapa = { legadoKey: [evento(), segunda()] };
  const w = portal(mapa);
  const eventos = w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData);
  assert.equal(eventos.conciliacao.modo, 'eventos');
  assert.deepEqual(valores(eventos).map(e => [e.data, e.volume, e.codigoMapa]), [
    [primeiraData, 1280, 'MP 95 V1 COC FC'], [segundaData, 123, 'MP-506731-COC-V1-FORMACERTA']
  ]);
  assert.equal(w.pgSomaEventosTP(eventos, '2026-08-01'), 1280);
  assert.equal(w.pgSomaEventosTP(eventos, segundaData, 'dia'), 123);
  assert.equal(w.pgSomaEventosTP(eventos, hoje), 1403);
  assert.equal(w.pgSomaEventosTP(eventos, '2026-12-01'), 1403);
  assert.equal(Object.keys(eventos).includes('conciliacao'), false);
  assert.equal(mapa.legadoKey[0].data, undefined, 'nao modifica os movimentos originais');
});

test('cache antigo e PCP sem mapa preservam o vetor legado sem inventar realizado', () => {
  for (const mapa of [undefined, {}, { key: [{ vol: 9999, dataColeta: primeiraData }] }]) {
    const w = portal(mapa);
    assert.deepEqual(valores(w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData)), legacy());
    assert.deepEqual(valores(w.pgEventosTPLinha(linha(), 'coleta', hoje, 0, primeiraData)), []);
    assert.deepEqual(valores(w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, null)), []);
  }
  const w = portal({ key: [evento(), segunda()] });
  assert.deepEqual(valores(w.pgEventosTPLinha(linha({ ENVIO: '' }), 'coleta', hoje, 1403, primeiraData)), legacy());
});

test('matching temporal PCP usa envio AX; Acabadora usa sua identidade sem envio', () => {
  const w = portal({ key: [evento(), segunda({ envio: 'V2', envioRaw: 'V1' })] });
  const pcp = w.pgEventosTPLinha(linha(), 'coleta', hoje, 1280, primeiraData);
  assert.equal(pcp.conciliacao.modo, 'eventos');
  assert.equal(pcp.length, 1);
  const acab = linha({ _SOURCE: 'ACABADORA', SKU: 'CCP25PP26111801',
    'CD DESTINO': 'ANTILHAS', CD_MAPA: 'OUTRO', ENVIO: '' });
  const eventsAcab = w.pgEventosTPLinha(acab, 'coleta', hoje, 1403, primeiraData);
  assert.equal(eventsAcab.conciliacao.modo, 'eventos');
  assert.equal(eventsAcab.length, 2);
  const axAusente = portal({ key: [evento({ envio: '', envioRaw: 'V1' })] });
  assert.equal(axAusente.pgEventosTPLinha(linha(), 'coleta', hoje, 1280, primeiraData).conciliacao.motivo, 'envio-ax-ausente');
});

test('volume a mais a menos duplicado ou limitado pela formula nunca e ajustado por proporcao', () => {
  for (const quantidade of [1402, 1404, 701.5]) {
    const w = portal({ key: [evento(), segunda()] });
    const result = w.pgEventosTPLinha(linha(), 'coleta', hoje, quantidade, primeiraData);
    assert.deepEqual(valores(result), legacy(quantidade));
    assert.equal(result.conciliacao.motivo, 'quantidade-nao-concilia-com-formula');
  }
  const duplicated = portal({ key: [evento(), segunda({ linhaMapa: 745 })] });
  assert.equal(duplicated.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData).conciliacao.motivo,
    'linha-do-mapa-duplicada');
  const mesmoMP = portal({ key: [evento(), segunda({ codigoMapa: 'MP 95 V1 COC FC' })] });
  assert.equal(mesmoMP.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData).length, 2,
    'o mesmo MP em linhas fisicas distintas pode conter parcelas validas');
});

test('sem data futura minima coerente ou identidade completa a formula prevalece', () => {
  const invalidos = [
    segunda({ coletaTP: null }), segunda({ coletaTP: '2026-10-09' }),
    segunda({ coletaTP: '2026-02-30' }), segunda({ codigoMapa: '' }),
    segunda({ linhaMapa: null }), segunda({ sku: '' }), segunda({ volumeColetado: -123 })
  ];
  for (const invalido of invalidos) {
    const w = portal({ key: [evento(), invalido] });
    const result = w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData);
    assert.deepEqual(valores(result), legacy());
    assert.equal(result.conciliacao.modo, 'legado');
  }
  const w = portal({ key: [evento(), segunda()] });
  const forecast = w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, '2026-08-01');
  assert.deepEqual(valores(forecast), legacy(1403, '2026-08-01'));
  assert.equal(forecast.conciliacao.motivo, 'data-minima-diverge-da-formula');
  const entrega = w.pgEventosTPLinha(linha(), 'entrega', hoje, 1403, '2026-08-03');
  assert.equal(entrega.conciliacao.modo, 'eventos');
  assert.equal(w.pgSomaEventosTP(entrega, '2026-08-10'), 1280);
});

test('excecoes Posigraf e forecast explicitado preservam a data soberana', () => {
  const posi = linha({ MARCA_FINAL: 'CQT', GRAFICA_FINAL: 'POSIGRAF', DT_ENTREGA_DG: primeiraData });
  const w = portal({ key: [evento({ marca: 'CQT', grafica: 'POSIGRAF', volumeColetado: 1403 })] });
  const result = w.pgEventosTPLinha(posi, 'coleta', hoje, 1403, primeiraData);
  assert.deepEqual(valores(result), legacy());
  assert.equal(result.conciliacao.motivo, 'excecao-posigraf');
  const forecast = w.pgEventosTPLinha(linha({ _PG_TP_FORECAST: true }), 'coleta', hoje, 1403, primeiraData);
  assert.equal(forecast.conciliacao.motivo, 'forecast-soberano');
});

test('indice acompanha nova referencia do cache e inclui lista adicional sem juntar SKU sozinho', () => {
  const w = portal({});
  assert.equal(w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData).conciliacao.modo, 'legado');
  let leituras = 0;
  const mapa = new Proxy({ key: [evento(), evento({ marca: 'OUTRA', linhaMapa: 3000, volumeColetado: 2000 })],
    __eventosTPAdicionais: [segunda()] }, { ownKeys(target) { leituras++; return Reflect.ownKeys(target); } });
  w.MAPA_SAIDA_CACHE = mapa;
  assert.equal(w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData).conciliacao.modo, 'eventos');
  assert.equal(w.pgEventosTPLinha(linha(), 'entrega', hoje, 1403, '2026-08-03').conciliacao.modo, 'eventos');
  assert.equal(leituras, 1, 'varre o mapa apenas uma vez por referencia de cache');
  assert.deepEqual(valores(w.pgEventosTPLinha(linha({ CD_MAPA: '', CD_DESTINO: 'ANTILHAS' }),
    'coleta', hoje, 1403, primeiraData)), legacy(), 'destino original nao substitui CD_MAPA');
});

test('registros e soma compartilham vetores comprovados ou fallback valido sem alterar quantidades', () => {
  const w = portal({ key: [evento(), segunda()] });
  const eventos = w.pgEventosTPLinha(linha(), 'coleta', hoje, 1403, primeiraData);
  assert.equal(w.pgEventosRealRegistroTP({ eventosReal: eventos, dtReal: primeiraData, coletada: 1403 }), eventos);
  assert.deepEqual(valores(w.pgEventosRealRegistroTP({ dtReal: primeiraData, coletada: 1403 })), legacy());
  assert.deepEqual(valores(w.pgEventosRealRegistroTP({ dtReal: '31/02/2026', coletada: 1403 })), []);
  assert.deepEqual(valores(w.pgEventosRealRegistroTP({ eventosReal: [], dtReal: primeiraData, coletada: 1403 })), []);
  assert.equal(w.pgSomaEventosTP(eventos, '2026-02-30'), 0);
  const decimals = portal({ key: [evento({ volumeColetado: 0.1 }), segunda({ volumeColetado: 0.2 })] });
  assert.equal(decimals.pgEventosTPLinha(linha(), 'coleta', hoje, 0.3, primeiraData).conciliacao.modo, 'legado',
    'sem tolerancia ou arredondamento para forcar conciliacao');
});

test('reutiliza vetor por linha e argumentos e revalida cache novo ou identidade alterada', () => {
  const registro = linha();
  const w = portal({ key: [evento(), segunda()] });
  const atual = w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData);
  assert.equal(w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData), atual);
  const outraQuantidade = w.pgEventosTPLinha(registro, 'coleta', hoje, 1402, primeiraData);
  assert.notEqual(outraQuantidade, atual);
  assert.equal(outraQuantidade.conciliacao.modo, 'legado');
  assert.equal(w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData), atual);
  const entrega = w.pgEventosTPLinha(registro, 'entrega', hoje, 1403, '2026-08-03');
  assert.notEqual(entrega, atual);
  w.MAPA_SAIDA_CACHE = { key: [evento(), segunda({ volumeColetado: 124 })] };
  const novoMapa = w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData);
  assert.notEqual(novoMapa, atual);
  assert.equal(novoMapa.conciliacao.modo, 'legado');
  w.MAPA_SAIDA_CACHE = { key: [evento(), segunda()] };
  assert.equal(w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData).conciliacao.modo, 'eventos');
  registro._PG_TP_FORECAST = true;
  assert.equal(w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData).conciliacao.motivo, 'forecast-soberano');
  delete registro._PG_TP_FORECAST;
  registro.CD_MAPA = 'CD JDI';
  assert.equal(w.pgEventosTPLinha(registro, 'coleta', hoje, 1403, primeiraData).conciliacao.motivo,
    'sem-movimentos-da-identidade');
});
