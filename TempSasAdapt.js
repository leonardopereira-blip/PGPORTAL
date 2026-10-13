// Visao temporaria e isolada de movimentacao SAS ADAPT / ATHOS.
// Nao altera caches, fontes, filtros ou calculos de outras telas.
function pgTempSasAdaptNormalizar_(valor) {
  return String(valor == null ? '' : valor).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function pgTempSasAdaptNumero_(valor) {
  if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
  var str = String(valor == null ? '' : valor).trim();
  if (!str) return 0;
  if (str.indexOf(',') >= 0) str = str.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(str)) str = str.replace(/\./g, '');
  var numero = Number(str);
  return isFinite(numero) ? numero : 0;
}

function pgTempSasAdaptResumo_(mapa, pcp) {
  function indices(cabecalho, exigidos, fonte) {
    var nomes = (cabecalho || []).map(pgTempSasAdaptNormalizar_);
    var idx = {};
    exigidos.forEach(function(nome) {
      var coluna = nomes.indexOf(pgTempSasAdaptNormalizar_(nome));
      if (coluna < 0) throw new Error('TEMP SAS ADAPT: coluna ' + nome + ' ausente em ' + fonte);
      idx[nome] = coluna;
    });
    return idx;
  }
  var im = indices(mapa[0], ['UN PCP', 'UNIDADE', 'CD DESTINO', 'GRÁFICA', 'ENVIO', 'TIRAGEM', 'DT COLETA'], 'MAPA DE SAÍDA');
  var ip = indices(pcp[0], ['UNIDADE', 'ENVIO', 'CARACTERÍSTICA DA SOLICITAÇÃO', 'TIRAGEM'], 'PCP');
  var pcpTotal = 0, entradas = 0, saidas = 0, linhasPcp = 0, linhasEntrada = 0, linhasSaida = 0;
  var porGrafica = Object.create(null), porCD = Object.create(null), semColeta = 0;
  function acumular(alvo, chave, numero) {
    if (!alvo[chave]) alvo[chave] = 0;
    alvo[chave] += numero;
  }
  function tabela(obj) {
    return Object.keys(obj).map(function(nome) { return { nome: nome, tiragem: obj[nome] }; })
      .sort(function(a, b) { return b.tiragem - a.tiragem || a.nome.localeCompare(b.nome); });
  }
  // O denominador e a TIRAGEM do PCP (nao a soma das etapas do mapa).
  for (var p = 1; p < pcp.length; p++) {
    var lp = pcp[p] || [];
    if (pgTempSasAdaptNormalizar_(lp[ip.UNIDADE]) !== 'SAS ADAPT') continue;
    if (pgTempSasAdaptNormalizar_(lp[ip.ENVIO]) !== 'V1') continue;
    if (/CANCELAD|REENTRADA/.test(pgTempSasAdaptNormalizar_(lp[ip['CARACTERÍSTICA DA SOLICITAÇÃO']]))) continue;
    pcpTotal += pgTempSasAdaptNumero_(lp[ip.TIRAGEM]);
    linhasPcp++;
  }
  for (var m = 1; m < mapa.length; m++) {
    var l = mapa[m] || [];
    var marcaPCP = pgTempSasAdaptNormalizar_(l[im['UN PCP']]);
    var unidadeMapa = pgTempSasAdaptNormalizar_(l[im.UNIDADE]);
    if (marcaPCP !== 'SAS ADAPT' && unidadeMapa !== 'SAD') continue;
    if (pgTempSasAdaptNormalizar_(l[im.ENVIO]) !== 'V1') continue;
    var grafica = pgTempSasAdaptNormalizar_(l[im['GRÁFICA']]);
    var cdOriginal = pgTempSasAdaptNormalizar_(l[im['CD DESTINO']]);
    var chegaAthos = cdOriginal.indexOf('ATHOS') >= 0 && grafica !== 'ATHOS';
    var saiAthos = grafica === 'ATHOS' && cdOriginal && cdOriginal !== '-'
      && cdOriginal.indexOf('ATHOS') < 0 && cdOriginal.indexOf('ACABADORA') < 0;
    if (!chegaAthos && !saiAthos) continue;
    // So contabiliza a movimentacao registrada como coletada no mapa.
    var dataColeta = l[im['DT COLETA']];
    if (dataColeta === '' || dataColeta == null || dataColeta === 0 || dataColeta === '0') {
      semColeta++;
      continue;
    }
    var qtd = pgTempSasAdaptNumero_(l[im.TIRAGEM]);
    if (qtd <= 0) continue;
    if (chegaAthos) {
      entradas += qtd; linhasEntrada++;
      acumular(porGrafica, grafica || 'NÃO INFORMADA', qtd);
    } else {
      saidas += qtd; linhasSaida++;
      acumular(porCD, cdOriginal, qtd);
    }
  }
  return {
    pcpTotal: pcpTotal, entradasAthos: entradas, saidasCD: saidas,
    diferencaAthos: entradas - saidas, diferencaPCPEntrada: pcpTotal - entradas,
    entradasPorGrafica: tabela(porGrafica), saidasPorCD: tabela(porCD),
    linhasPcp: linhasPcp, linhasEntrada: linhasEntrada, linhasSaida: linhasSaida,
    movimentosSemColeta: semColeta,
    criterio: 'V1; UN PCP = SAS ADAPT ou UNIDADE original = SAD; movimentações com DT COLETA; origem GRÁFICA e CD DESTINO originais do mapa.'
  };
}

// Leitura sob demanda, apenas ao abrir a aba temporaria.
// PCP: colunas isoladas do arquivo que ja alimenta o portal.
// MAPA DE SAIDA: colunas A:P da planilha vinculada, sem usar CD/GRÁFICA PCP.
function getTempSasAdapt() {
  var mapa = pgLerAbaCache_(['MAPA DE SAÍDA', 'MAPA DE SAIDA', 'MAPA DE SAIDA '], 16);
  var idPCP = pgFonteExternaCache_(['PCP']);
  var metaPCP = pgMetadadosPlanilhaCache_(idPCP);
  if (metaPCP.nomes.indexOf('PCP') < 0) throw new Error('TEMP SAS ADAPT: aba PCP não encontrada');
  var grade = metaPCP.abas.filter(function(a) { return a.title === 'PCP'; })[0].gridProperties;
  var fim = grade.rowCount;
  var cols = ['BR', 'BT', 'BU', 'CD'];
  var resposta = Sheets.Spreadsheets.Values.batchGet(metaPCP.id, {
    ranges: cols.map(function(c) { return "'PCP'!" + c + "1:" + c + fim; }),
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  var colunas = resposta.valueRanges || [];
  if (colunas.length !== cols.length) throw new Error('TEMP SAS ADAPT: leitura incompleta do PCP');
  var pcp = [['UNIDADE', 'ENVIO', 'CARACTERÍSTICA DA SOLICITAÇÃO', 'TIRAGEM']];
  for (var i = 1; i < fim; i++) {
    var linha = colunas.map(function(c) { return (c.values && c.values[i] && c.values[i][0]) || ''; });
    if (linha[0]) pcp.push(linha);
  }
  return pgTempSasAdaptResumo_(mapa, pcp);
}
