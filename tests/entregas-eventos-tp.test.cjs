const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const script = name => html(name).split('<script>')[1].split('</script>')[0];
const finalPlan = 'Coleta/Internalização de estoque final (re) plan';

function row(extra = {}) {
  return {
    _SOURCE: 'PCP', CD_MAPA: 'ANTILHAS', CD_FINAL: 'ANTILHAS', 'CD DESTINO': 'ANTILHAS',
    MARCA_FINAL: 'COC', GRAFICA_FINAL: 'FORMA CERTA', SKU: 'CCP25PP26111801', ENVIO: 'V1',
    TIRAGEM: 2000, 'TIRAGEM COLETADA': 1403, Coleta_TP: '2026-07-31', Entrega_TP: '2026-08-03',
    [finalPlan]: '2026-07-30', ...extra
  };
}

function portal(file, rows, events, today = '2026-10-08', realCache) {
  let exports;
  const calls = [];
  const window = {
    dadosGlobais: rows, PG_MATRIZ_SLA: {}, MAPA_SAIDA_CACHE: {},
    pgCampoColeta: (line, key) => line[key],
    pgLinhasUnicas: base => base,
    pgUnirTotalSemDuplicidade: base => base,
    pgNormalizarDataColeta: value => value ? String(value).slice(0, 10) : null,
    pgDataPlanoColetaLinha: line => line[finalPlan],
    pgDiasSLALinha: () => 0,
    pgDataPlanoEntregaSLA: (line, value) => value || line[finalPlan] || null,
    pgVolumesColetaUnificadosV37(line, cut) {
      const bruto = Number(line['TIRAGEM COLETADA']) || 0;
      return { bruto, mapa: bruto, entregaTP: line.Entrega_TP || null,
        entrega: line.Entrega_TP && line.Entrega_TP <= cut ? bruto : 0, mapaAgendado: null };
    },
    pgSaldoPrazoV35(prazo, cut) {
      const collected = Array.isArray(prazo.eventosColeta)
        ? prazo.eventosColeta.reduce((sum, event) => sum + (event.data && event.data <= cut ? event.volume : 0), 0)
        : prazo.dtColeta && prazo.dtColeta <= cut ? prazo.coletadaBruta : 0;
      return { vencido: Math.max(0, prazo.vencida - collected), semData: 0 };
    },
    reCriarSheets(name, sheets) { exports = { name, sheets }; }
  };
  if (events) window.pgEventosTPLinha = (line, type, cut, volume, date) => {
    calls.push({ line, type, cut, volume, date });
    return events.map(event => ({ ...event }));
  };
  const context = vm.createContext({ window, dtHojeISO: today, console, Intl,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] } });
  if (realCache) {
    window.MAPA_SAIDA_CACHE = realCache;
    vm.runInContext(script('Scripts_Eventos_TP.html'), context);
  }
  vm.runInContext(script(file), context);
  return { window, calls, export: () => exports };
}

test('Entregas CD distribui duas parcelas e conserva universo, total, plano e realizado atual', () => {
  const line = row();
  const events = [{ data: '2026-08-03', volume: 1280, codigoMapa: 'MP-1' },
    { data: '2026-09-04', volume: 123, codigoMapa: 'MP-2' }];
  const base = [line];
  const app = portal('abaEntregasCD.html', base, events);
  const summary = app.window.pgCalcularEntregaCDFunil(base, '2026-10-08');
  const legacy = portal('abaEntregasCD.html', base).window.pgCalcularEntregaCDFunil(base, '2026-10-08');
  for (const key of ['total', 'realizado', 'realizadoDatado', 'mapaSolicitado', 'esperadoHoje', 'backlogAtual']) {
    assert.equal(summary[key], legacy[key], key);
  }
  assert.equal(summary.registros.length, 1);
  assert.equal(summary.registros[0].dtPlan, '2026-07-30');
  assert.equal(summary.dias.get('2026-08-03').real, 1280);
  assert.equal(summary.dias.get('2026-09-04').real, 123);
  assert.equal(summary.registros[0].eventosReal, summary.prazosRegistros[0].eventosColeta);
  assert.equal(app.calls[0].type, 'entrega');
  assert.equal(app.calls[0].volume, 1403);
});

test('extracao Entregas CD usa as mesmas parcelas no corte historico e futuro', () => {
  const line = row();
  const app = portal('abaEntregasCD.html', [line], [
    { data: '2026-08-03', volume: 1280 }, { data: '2026-09-04', volume: 123 }
  ]);
  const summary = app.window.pgCalcularEntregaCDFunil([line], '2026-10-08');
  app.window.pgExportarVisaoEntregaCD('2026-08-31', '', null, summary);
  assert.equal(app.export().sheets[0].linhas[0][15], 1280);
  assert.equal(app.export().sheets[0].linhas[0][16], 720);
  app.window.pgExportarVisaoEntregaCD('2026-12-31', '', null, summary);
  assert.equal(app.export().sheets[0].linhas[0][15], 1403);
  assert.equal(app.export().sheets[0].linhas.at(-1)[15], 1403);
});

test('cache do resumo de entregas invalida quando os eventos do Mapa sao substituidos', () => {
  const base = [row()];
  const app = portal('abaEntregasCD.html', base, [{ data: '2026-08-03', volume: 1403 }]);
  const first = app.window.pgCalcularEntregaCDFunil(base, '2026-10-08');
  assert.equal(app.window.pgCalcularEntregaCDFunil(base, '2026-10-08'), first);
  app.window.MAPA_SAIDA_CACHE = {};
  assert.notEqual(app.window.pgCalcularEntregaCDFunil(base, '2026-10-08'), first);
});

test('Meta Armazem detalha dias por parcelas e conserva todos os indicadores atuais da meta', () => {
  const line = row({ Entrega_TP: '2026-10-10', [finalPlan]: '2026-10-25' });
  const app = portal('abaMetaArmazem.html', [line], [
    { data: '2026-10-10', volume: 1280 }, { data: '2026-10-20', volume: 123 }
  ], '2026-11-01');
  const item = app.window.pgMAObterItens()[0];
  const legacy = portal('abaMetaArmazem.html', [line], null, '2026-11-01').window.pgMAObterItens()[0];
  for (const key of ['total', 'realizado', 'realCD', 'coletadaBruta', 'pendentePlanejado', 'dtPlan', 'metaAplicada',
    'real', 'previsto', 'pos', 'semData', 'ate15', 'apos15', 'excecao', 'combinadoAdicional']) {
    assert.equal(item[key], legacy[key], key);
  }
  assert.equal(item.real, 1403);
  assert.equal(item.previsto, 1403);
  assert.equal(item.pos, 597);
  assert.equal(item.ate15 + item.apos15 + item.semData, item.total);
  const parcels = app.window.pgMADiasEntrega(item);
  assert.deepEqual(JSON.parse(JSON.stringify(parcels.filter(parcel => parcel.realizado))), [
    { data: '2026-10-10', volume: 1280, realizado: true },
    { data: '2026-10-20', volume: 123, realizado: true }
  ]);
  assert.equal(parcels.reduce((sum, parcel) => sum + parcel.volume, 0), 2000);
});

test('Meta Armazem preserva limite atual ao total sem inventar distribuicao do volume limitado', () => {
  const line = row({ TIRAGEM: 1000, Entrega_TP: '2026-10-10' });
  const app = portal('abaMetaArmazem.html', [line], [
    { data: '2026-10-10', volume: 1280 }, { data: '2026-10-20', volume: 123 }
  ], '2026-11-01');
  const item = app.window.pgMAObterItens()[0];
  assert.equal(app.calls.length, 0);
  assert.equal(item.total, 1000);
  assert.equal(item.realizado, 1000);
  assert.equal(item.real, 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(app.window.pgMADiasEntrega(item))), [
    { data: '2026-10-10', volume: 1000, realizado: true }
  ]);
});

test('Meta Armazem sem Entrega TP valida preserva planejamento e nao usa eventos soltos', () => {
  const line = row({ Entrega_TP: '', [finalPlan]: '2026-10-10' });
  const app = portal('abaMetaArmazem.html', [line], [{ data: '2026-10-10', volume: 1403 }]);
  const item = app.window.pgMAObterItens()[0];
  assert.equal(app.calls.length, 0);
  assert.equal(item.realizado, 0);
  assert.equal(item.pendentePlanejado, 2000);
  assert.equal(item.previsto, 2000);
  assert(app.window.pgMADiasEntrega(item).every(parcel => !parcel.realizado));
});

test('Meta Armazem preserva DATA_EA e Entrega TP futura na regra atual sem redistribuir', () => {
  for (const extra of [{ Entrega_TP: '', DATA_EA: '2026-10-10' }, { Entrega_TP: '2026-11-10' }]) {
    const line = row(extra);
    const app = portal('abaMetaArmazem.html', [line], [{ data: '2026-10-10', volume: 1403 }]);
    const item = app.window.pgMAObterItens()[0];
    const legacy = portal('abaMetaArmazem.html', [line]).window.pgMAObterItens()[0];
    assert.equal(app.calls.length, 0);
    for (const key of ['total', 'realizado', 'real', 'previsto', 'pos', 'pendentePlanejado']) {
      assert.equal(item[key], legacy[key], key);
    }
    assert.equal(item.eventosReal.length, 1);
    assert.equal(item.eventosReal[0].data, extra.DATA_EA || extra.Entrega_TP);
    assert.equal(item.eventosReal[0].volume, 1403);
  }
});

function realCache(dates = ['2026-08-03', '2026-09-04'], quantities = [1280, 123]) {
  const events = quantities.map((volumeColetado, index) => ({
    eventoTPVersao: 1, marca: 'COC', destino: 'ANTILHAS', grafica: 'FORMA CERTA',
    sku: 'CCP25PP26111801', envio: 'V1', codigoMapa: 'MP-' + index, linhaMapa: index + 2,
    chaveMapa: 'COCANTILHASFORMA CERTACCP25PP26111801V1', kit: 'KIT-' + index,
    volumeColetado, coletaTP: dates[index], entregaTP: dates[index]
  }));
  return { accepted: events, onlyMapa: [{ ...events[0], sku: 'FORA-DO-PCP', linhaMapa: 10, volumeColetado: 999999 }] };
}

test('helper real integra Entregas CD sem importar item exclusivo do Mapa ou alterar volume da formula', () => {
  const line = row();
  const app = portal('abaEntregasCD.html', [line], null, '2026-10-08', realCache());
  const summary = app.window.pgCalcularEntregaCDFunil([line], '2026-10-08');
  assert.equal(summary.registros.length, 1);
  assert.equal(summary.total, 2000);
  assert.equal(summary.realizado, 1403);
  assert.equal(summary.dias.get('2026-08-03').real, 1280);
  assert.equal(summary.dias.get('2026-09-04').real, 123);
  assert.equal(summary.registros[0].eventosReal.conciliacao.modo, 'eventos');
});

test('helper real conserva os totais e data antiga de Entregas CD se parcelas nao conciliam', () => {
  const line = row();
  const app = portal('abaEntregasCD.html', [line], null, '2026-10-08', realCache(undefined, [1280, 124]));
  const summary = app.window.pgCalcularEntregaCDFunil([line], '2026-10-08');
  assert.equal(summary.realizado, 1403);
  assert.equal(summary.dias.get('2026-08-03').real, 1403);
  assert.equal(summary.dias.has('2026-09-04'), false);
  assert.equal(summary.registros[0].eventosReal.conciliacao.modo, 'legado');
});

test('helper real integra datas Meta Armazem mantendo a classificacao atual dentro e fora da meta', () => {
  const line = row({ Entrega_TP: '2026-10-10', [finalPlan]: '2026-10-25' });
  const app = portal('abaMetaArmazem.html', [line], null, '2026-11-01', realCache(['2026-10-10', '2026-10-20']));
  const item = app.window.pgMAObterItens()[0];
  assert.equal(item.realizado, 1403);
  assert.equal(item.real, 1403);
  assert.equal(item.previsto, 1403);
  assert.equal(item.pos, 597);
  assert.equal(item.eventosReal.conciliacao.modo, 'eventos');
  assert.deepEqual(JSON.parse(JSON.stringify(app.window.pgMADiasEntrega(item).filter(event => event.realizado))), [
    { data: '2026-10-10', volume: 1280, realizado: true },
    { data: '2026-10-20', volume: 123, realizado: true }
  ]);
});
