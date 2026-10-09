// Somente dados publicados em cache_mapa.json; sem leitura de planilhas na abertura.

function pgComplementarEventosTPMapa_(mapa, jsonPublicado) {
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return mapa;
  try {
    if (mapa._ERRO_CRITICO) throw new Error(mapa._ERRO_CRITICO);
    if (!mapa.__agendaTPCompleta || !mapa.__forecastTP?.conferido) {
      throw new Error('cache_mapa.json sem dados do mapa ou Forecast: execute atualizarCacheMapa ou atualizarTodoOCache.');
    }
    var eventos = [], semAP = [], vistas = {};
    Object.keys(mapa).forEach(function(k) {
      // A auditoria inclui linhas fora das listas temporais; nao amplia seus calculos.
      if (k === '__linhasFisicas') return;
      if (!Array.isArray(mapa[k])) return;
      mapa[k].forEach(function(e) {
        if (!e || e.eventoTPVersao !== 2) throw new Error('cache_mapa.json em formato antigo: atualize o cache do mapa.');
        if (vistas[e.linhaMapa]) return;
        vistas[e.linhaMapa] = true;
        var parcela = { eventoTPVersao: 2, marca: e.marca, grafica: e.grafica, sku: e.sku,
          destino: e.destino, envio: e.envio, codigoMapa: e.codigoMapa, linhaMapa: e.linhaMapa,
          chaveMapa: e.chaveMapa, kit: e.kit, volumeSolicitado: e.volumeSolicitado,
          volumeColetado: e.volumeColetado, dataAgendada: e.dataAgendada,
          coletaTP: e.coletaTP, entregaTP: e.entregaTP };
        (e.chaveMapa ? eventos : semAP).push(parcela);
      });
    });
    // As telas antigas recebem apenas P/AA/O; as parcelas completas aparecem uma vez.
    Object.keys(mapa).forEach(function(k) {
      if (k.indexOf('__') === 0) return;
      if (Array.isArray(mapa[k])) mapa[k] = mapa[k].map(function(e) {
        return { vol: e.vol, dataColeta: e.dataColeta, dataEntrega: e.dataEntrega };
      });
    });
    delete mapa.__eventosTPAdicionais;
    delete mapa.__erroAgendaTP;
    mapa.__eventosTPAtuais = eventos;
    mapa.__parcelasAgendaSemAP = semAP;
  } catch (e) {
    mapa.__agendaTPCompleta = false;
    mapa.__erroAgendaTP = e.message;
    console.warn('[mapa TP] Mantendo datas do PCP: ' + e.message);
  }
  // O acompanhamento le o JSON bruto no servidor. Estas linhas nao ampliam o
  // payload nem as listas recebidas pelas telas antigas de TP.
  delete mapa.__linhasFisicas;
  delete mapa.__acompanhamentoMapaVersao;
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
