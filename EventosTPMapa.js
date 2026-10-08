// Complemento somente de leitura. Os volumes publicados no Drive continuam soberanos.
// A RAM pertence a este projeto Apps Script: o DEV nao escreve no cache de producao.
function pgComplementarEventosTPMapa_(mapa, jsonPublicado) {
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return mapa;
  try {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, jsonPublicado)
      .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    var chave = 'MAPA_EVENTOS_TP_V3_' + digest;
    var salvo = lerDoCacheRAM(chave);
    var complemento = salvo ? JSON.parse(salvo) : null;
    if (!complemento) {
      var listas = Object.keys(mapa).filter(function(k) { return Array.isArray(mapa[k]); });
      var completo = mapa.__agendaTPCompleta && listas.length && listas.every(function(k) {
        return mapa[k].every(function(e) { return e && e.eventoTPVersao === 2; });
      });
      var fonte = completo ? mapa : getDadosMapaSaida();
      if (!fonte || fonte._ERRO_CRITICO) throw new Error('Parcelas do mapa indisponiveis.');
      var eventos = [];
      Object.keys(fonte).forEach(function(k) {
        if (k !== '__parcelasAgendaSemAP' && Array.isArray(fonte[k])) fonte[k].forEach(function(e) {
          if (e && e.eventoTPVersao === 2) eventos.push(e);
        });
      });
      var forecast;
      try { forecast = pgChavesForecastTP_(); }
      catch (e) { forecast = { conferido: false, coleta: [], entrega: [], erro: e.message }; }
      complemento = { eventos: eventos, semAP: fonte.__parcelasAgendaSemAP || [], forecast: forecast };
      salvarNoCacheRAM(chave, complemento, 600);
    }
    // Arrays antigos P/AA/O nao sao substituidos nem somados ao complemento.
    mapa.__eventosTPAtuais = complemento.eventos;
    mapa.__forecastTP = complemento.forecast;
    mapa.__parcelasAgendaSemAP = complemento.semAP;
    mapa.__agendaTPCompleta = true;
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
  ['coleta', 'entrega'].forEach(function(tipo, i) {
    resultado[tipo] = (valores[i] && valores[i].values || [])
      .map(function(r) { return String(r[0] == null ? '' : r[0]).trim(); }).filter(Boolean);
  });
  return resultado;
}
