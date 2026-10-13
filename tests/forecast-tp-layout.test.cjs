const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const backend = fs.readFileSync(path.join(__dirname, '..', 'EventosTPMapa.js'), 'utf8');
const frontend = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Eventos_TP.html'), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
function chaves(linhas, entrega = []) {
  const ctx = vm.createContext({
    pgFonteSnapshot_: 'planilha',
    pgMetadadosPlanilhaCache_: () => ({ nomes: ['Forecast_Coleta_Portal'] }),
    Sheets: { Spreadsheets: { Values: { batchGet: () => ({ valueRanges: [
      { values: linhas }, { values: entrega.map(k => [k]) }
    ] }) } } }
  });
  vm.runInContext(backend, ctx);
  return JSON.parse(JSON.stringify(ctx.pgChavesForecastTP_()));
}
test('novo layout usa A com datas L/M; K destino nunca vira chave', () => {
  const r = (key, coleta, entrega) => Object.assign(Array(16).fill(''), {
    0: key, 10: 'CD RP', 11: coleta, 12: entrega, 15: 54326
  });
  assert.deepEqual(chaves([['GRÁFICAUNIDADESKUCD DESTINO'],
    r('CHAVE-COLETA', 46282, ''), r('CHAVE-ENTREGA', '', 46283), r('CHAVE-AMBOS', 46282, 46283)]), {
    conferido: true, formato: 'grafica-marca-sku-destino',
    coleta: ['CHAVE-COLETA', 'CHAVE-AMBOS'], entrega: ['CHAVE-ENTREGA', 'CHAVE-AMBOS']
  });
});
test('layout anterior conserva chaves K/T', () => {
  assert.deepEqual(chaves([['Cabecalho antigo'], Object.assign(Array(11).fill(''), { 10: 'COLETA-LEGADA' })],
    ['ENTREGA-LEGADA']), { conferido: true, coleta: ['COLETA-LEGADA'], entrega: ['ENTREGA-LEGADA'] });
});
const hoje = '2026-10-13';
const linha = { _SOURCE: 'PCP', MARCA_FINAL: 'PLE', GRAFICA_FINAL: 'LOGPRINT',
  'GRÁFICA_MAPA': 'LOGPRINT', SKU_REAL: 'PL27B1F1W5', ENVIO: 'V1',
  CD_MAPA: 'CD RP', CD_DESTINO_PCP_ORIGINAL: 'CD ORIGINAL', 'TIRAGEM AGENDADA': 500 };
const chave = 'LOGPRINTPLEPL27B1F1W5CD ORIGINAL';
function portal(formato, keys = [chave]) {
  const evento = { eventoTPVersao: 2, linhaMapa: 2347, codigoMapa: 'MP-1', marca: 'PLE',
    grafica: 'LOGPRINT', sku: 'PL27B1F1W5', destino: 'CD RP', envio: 'V1',
    volumeColetado: 74038, volumeSolicitado: 74038, coletaTP: '2026-09-17', entregaTP: '2026-09-18' };
  const ctx = vm.createContext({ window: { dadosGlobais: [linha],
    pgNumeroPrazoV35: v => Number(v) || 0,
    MAPA_SAIDA_CACHE: { __agendaTPCompleta: true,
      __forecastTP: { conferido: true, formato, coleta: keys, entrega: keys },
      __eventosTPAtuais: [evento] }
  } });
  vm.runInContext(frontend, ctx);
  return ctx.window;
}
test('Forecast novo reconhece CD original, preserva formula e data e nao libera outras linhas', () => {
  const w = portal('grafica-marca-sku-destino');
  for (const tipo of ['coleta', 'entrega']) {
    const ev = w.pgEventosTPLinha(linha, tipo, hoje, 54326, '2026-10-01');
    assert.equal(ev.conciliacao.motivo, 'forecast-soberano');
    assert.equal(ev[0].volume, 54326);
    assert.equal(ev[0].data, '2026-10-01');
  }
  const outra = { ...linha, CD_DESTINO_PCP_ORIGINAL: 'OUTRO CD' };
  const ev = w.pgEventosTPLinha(outra, 'coleta', hoje, 54326, '2026-10-01');
  assert.equal(ev.length, 0);
  assert.equal(ev.conciliacao.motivo, 'quantidade-nao-concilia-tiragem-coletada');
  const agenda = w.pgEventosAgendaMapaLinha(linha, hoje, 500, '2026-10-14');
  assert.equal(agenda.conciliacao.motivo, 'forecast-soberano');
  assert.equal(agenda[0].volume, 500);
});
test('chave Forecast legada permanece independente do novo formato', () => {
  const w = portal(undefined, ['CD RPLOGPRINTPL27B1F1W5V1']);
  assert.equal(w.pgEventosTPLinha(linha, 'coleta', hoje, 54326, '2026-10-01').conciliacao.motivo,
    'forecast-soberano');
});
