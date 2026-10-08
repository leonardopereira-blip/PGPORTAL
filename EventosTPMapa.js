// Complemento somente de leitura. Os volumes publicados no Drive continuam soberanos.
// A RAM pertence a este projeto Apps Script: o DEV nao escreve no cache de producao.
var PG_CACHE_MAPA_TP_DEV = 'cache_mapa_tp_dev.json';

// Executado pela atualizacao do DEV, nunca pela abertura do portal.
function atualizarCacheMapaTPDev() {
  var fonte = getDadosMapaSaida();
  if (!fonte || fonte._ERRO_CRITICO) throw new Error(fonte && fonte._ERRO_CRITICO || 'Mapa indisponivel.');
  var eventos = [], vistas = {};
  Object.keys(fonte).forEach(function(k) {
    if (!Array.isArray(fonte[k])) return;
    fonte[k].forEach(function(e) {
      if (!e || e.eventoTPVersao !== 2 || vistas[e.linhaMapa]) return;
      vistas[e.linhaMapa] = true;
      eventos.push({ eventoTPVersao: 2, marca: e.marca, grafica: e.grafica, sku: e.sku,
        destino: e.destino, envio: e.envio, codigoMapa: e.codigoMapa, linhaMapa: e.linhaMapa,
        chaveMapa: e.chaveMapa, volumeSolicitado: e.volumeSolicitado, volumeColetado: e.volumeColetado,
        dataAgendada: e.dataAgendada, coletaTP: e.coletaTP, entregaTP: e.entregaTP });
    });
  });
  var cache = { formato: 1, geradoEm: new Date().toISOString(), eventos: eventos, forecast: pgChavesForecastTP_() };
  var json = JSON.stringify(cache);
  pgGravarArquivoDrive_(DriveApp.getFolderById(PASTA_CACHE_ID), PG_CACHE_MAPA_TP_DEV, json);
  return { arquivo: PG_CACHE_MAPA_TP_DEV, geradoEm: cache.geradoEm, parcelas: eventos.length };
}

function pgComplementarEventosTPMapa_(mapa, jsonPublicado) {
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return mapa;
  try {
    var json = lerJSONDoDrive(PG_CACHE_MAPA_TP_DEV, true);
    if (!json || json === '[]') throw new Error('Cache de parcelas do DEV ainda nao gerado: ' + PG_CACHE_MAPA_TP_DEV);
    var complemento = JSON.parse(json);
    if (complemento.formato !== 1 || !Array.isArray(complemento.eventos) || !complemento.forecast?.conferido) {
      throw new Error('Cache de parcelas do DEV invalido ou sem Forecast conferido.');
    }
    // As telas antigas recebem apenas P/AA/O; as parcelas completas aparecem uma vez.
    Object.keys(mapa).forEach(function(k) {
      if (k.indexOf('__') === 0) { delete mapa[k]; return; }
      if (Array.isArray(mapa[k])) mapa[k] = mapa[k].map(function(e) {
        return { vol: e.vol, dataColeta: e.dataColeta, dataEntrega: e.dataEntrega };
      });
    });
    mapa.__eventosTPAtuais = complemento.eventos.filter(function(e) { return !!e.chaveMapa; });
    mapa.__forecastTP = complemento.forecast;
    mapa.__parcelasAgendaSemAP = complemento.eventos.filter(function(e) { return !e.chaveMapa; });
    mapa.__agendaTPCompleta = true;
    mapa.__agendaTPGeradoEm = complemento.geradoEm;
  } catch (e) {
    mapa.__erroAgendaTP = e.message;
    console.warn('[mapa TP] Mantendo datas do PCP: ' + e.message);
  }
  return mapa;
}

function pgChavesForecastTP_() {
  var id = typeof pgFonteSnapshot_ !== 'undefined' && pgFonteSnapshot_
    ? pgFonteSnapshot_ : SpreadsheetApp.getActiveSpreadsheet().getId();
  var meta = pgMetadadosPlanilhaCache_(id);
  var resultado = { conferido: true, coleta: [], entrega: [] };
  if (meta.nomes.indexOf('Forecast_Coleta_Portal') < 0) return resultado;
  var valores = Sheets.Spreadsheets.Values.batchGet(id, {
    ranges: ["'Forecast_Coleta_Portal'!K2:K", "'Forecast_Coleta_Portal'!T2:T"],
    valueRenderOption: 'UNFORMATTED_VALUE'
  }).valueRanges || [];
  if (valores.length !== 2) throw new Error('Leitura incompleta das chaves K/T do Forecast.');
  ['coleta', 'entrega'].forEach(function(tipo, i) {
    resultado[tipo] = (valores[i] && valores[i].values || [])
      .map(function(r) { return String(r[0] == null ? '' : r[0]).trim(); }).filter(Boolean);
  });
  return resultado;
}
