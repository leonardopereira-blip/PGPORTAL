// TEMP SAS ADAPT: saida das graficas e producao finalizada na ATHOS.
// Leitura isolada dos dois PCPs; nao altera caches ou regras de outras telas.
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
function pgTempSasAdaptDiaISO_(valor) {
  function calendario(ano, mes, dia) {
    if (ano < 1900 || ano > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
    var data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return '';
    return String(ano) + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
  }
  function diaLocal(data) {
    if (!isFinite(data.getTime())) return '';
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      return Utilities.formatDate(data, 'America/Sao_Paulo', 'yyyy-MM-dd');
    }
    var partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(data);
    var campos = {};
    partes.forEach(function(p) { campos[p.type] = p.value; });
    return calendario(Number(campos.year), Number(campos.month), Number(campos.day));
  }
  if (valor == null || valor === '' || valor === 0 || valor === '0') return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') return diaLocal(valor);
  if (typeof valor === 'number') {
    if (!isFinite(valor) || valor <= 0) return '';
    var serial = new Date((Math.floor(valor) - 25569) * 86400000);
    return calendario(serial.getUTCFullYear(), serial.getUTCMonth() + 1, serial.getUTCDate());
  }
  var texto = String(valor).trim();
  var br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) return calendario(Number(br[3]), Number(br[2]), Number(br[1]));
  var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) return calendario(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  var instante = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(texto);
  if (instante && calendario(Number(instante[1]), Number(instante[2]), Number(instante[3]))) {
    return diaLocal(new Date(texto));
  }
  return '';
}
function pgTempSasAdaptData_(valor) {
  var iso = pgTempSasAdaptDiaISO_(valor);
  if (iso) return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  return valor == null || valor === 0 || valor === '0' ? '' : String(valor).trim();
}
function pgTempSasAdaptColuna_(numero) {
  var letra = '';
  while (numero > 0) {
    numero--;
    letra = String.fromCharCode(65 + numero % 26) + letra;
    numero = Math.floor(numero / 26);
  }
  return letra;
}
// Resolve as colunas pelo cabecalho atual antes de buscar somente os campos usados.
// Values.batchGet conserva os indices fisicos mesmo com celulas vazias.
function pgTempSasAdaptLerColunas_(nomes, campos) {
  if (!Array.isArray(nomes)) nomes = [nomes];
  var meta = pgMetadadosPlanilhaCache_(pgFonteExternaCache_(nomes));
  var aba = nomes.filter(function(n) { return meta.nomes.indexOf(n) >= 0; })[0];
  if (!aba) throw new Error('TEMP SAS ADAPT: aba nao encontrada: ' + nomes.join('/'));
  var grade = meta.abas.filter(function(s) { return s.title === aba; })[0].gridProperties;
  var prefixo = "'" + aba.replace(/'/g, "''") + "'!";
  var cab = Sheets.Spreadsheets.Values.get(meta.id, prefixo + 'A1:' + pgTempSasAdaptColuna_(grade.columnCount) + '1', {
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  }).values || [];
  var normalizado = (cab[0] || []).map(pgTempSasAdaptNormalizar_);
  var colunas = campos.map(function(campo) {
    var posicao = normalizado.indexOf(pgTempSasAdaptNormalizar_(campo));
    if (posicao < 0) throw new Error('TEMP SAS ADAPT: coluna ' + campo + ' ausente em ' + aba);
    return pgTempSasAdaptColuna_(posicao + 1);
  });
  var resposta = Sheets.Spreadsheets.Values.batchGet(meta.id, {
    ranges: colunas.map(function(c) { return prefixo + c + '1:' + c + grade.rowCount; }),
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  var valores = resposta.valueRanges || [];
  if (valores.length !== campos.length) throw new Error('TEMP SAS ADAPT: retorno incompleto de ' + aba);
  var ultimo = 1, saida = [];
  valores.forEach(function(c) { ultimo = Math.max(ultimo, (c.values || []).length); });
  for (var i = 0; i < ultimo; i++) {
    saida.push(valores.map(function(c) {
      return c.values && c.values[i] && c.values[i][0] != null ? c.values[i][0] : '';
    }));
  }
  return saida;
}
function pgTempSasAdaptResumo_(pcp, athos, hojeISO) {
  function idx(cab, nomes, fonte) {
    var lista = (cab || []).map(pgTempSasAdaptNormalizar_), indices = {};
    nomes.forEach(function(n) {
      var coluna = lista.indexOf(pgTempSasAdaptNormalizar_(n));
      if (coluna < 0) throw new Error('TEMP SAS ADAPT: coluna ' + n + ' ausente em ' + fonte);
      indices[n] = coluna;
    });
    return indices;
  }
  var pcols = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM','TIRAGEM TOTAL','TIRAGEM COLETADA','Data_Coleta_Mapa','Entrega_TP'];
  var acols = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM A ENTREGAR (total por CD)','Tiragem recebida (Total SKU)',
    'Formação de kit/Encaixotamento Final Real','Acbto Final Real'];
  var p = idx(pcp[0], pcols, 'PCP'), a = idx(athos[0], acols, 'PCP_ACABADORAS');
  var hoje = hojeISO == null ? pgTempSasAdaptDiaISO_(new Date()) : pgTempSasAdaptDiaISO_(hojeISO);
  if (!hoje) throw new Error('TEMP SAS ADAPT: data de referencia invalida');
  var operacoes = Object.create(null), graficas = Object.create(null), skusOrigem = Object.create(null);
  var skusAthos = Object.create(null), linhasGraficas = [], linhasAthos = [], diagnosticos = [];
  var pcpTotal = 0, saiuBruto = 0, saiu = 0, totalAthos = 0, produzido = 0, qtdApontamentos = 0;
  function graficaObj(nome) {
    if (!graficas[nome]) graficas[nome] = { nome: nome, total: 0, saiu: 0, saiuBruto: 0, excedente: 0 };
    return graficas[nome];
  }
  for (var i = 1; i < pcp.length; i++) {
    var linha = pcp[i] || [];
    if (pgTempSasAdaptNormalizar_(linha[p.UNIDADE]) !== 'SAS ADAPT') continue;
    var envio = pgTempSasAdaptNormalizar_(linha[p.ENVIO]);
    if (envio !== 'V1') continue;
    var destino = pgTempSasAdaptNormalizar_(linha[p['CD DESTINO']]);
    if (destino.indexOf('ATHOS') < 0) continue;
    var caracteristica = String(linha[p['CARACTERÍSTICA DA SOLICITAÇÃO']] || '').trim();
    if (/CANCELAD|REENTRADA/.test(pgTempSasAdaptNormalizar_(caracteristica))) continue;
    var sku = pgTempSasAdaptNormalizar_(linha[p.SKU]);
    if (!sku) continue;
    var grafica = pgTempSasAdaptNormalizar_(linha[p['GRÁFICA']]) || 'NÃO INFORMADA';
    var total = pgTempSasAdaptNumero_(linha[p['TIRAGEM TOTAL']]);
    var coleta = pgTempSasAdaptNumero_(linha[p['TIRAGEM COLETADA']]);
    var chave = JSON.stringify([grafica, sku, destino, envio]);
    if (!operacoes[chave]) operacoes[chave] = { chave: chave, grafica: grafica, sku: sku, total: 0, coleta: 0, linhas: [] };
    operacoes[chave].total += total;
    operacoes[chave].coleta += coleta;
    if (!skusOrigem[sku]) skusOrigem[sku] = { sku: sku, total: 0, saiu: 0, saiuBruto: 0, graficas: Object.create(null) };
    skusOrigem[sku].total += total;
    skusOrigem[sku].saiuBruto += coleta;
    skusOrigem[sku].graficas[grafica] = true;
    pcpTotal += total;
    saiuBruto += coleta;
    var auditoria = {
      source: 'PCP', fonte: 'PCP', row: i + 1, linha: i + 1, id: linha[p.ID], sku: sku,
      grafica: grafica, destino: destino, envio: envio, rawUnit: String(linha[p.UNIDADE] || ''),
      caracteristica: caracteristica, operacao: chave, total: total,
      tiragemRaw: pgTempSasAdaptNumero_(linha[p.TIRAGEM]), saiuBruto: coleta,
      saiuReconhecido: 0, totalOperacao: 0, saiuBrutoOperacao: 0, excedenteOperacao: 0,
      linhasAgrupadas: '', dataColeta: pgTempSasAdaptData_(linha[p.Data_Coleta_Mapa]),
      dataColetaRaw: linha[p.Data_Coleta_Mapa], entregaTP: pgTempSasAdaptData_(linha[p.Entrega_TP]),
      entregaTPRaw: linha[p.Entrega_TP]
    };
    operacoes[chave].linhas.push(auditoria);
    linhasGraficas.push(auditoria);
  }
  Object.keys(operacoes).forEach(function(chave) {
    var op = operacoes[chave];
    var reconhecido = Math.max(0, Math.min(op.total, op.coleta));
    var excedente = Math.max(0, op.coleta - Math.max(0, op.total));
    var graf = graficaObj(op.grafica);
    graf.total += op.total;
    graf.saiu += reconhecido;
    graf.saiuBruto += op.coleta;
    graf.excedente += excedente;
    saiu += reconhecido;
    skusOrigem[op.sku].saiu += reconhecido;
    var linhas = op.linhas.map(function(l) { return l.row; }).join(', ');
    op.linhas.forEach(function(l, n) {
      l.totalOperacao = op.total;
      l.saiuBrutoOperacao = op.coleta;
      l.excedenteOperacao = excedente;
      l.linhasAgrupadas = linhas;
      // A coluna bruta permanece em cada origem; o reconhecido aparece uma vez.
      l.saiuReconhecido = n === 0 ? reconhecido : 0;
    });
  });
  for (var j = 1; j < athos.length; j++) {
    var l = athos[j] || [];
    if (pgTempSasAdaptNormalizar_(l[a['GRÁFICA']]) !== 'ATHOS') continue;
    if (pgTempSasAdaptNormalizar_(l[a.ENVIO]) !== 'V1') continue;
    var unidadeAthos = pgTempSasAdaptNormalizar_(l[a.UNIDADE]);
    if (unidadeAthos !== 'SAS' && unidadeAthos !== 'SAS ADAPT') continue;
    var caract = String(l[a['CARACTERÍSTICA DA SOLICITAÇÃO']] || '').trim();
    if (/CANCELAD|REENTRADA/.test(pgTempSasAdaptNormalizar_(caract))) continue;
    var codigo = pgTempSasAdaptNormalizar_(l[a.SKU]);
    // A mesma origem SAS ADAPT possui linhas UNIDADE SAS e SAS ADAPT na ATHOS.
    if (!codigo || !skusOrigem[codigo]) continue;
    var volume = pgTempSasAdaptNumero_(l[a['TIRAGEM A ENTREGAR (total por CD)']]);
    var recebida = pgTempSasAdaptNumero_(l[a['Tiragem recebida (Total SKU)']]);
    var dataFinalRaw = l[a['Formação de kit/Encaixotamento Final Real']];
    var dataFinalISO = pgTempSasAdaptDiaISO_(dataFinalRaw);
    var apontada = Boolean(dataFinalISO && dataFinalISO <= hoje);
    var volumeProduzido = apontada ? volume : 0;
    if (!skusAthos[codigo]) skusAthos[codigo] = {
      sku: codigo, total: 0, recebido: 0, recebidoReconhecido: 0, produzido: 0,
      producaoApontada: false, qtdApontamentos: 0, recebimentos: Object.create(null), linhas: []
    };
    var item = skusAthos[codigo];
    item.total += volume;
    // BB e total por SKU: repete em eventuais linhas destinadas a CDs diferentes.
    item.recebido = Math.max(item.recebido, recebida);
    if (recebida > 0) item.recebimentos[String(recebida)] = true;
    item.produzido += volumeProduzido;
    item.producaoApontada = item.producaoApontada || apontada;
    item.qtdApontamentos += apontada ? 1 : 0;
    totalAthos += volume;
    produzido += volumeProduzido;
    qtdApontamentos += apontada ? 1 : 0;
    var statusFinal = apontada ? 'Finalizado' : dataFinalISO ? 'Data futura' :
      dataFinalRaw == null || dataFinalRaw === '' || dataFinalRaw === 0 || dataFinalRaw === '0' ? 'Sem apontamento' : 'Data final inválida';
    var auditAthos = {
      source: 'PCP_ACABADORAS', fonte: 'PCP_ACABADORAS', row: j + 1, linha: j + 1,
      id: l[a.ID], sku: codigo, grafica: 'ATHOS', destino: pgTempSasAdaptNormalizar_(l[a['CD DESTINO']]),
      envio: 'V1', rawUnit: String(l[a.UNIDADE] || ''), caracteristica: caract,
      total: volume, recebidoRaw: recebida, recebido: 0, recebidoReconhecido: 0,
      produzido: volumeProduzido, producaoApontada: apontada,
      dataFinalizacao: pgTempSasAdaptData_(dataFinalRaw), dataFinalizacaoISO: dataFinalISO,
      dataFinalizacaoRaw: dataFinalRaw, statusFinalizacao: statusFinal,
      dataAcabamento: pgTempSasAdaptData_(l[a['Acbto Final Real']]), dataAcabamentoRaw: l[a['Acbto Final Real']],
      linhasAgrupadas: '', recebimentoDivergente: false
    };
    item.linhas.push(auditAthos);
    linhasAthos.push(auditAthos);
  }
  var recebidoAthos = 0, recebidoReconhecido = 0;
  var athosPorSku = Object.keys(skusAthos).map(function(sku) {
    var item = skusAthos[sku];
    item.recebidoReconhecido = Math.max(0, Math.min(item.total, item.recebido));
    recebidoAthos += item.recebido;
    recebidoReconhecido += item.recebidoReconhecido;
    var divergente = Object.keys(item.recebimentos).length > 1;
    if (divergente) diagnosticos.push({ tipo: 'RECEBIMENTO_DIVERGENTE', sku: sku,
      valores: Object.keys(item.recebimentos).map(Number), recebidoUtilizado: item.recebido,
      linhas: item.linhas.map(function(l) { return l.row; }) });
    var linhas = item.linhas.map(function(l) { return l.row; }).join(', ');
    item.linhas.forEach(function(l, n) {
      l.recebido = n === 0 ? item.recebido : 0;
      l.recebidoReconhecido = n === 0 ? item.recebidoReconhecido : 0;
      l.linhasAgrupadas = linhas;
      l.recebimentoDivergente = divergente;
    });
    return { sku: sku, total: item.total, recebido: item.recebido,
      recebidoReconhecido: item.recebidoReconhecido, produzido: item.produzido,
      producaoApontada: item.producaoApontada, qtdApontamentos: item.qtdApontamentos,
      recebimentoDivergente: divergente };
  }).sort(function(x, y) { return x.sku.localeCompare(y.sku); });
  var pcpPorSku = Object.keys(skusOrigem).map(function(sku) {
    var item = skusOrigem[sku];
    return { sku: sku, total: item.total, saiu: item.saiu, saiuBruto: item.saiuBruto,
      graficas: Object.keys(item.graficas).sort().join(', ') };
  }).sort(function(x, y) { return x.sku.localeCompare(y.sku); });
  return {
    dataReferencia: hoje, pcpTotal: pcpTotal, saiuGraficas: saiu, saiuGraficasBruto: saiuBruto,
    totalAthos: totalAthos, recebidoAthos: recebidoAthos, recebidoAthosReconhecido: recebidoReconhecido,
    produzidoAthos: produzido, producaoApontada: qtdApontamentos > 0, qtdApontamentos: qtdApontamentos,
    graficas: Object.keys(graficas).map(function(k) { return graficas[k]; })
      .sort(function(x, y) { return y.total - x.total || x.nome.localeCompare(y.nome); }),
    athosPorSku: athosPorSku, pcpPorSku: pcpPorSku,
    linhasGraficas: linhasGraficas, linhasAthos: linhasAthos,
    qtdLinhasGraficas: linhasGraficas.length, qtdLinhasAthos: linhasAthos.length, diagnosticos: diagnosticos
  };
}
function getTempSasAdapt() {
  var pCampos = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM','TIRAGEM TOTAL','TIRAGEM COLETADA','Data_Coleta_Mapa','Entrega_TP'];
  var aCampos = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM A ENTREGAR (total por CD)','Tiragem recebida (Total SKU)',
    'Formação de kit/Encaixotamento Final Real','Acbto Final Real'];
  var pcp = pgTempSasAdaptLerColunas_('PCP', pCampos);
  var athos = pgTempSasAdaptLerColunas_('PCP_ACABADORAS', aCampos);
  var resumo = pgTempSasAdaptResumo_(pcp, athos);
  resumo.atualizadoEm = new Date().toISOString();
  return resumo;
}
