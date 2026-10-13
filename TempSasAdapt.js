// TEMP SAS ADAPT: auditoria isolada. Entrada: PCP; saida: MAPA DE SAIDA.
// Nao modifica nenhuma regra de outras telas ou o cache do portal.
function pgTempSasAdaptNormalizar_(valor) {
  return String(valor == null ? '' : valor).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}
function pgTempSasAdaptNumero_(valor) {
  if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
  var str = String(valor == null ? '' : valor).trim();
  if (!str || /^#/.test(str)) return 0;
  if (str.indexOf(',') >= 0) str = str.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) str = str.replace(/\./g, '');
  var numero = Number(str);
  return isFinite(numero) ? numero : 0;
}
function pgTempSasAdaptData_(valor) {
  if (valor == null || valor === '' || valor === 0 || valor === '0') return '';
  if (valor instanceof Date) return Utilities.formatDate(valor, 'America/Sao_Paulo', 'dd/MM/yyyy');
  if (typeof valor === 'number') {
    var data = new Date(Math.round((valor - 25569) * 86400000));
    return Utilities.formatDate(data, 'GMT', 'dd/MM/yyyy');
  }
  return String(valor).trim();
}
// Busca apenas as colunas auditadas, sem requisitar matrizes inteiras de PCP/MAPA.
// Sheets Values.batchGet conserva os indices das linhas mesmo com celulas vazias.
function pgTempSasAdaptLerColunas_(nomes, colunas) {
  if (!Array.isArray(nomes)) nomes = [nomes];
  var meta = pgMetadadosPlanilhaCache_(pgFonteExternaCache_(nomes));
  var aba = nomes.filter(function(n) { return meta.nomes.indexOf(n) >= 0; })[0];
  if (!aba) throw new Error('TEMP SAS ADAPT: aba nao encontrada: ' + nomes.join('/'));
  var grade = meta.abas.filter(function(s) { return s.title === aba; })[0].gridProperties;
  var n = grade.rowCount, saida = [];
  var resposta = Sheets.Spreadsheets.Values.batchGet(meta.id, {
    ranges: colunas.map(function(c) { return "'" + aba.replace(/'/g, "''") + "'!" + c + "1:" + c + n; }),
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  var valores = resposta.valueRanges || [];
  if (valores.length !== colunas.length) throw new Error('TEMP SAS ADAPT: retorno incompleto de ' + aba);
  var ultimo = 1;
  valores.forEach(function(c) { ultimo = Math.max(ultimo, (c.values || []).length); });
  for (var i = 0; i < ultimo; i++) {
    saida.push(valores.map(function(c) {
      return c.values && c.values[i] && c.values[i][0] != null ? c.values[i][0] : '';
    }));
  }
  return saida;
}
function pgTempSasAdaptResumo_(pcp, mapa) {
  function idx(cab, nomes, fonte) {
    var lista = (cab || []).map(pgTempSasAdaptNormalizar_);
    var indices = {};
    nomes.forEach(function(n) {
      var coluna = lista.indexOf(pgTempSasAdaptNormalizar_(n));
      if (coluna < 0) throw new Error('TEMP SAS ADAPT: coluna ' + n + ' ausente em ' + fonte);
      indices[n] = coluna;
    });
    return indices;
  }
  var pcols = ['GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
               'CD DESTINO','TIRAGEM','TIRAGEM COLETADA','Data_Coleta_Mapa','Entrega_TP'];
  var mcols = ['UN PCP','CÓD MP','UNIDADE','CD DESTINO','ENVIO','SKU','GRÁFICA',
               'TIRAGEM','DT COLETA','Entrega_TP'];
  var p = idx(pcp[0], pcols, 'PCP'), m = idx(mapa[0], mcols, 'MAPA DE SAÍDA');
  var planejado = 0, coletado = 0, saida = 0;
  var porGrafica = Object.create(null), porCD = Object.create(null);
  var skus = Object.create(null), linhasEntrada = [], linhasSaida = [];
  var faltamDatasEntrada = 0, faltamDatasSaida = 0;
  function numeroObj(alvo, chave, valor) {
    if (!Object.prototype.hasOwnProperty.call(alvo, chave)) alvo[chave] = 0;
    alvo[chave] += valor;
  }
  function skuObj(cod) {
    if (!skus[cod]) skus[cod] = {
      sku: cod, planejado: 0, coletado: 0, saida: 0,
      graficas: Object.create(null), destinos: Object.create(null), mapas: Object.create(null)
    };
    return skus[cod];
  }
  for (var i = 1; i < pcp.length; i++) {
    var linha = pcp[i] || [];
    if (pgTempSasAdaptNormalizar_(linha[p.UNIDADE]) !== 'SAS ADAPT') continue;
    if (pgTempSasAdaptNormalizar_(linha[p.ENVIO]) !== 'V1') continue;
    var cd = pgTempSasAdaptNormalizar_(linha[p['CD DESTINO']]);
    if (cd.indexOf('ATHOS') < 0) continue;
    if (/CANCELAD|REENTRADA/.test(pgTempSasAdaptNormalizar_(linha[p['CARACTERÍSTICA DA SOLICITAÇÃO']]))) continue;
    var sku = pgTempSasAdaptNormalizar_(linha[p.SKU]), grafica = pgTempSasAdaptNormalizar_(linha[p['GRÁFICA']]);
    if (!sku) continue;
    var qPlan = pgTempSasAdaptNumero_(linha[p.TIRAGEM]);
    var qColeta = pgTempSasAdaptNumero_(linha[p['TIRAGEM COLETADA']]);
    var dataColeta = pgTempSasAdaptData_(linha[p.Data_Coleta_Mapa]);
    var entregaTp = pgTempSasAdaptData_(linha[p.Entrega_TP]);
    if (qColeta > 0 && (!dataColeta || !entregaTp)) faltamDatasEntrada++;
    planejado += qPlan;
    coletado += qColeta;
    if (qColeta) numeroObj(porGrafica, grafica || 'NÃO INFORMADA', qColeta);
    var s = skuObj(sku);
    s.planejado += qPlan;
    s.coletado += qColeta;
    if (qColeta) s.graficas[grafica || 'NÃO INFORMADA'] = true;
    linhasEntrada.push({
      fonte: 'PCP', linha: i + 1, sku: sku, grafica: grafica, destino: cd, envio: 'V1',
      planejado: qPlan, volume: qColeta, dataColeta: dataColeta, entregaTP: entregaTp,
      status: qColeta > 0 ? (dataColeta && entregaTp ? 'Coletado com datas TP' : 'Coletado, conferir datas') : 'Sem tiragem coletada'
    });
  }
  for (var j = 1; j < mapa.length; j++) {
    var l = mapa[j] || [];
    var unPCP = pgTempSasAdaptNormalizar_(l[m['UN PCP']]);
    var unOrig = pgTempSasAdaptNormalizar_(l[m.UNIDADE]);
    if (unPCP !== 'SAS ADAPT' && unOrig !== 'SAD') continue;
    if (pgTempSasAdaptNormalizar_(l[m.ENVIO]) !== 'V1') continue;
    var grafOrig = pgTempSasAdaptNormalizar_(l[m['GRÁFICA']]);
    var cdOrig = pgTempSasAdaptNormalizar_(l[m['CD DESTINO']]);
    if (grafOrig !== 'ATHOS' || !cdOrig || cdOrig === '-' ||
        cdOrig.indexOf('ATHOS') >= 0 || cdOrig.indexOf('ACABADORA') >= 0) continue;
    var codigo = pgTempSasAdaptNormalizar_(l[m.SKU]);
    if (!codigo) continue;
    var tiragem = pgTempSasAdaptNumero_(l[m.TIRAGEM]);
    var coletaMapa = pgTempSasAdaptData_(l[m['DT COLETA']]);
    var entregaMapa = pgTempSasAdaptData_(l[m.Entrega_TP]);
    var mp = String(l[m['CÓD MP']] || '').trim();
    if (tiragem > 0 && coletaMapa && !entregaMapa) faltamDatasSaida++;
    var efetiva = coletaMapa && tiragem > 0 ? tiragem : 0;
    saida += efetiva;
    if (efetiva) numeroObj(porCD, cdOrig, efetiva);
    var s2 = skuObj(codigo);
    s2.saida += efetiva;
    s2.destinos[cdOrig] = true;
    if (mp) s2.mapas[mp] = true;
    linhasSaida.push({
      fonte: 'MAPA DE SAÍDA', linha: j + 1, mapa: mp, sku: codigo, grafica: grafOrig,
      destino: cdOrig, unidade: unOrig, unPCP: unPCP, envio: 'V1',
      volume: tiragem, volumeColetado: efetiva, dataColeta: coletaMapa, entregaTP: entregaMapa,
      status: coletaMapa ? 'Coletado no mapa' : 'Sem DT COLETA (não somado)'
    });
  }
  function tabela(obj) {
    return Object.keys(obj).map(function(k) { return { nome: k, tiragem: obj[k] }; })
      .sort(function(a, b) { return b.tiragem - a.tiragem || a.nome.localeCompare(b.nome); });
  }
  var porSku = Object.keys(skus).map(function(k) {
    var item = skus[k];
    return { sku: item.sku, planejado: item.planejado, coletado: item.coletado,
      saida: item.saida, diferenca: item.coletado - item.saida,
      graficas: Object.keys(item.graficas).join(', '),
      destinos: Object.keys(item.destinos).join(', '),
      mapas: Object.keys(item.mapas).join(', ') };
  }).sort(function(a, b) { return b.coletado + b.saida - a.coletado - a.saida || a.sku.localeCompare(b.sku); });
  return {
    pcpTotal: planejado, entradasAthos: coletado, saidasCD: saida,
    diferencaAthos: coletado - saida,
    entradasPorGrafica: tabela(porGrafica), saidasPorCD: tabela(porCD),
    linhasEntrada: linhasEntrada, linhasSaida: linhasSaida, porSku: porSku,
    qtdLinhasEntrada: linhasEntrada.length, qtdLinhasSaida: linhasSaida.length,
    faltamDatasEntrada: faltamDatasEntrada, faltamDatasSaida: faltamDatasSaida,
    criterio: 'PCP: SAS ADAPT V1, CD DESTINO ATHOS, TIRAGEM COLETADA. MAPA: origem ATHOS, destino CDs, DT COLETA. ENTREGA_TP informativa, não confirmação física.'
  };
}
function getTempSasAdapt() {
  var pCols = ['BQ','BR','BT','BU','BW','CK','CD','AZ','K','EA'];
  var mCols = ['A','E','F','G','H','L','N','O','P','AU'];
  var pcp = pgTempSasAdaptLerColunas_('PCP', pCols);
  var mapa = pgTempSasAdaptLerColunas_(['MAPA DE SAÍDA','MAPA DE SAIDA','MAPA DE SAIDA '], mCols);
  return pgTempSasAdaptResumo_(pcp, mapa);
}