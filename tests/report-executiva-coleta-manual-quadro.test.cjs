const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hoje = '2026-11-11';
const plan = 'Coleta/Internalização de estoque final (re) plan';
const row = (n, extra = {}) => ({_SOURCE: 'PCP', _PG_TP_LINHA: n, _ROW_ID: 'PCP:' + n,
  MARCA_FINAL: 'SAS - BRADESCO', UNIDADE: 'SAS - BRADESCO',
  GRAFICA_FINAL: 'LOGPRINT', 'GRÁFICA': 'LOGPRINT', 'GRÁFICA_MAPA': 'LOGPRINT',
  SKU_REAL: 'SKU-A', SKU: 'SKU-A', ENVIO: 'V1', 'SÉRIE': '1 ANO',
  CD_MAPA: 'CD JDI', CD_FINAL: 'CD JDI', 'CD DESTINO': 'CD JDI',
  TIRAGEM: 60, 'TIRAGEM A ENTREGAR (total por CD)': 60,
  'TIRAGEM COLETADA': 100, 'TIRAGEM AGENDADA': 0,
  Coleta_TP: '2026-11-05', Entrega_TP: '2026-11-06', [plan]: '2026-10-30', ...extra});
const pair = (n, extra = {}) => [row(n, extra), row(n + 1, {TIRAGEM: 40,
  'TIRAGEM A ENTREGAR (total por CD)': 40, 'TIRAGEM COLETADA': 0, Coleta_TP: '', Entrega_TP: '', ...extra,
  ...Object.fromEntries(['TIRAGEM COLETADA', 'Coleta_TP', 'Entrega_TP'].map(k => [k, k === 'TIRAGEM COLETADA' ? 0 : '']))})];
const event = (r, n, extra = {}) => ({eventoTPVersao: 1, linhaMapa: n, codigoMapa: 'MP-' + n,
  marca: r.MARCA_FINAL, grafica: r.GRAFICA_FINAL, sku: r.SKU_REAL, envio: r.ENVIO,
  destino: r._SOURCE === 'ACABADORA' ? r['CD DESTINO'] : r.CD_MAPA,
  volumeColetado: 70, coletaTP: '2026-11-01', entregaTP: '2026-11-03', ...extra});

// Renderiza a tabela verdadeira; somente DOM, pintura e chamadas externas são simulados.
function portal(rows, events, columns = ['marca']) {
  const checks = new Map();
  const simple = {querySelectorAll: () => [], querySelector: () => null};
  const controls = {filtroReferencia: {value: 'replan'}, pgFiltroOrigem: {value: 'TODOS'},
    pgFiltroDestino: {value: 'CD', disabled: false},
    reTabelaMarcas: {closest: () => simple, querySelectorAll: () => [], innerHTML: ''},
    pgReSeletoresV42: {querySelector: selector => selector.includes('data-re-coluna')
      ? {checked: columns.some(c => selector.includes('"' + c + '"'))} : simple}};
  const element = () => ({style: {}, classList: {add() {}, remove() {}}, appendChild() {}, addEventListener() {}});
  const w = {dadosGlobais: rows,
    MAPA_SAIDA_CACHE: {__agendaTPCompleta: true, __forecastTP: {conferido: true}, key: events},
    PG_MAPA_TP_CARGA_CONCLUIDA: true, console: {info() {}, warn() {}, error() {}},
    arredondar: v => Math.round(Number(v) || 0), formatarBR: String,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    performance: {now: () => 0}, addEventListener() {}, dispatchEvent() {}, Event: class {},
    document: {getElementById: id => controls[id] || null, querySelector: () => null,
      querySelectorAll: selector => {
        const match = /^\.chk-geral-([^:]+)(:checked)?$/.exec(selector);
        const lista = match ? checks.get(match[1]) || [] : [];
        return match?.[2] ? lista.filter(cb => cb.checked) : lista;
      }, addEventListener() {}, createElement: element, body: element(), head: element()}};
  w.window = w;
  vm.createContext(w);
  for (const name of ['Scripts_Eventos_TP.html', 'Scripts_Conclusao_SKU.html', 'Scripts_Globais_2.html'])
    for (const [, script] of fs.readFileSync(path.join(__dirname, '..', name), 'utf8')
      .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInContext(script, w, {filename: name});
  vm.runInContext(`dtHojeISO='${hoje}';dtHoje=new Date('${hoje}T12:00:00');`, w);
  w.pgAtualizarAbaProducao = () => {};
  w.listasMultiProducao = Object.fromEntries(['Marca', 'Gráfica', 'Série'].map(categoria => {
    const values = new Set(rows.map(r => String(w.pgValorFiltroProducao(r, categoria) || '(Vazio)')));
    checks.set(categoria, Array.from(values, value => ({value, checked: true})));
    return [categoria, values];
  }));
  w.filtrosGeraisIniciados = true;
  w.aplicarFiltros();
  const render = (modo = 'HOJE') => {
    w.pgREModoCorteV57 = modo;
    w.processarReportExecutiva();
    return controls.reTabelaMarcas.innerHTML;
  };
  return {w, render};
}

function cells(html, indicador, chave = 'TOTAL GERAL') {
  const bloco = Array.from(html.matchAll(/<tr[^>]*data-re-chave="([^"]*)">([\s\S]*?)<\/tr>/g))
    .find(m => decodeURIComponent(m[1]) === chave)?.[2];
  assert.ok(bloco, 'Linha visível disponível: ' + chave);
  return Array.from(bloco.matchAll(new RegExp('<td class="re-group-' + indicador + '">(\\d+)%<\\/td>', 'g')),
    m => Number(m[1]));
}

test('quadro mostra coleta e entrega manuais concentradas no SKU de duas linhas: 100% e 80%', () => {
  for (const realizado of [100, 80]) {
    const rows = pair(2, {'TIRAGEM COLETADA': realizado});
    const app = portal(rows, [event(rows[0], 20)]);
    const html = app.render();
    assert.deepEqual(cells(html, 'entcd'), [realizado, 100]);
    assert.deepEqual(cells(html, 'enttp'), [realizado, 100]);
    assert.deepEqual(cells(html, 'entcd', 'SAS - BRADESCO'), [realizado, 100]);
    assert.equal(app.w.pgReportAuditoriaPortal.coletaCD.total.real, realizado);
    assert.equal(app.w.pgReportAuditoriaPortal.entregaTP.total.real, realizado);
    assert.equal(app.w.reCurvaFonteCDV43.realizadoHoje, realizado);
    assert.equal(app.w.pgObterResumoColeta().realizado, realizado);
    assert.ok(cells(html, 'kit')[0] >= realizado);
    assert.ok(cells(html, 'acab')[0] >= cells(html, 'kit')[0]);
  }
});

test('excedente de um SKU não compensa outro SKU, CD, envio, série ou fonte', () => {
  const base = pair(2, {'TIRAGEM COLETADA': 150});
  const semColeta = row(4, {TIRAGEM: 100, SKU: 'SKU-B', SKU_REAL: 'SKU-B',
    'TIRAGEM COLETADA': 0, Coleta_TP: '', Entrega_TP: ''});
  const app = portal([...base, semColeta], [event(base[0], 20)]);
  assert.deepEqual(cells(app.render(), 'entcd'), [50, 100]);
  assert.deepEqual(cells(app.render(), 'enttp'), [50, 100]);
  for (const extra of [{SKU: 'SKU-B', SKU_REAL: 'SKU-B'},
    {CD_MAPA: 'CD CWB', CD_FINAL: 'CD CWB', 'CD DESTINO': 'CD CWB'},
    {ENVIO: 'V2'}, {'SÉRIE': '2 ANO'}, {_SOURCE: 'ACABADORA', _ROW_ID: 'ACAB:3'}]) {
    const rows = pair(2);
    Object.assign(rows[1], extra);
    const diferente = portal(rows, [event(rows[0], 20)]);
    assert.deepEqual(cells(diferente.render(), 'entcd'), [60, 100], JSON.stringify(extra));
    assert.deepEqual(cells(diferente.render(), 'enttp'), [60, 100], JSON.stringify(extra));
  }
});

test('acabadora conserva gráfica de origem e não soma transferência PCP nem cópia da linha', () => {
  const rows = pair(2, {_SOURCE: 'ACABADORA', GRAFICA_FINAL: 'HR', 'GRÁFICA': 'HR',
    'GRÁFICA_MAPA': 'HR', 'GRÁFICA DE ORIGEM': 'LOGPRINT'});
  const transferencia = row(4, {TIRAGEM: 100, CD_MAPA: 'HR', CD_FINAL: 'HR', 'CD DESTINO': 'HR'});
  const athos = row(5, {_SOURCE: 'ACABADORA', GRAFICA_FINAL: 'ATHOS', 'GRÁFICA': 'ATHOS', TIRAGEM: 200});
  const app = portal([...rows, {...rows[0]}, transferencia, athos],
    [event(rows[0], 20), event(transferencia, 21), event(athos, 22)]);
  assert.deepEqual(cells(app.render(), 'entcd'), [100, 100]);
  assert.deepEqual(cells(app.render(), 'enttp'), [100, 100]);
  assert.equal(app.w.pgReportAuditoriaPortal.coletaCD.total.den, 100);
  assert.equal(app.w.pgReportAuditoriaPortal.entregaTP.total.real, 100);
  const outraOrigem = rows.map(r => ({...r}));
  outraOrigem[1]['GRÁFICA DE ORIGEM'] = 'LEOGRAF';
  const separado = portal(outraOrigem, [event(outraOrigem[0], 20)]);
  assert.deepEqual(cells(separado.render(), 'entcd'), [60, 100]);
});

test('quadro respeita datas próprias de coleta e entrega em Hoje e D-1', () => {
  const rows = pair(2, {Coleta_TP: hoje, Entrega_TP: hoje});
  const app = portal(rows, [event(rows[0], 20)]);
  assert.deepEqual(cells(app.render('HOJE'), 'entcd'), [100, 100]);
  assert.deepEqual(cells(app.render('HOJE'), 'enttp'), [100, 100]);
  assert.deepEqual(cells(app.render('D-1'), 'entcd'), [70, 100]);
  assert.deepEqual(cells(app.render('D-1'), 'enttp'), [70, 100]);
  assert.equal(app.w.pgReportAuditoriaPortal.coletaCD.total.real, 70);
});

test('marca, gráfica, série e agrupamento visível preservam o mesmo recorte', () => {
  const a = pair(2), b = pair(4, {MARCA_FINAL: 'PC', UNIDADE: 'PC', GRAFICA_FINAL: 'LEOGRAF',
    'GRÁFICA': 'LEOGRAF', 'GRÁFICA_MAPA': 'LEOGRAF', 'SÉRIE': '2 ANO', SKU: 'SKU-B', SKU_REAL: 'SKU-B'});
  const c = pair(6, {MARCA_FINAL: 'COC', UNIDADE: 'COC', 'SÉRIE': '3 ANO', SKU: 'SKU-C', SKU_REAL: 'SKU-C'});
  const rows = [...a, ...b, ...c], app = portal(rows, [event(a[0], 20), event(b[0], 21), event(c[0], 22)]);
  assert.deepEqual(cells(app.render(), 'entcd'), [100, 100]);
  app.w.checkOnlyGeral('Marca', 'PC');
  assert.deepEqual(cells(app.render(), 'entcd', 'PC'), [100, 100]);
  assert.equal(app.w.pgReportAuditoriaPortal.coletaCD.total.den, 100);
  app.w.checkAllGeral('Marca', true);
  app.w.checkOnlyGeral('Gráfica', 'LOGPRINT');
  app.render();
  assert.equal(app.w.pgReportAuditoriaPortal.coletaCD.total.den, 200);
  app.w.checkOnlyGeral('Série', '1 ANO');
  assert.deepEqual(cells(app.render(), 'entcd'), [100, 100]);
  assert.equal(app.w.pgReportAuditoriaPortal.coletaCD.total.den, 100);

  // Séries exibidas diferentes não recebem rateio, mesmo que o corretor as una.
  const divididas = pair(2);
  divididas[1]['SÉRIE'] = 'OUTRA DESCRICAO';
  const serie = portal(divididas, [event(divididas[0], 20)], ['serie']);
  serie.w.pgSerieCorrigidaFunil = () => 'MESMA SERIE';
  assert.deepEqual(cells(serie.render(), 'entcd', '1 ANO'), [100, 100]);
  assert.deepEqual(cells(serie.render(), 'entcd', 'OUTRA DESCRICAO'), [0, 100]);
});
