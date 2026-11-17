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
function pgTempSasAdaptLerColunas_(nomes, campos, idExterno) {
  if (!Array.isArray(nomes)) nomes = [nomes];
  var meta = pgMetadadosPlanilhaCache_(idExterno || pgFonteExternaCache_(nomes));
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

function pgTempSasAdaptLerInternalizado_() {
  var fontes = {
    'CD JDI': '1qyRgj1_hdiJDo1zEu21vMSioeZe_i-emmnCPV4FMErk',
    'CD FOR': '1nCVxwkQw_loqHCGahYoTa-8ZyFy42gXg7hC2MliUoHM'
  };
  var porCD = Object.create(null), previsoesPorCD = Object.create(null), indisponiveis = [];
  Object.keys(fontes).forEach(function(cd) {
    try {
      var valores = pgTempSasAdaptLerColunas_('SAS V1 27', ['Cód Kit', 'Cód Item', 'Previsão', 'Recebido'], fontes[cd]);
      var itens = Object.create(null), previsoes = Object.create(null);
      // RECEBIDO na fonte é calculado pelo kit. Um Cód Item pode pertencer a outros kits.
      valores.slice(1).forEach(function(linha) {
        var kit = pgTempSasAdaptNormalizar_(linha[0]), sku = pgTempSasAdaptNormalizar_(linha[1]);
        if (!kit || !sku) return;
        var chave = JSON.stringify([sku, kit]);
        previsoes[chave] = (previsoes[chave] || 0) + Math.max(0, pgTempSasAdaptNumero_(linha[2]));
        itens[chave] = (itens[chave] || 0) + Math.max(0, pgTempSasAdaptNumero_(linha[3]));
      });
      porCD[cd] = itens;
      previsoesPorCD[cd] = previsoes;
    } catch (e) {
      indisponiveis.push(cd);
      console.warn('[TEMP SAS ADAPT] Não foi possível ler o internalizado de ' + cd + ': ' + e.message);
    }
  });
  return {porCD: porCD, previsoesPorCD: previsoesPorCD, indisponiveis: indisponiveis};
}

function pgTempSasAdaptDestino_(valor) {
  var s = pgTempSasAdaptNormalizar_(valor);
  if (!s || s === '-' || s === '–' || s === 'N/A' || s === 'NAO INFORMADO') return '';
  if (/(?:^|\W)(?:JDI|JUNDIAI)(?:\W|$)/.test(s)) return 'CD JDI';
  if (/(?:^|\W)(?:FOR|FORTALEZA|ITAITINGA)(?:\W|$)/.test(s)) return 'CD FOR';
  if (/(?:^|\W)(?:RP|RIBEIRAO PRETO)(?:\W|$)/.test(s)) return 'CD RP';
  return s.replace(/^CD\s+/, '');
}
// Somente na TEMP SAS ADAPT: a expedidora vem de GRAFICA PCP (coluna C).
// Codigo, Kit, destino, envio, SKU e volume saem das colunas ORIGINAIS do
// Mapa de Saida. Nao usar CD PCP ou dados transformados de outra visao.
function pgTempSasAdaptLerSaidasMapa_() {
  var nomes = ['MAPA DE SAÍDA','MAPA DE SAIDA','MAPA DE SAIDA '];
  var meta = pgMetadadosPlanilhaCache_(pgFonteExternaCache_(nomes));
  var aba = nomes.filter(function(n) { return meta.nomes.indexOf(n) >= 0; })[0];
  if (!aba) throw new Error('TEMP SAS ADAPT: Mapa de Saída não encontrado');
  var grade = meta.abas.filter(function(x) { return x.title === aba; })[0].gridProperties;
  var prefixo = "'" + aba.replace(/'/g, "''") + "'!";
  // C=GRAFICA PCP; E=mapa; G=CD original; H=envio original;
  // K=kit; L=SKU; O=mapa solicitado; AN=coletado; AT=Coleta TP; AU=Entrega TP.
  var letras = ['C','E','G','H','K','L','O','AN','AT','AU','U','W'];
  var retorno = Sheets.Spreadsheets.Values.batchGet(meta.id, {
    ranges: letras.map(function(col) { return prefixo + col + '2:' + col + grade.rowCount; }),
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  }).valueRanges || [];
  if (retorno.length !== letras.length) throw new Error('TEMP SAS ADAPT: leitura incompleta do Mapa de Saída');
  var n = 0, saidas = [];
  retorno.forEach(function(r) { n = Math.max(n, (r.values || []).length); });
  for (var i = 0; i < n; i++) {
    var v = retorno.map(function(r) { return r.values && r.values[i] && r.values[i][0] != null ? r.values[i][0] : ''; });
    var grafica = pgTempSasAdaptNormalizar_(v[0]);
    var envio = pgTempSasAdaptNormalizar_(v[3]);
    if ((grafica !== 'ATHOS' && grafica.indexOf('ATHOS ') !== 0) || envio !== 'V1') continue;
    var tiragem = Math.max(0, pgTempSasAdaptNumero_(v[6]));
    var coletado = Math.max(0, pgTempSasAdaptNumero_(v[7]));
    if (!tiragem && !coletado) continue;
    var sku = pgTempSasAdaptNormalizar_(v[5]), destino = pgTempSasAdaptDestino_(v[2]);
    if (!sku || !destino) continue;
    saidas.push({sku: sku, destino: destino, codigoMapa: pgTempSasAdaptNormalizar_(v[1]),
      kit: pgTempSasAdaptNormalizar_(v[4]), tiragem: tiragem, coletado: coletado,
      dataColeta: pgTempSasAdaptDiaISO_(v[8]), dataEntrega: pgTempSasAdaptDiaISO_(v[9]),
      nfVenda: v[10], nfRemessa: v[11], linhaMapa: i + 2});
  }
  return saidas;
}

function pgTempSasAdaptSaidaPorSkuCD_(saidasMapa, internalizado, skusOrigem) {
  var escopo = skusOrigem ? new Set(skusOrigem) : null;
  var parcelas = new Map(), porKitSkuCD = new Map(), porCD = new Map();
  function chaveLinha(kit, sku, destino) { return JSON.stringify([kit, sku, destino]); }
  function linha(kit, sku, destino) {
    var chave = chaveLinha(kit, sku, destino);
    if (!porKitSkuCD.has(chave)) porKitSkuCD.set(chave, {
      kit: kit, sku: sku, destino: destino, total: null, mapaSolicitado: 0,
      coletado: 0, entregue: 0, internalizado: null
    });
    return porKitSkuCD.get(chave);
  }

  // Somente vínculos kit/SKU/CD existentes no Mapa da Athos pertencem a esta
  // operação. O CD possui outros kits de SAS com o mesmo SKU; não incluí-los.
  saidasMapa.forEach(function(mapa) {
    var destino = pgTempSasAdaptDestino_(mapa.destino);
    if (destino !== 'CD JDI' && destino !== 'CD FOR') return;
    var sku = pgTempSasAdaptNormalizar_(mapa.sku);
    if (!sku || (escopo && !escopo.has(sku))) return;
    var kit = pgTempSasAdaptNormalizar_(mapa.kit);
    var codigo = pgTempSasAdaptNormalizar_(mapa.codigoMapa) || 'LINHA ' + mapa.linhaMapa;
    var chave = JSON.stringify([sku, destino, codigo, kit]);
    if (!parcelas.has(chave)) {
      parcelas.set(chave, {sku: sku, destino: destino, kit: kit,
        mapaSolicitado: 0, coletado: 0, entregue: 0});
    }
    var parcela = parcelas.get(chave);
    parcela.mapaSolicitado = Math.max(parcela.mapaSolicitado, pgTempSasAdaptNumero_(mapa.tiragem));
    // AN só se torna coleta/entrega real quando a respectiva data TP existe.
    if (pgTempSasAdaptDiaISO_(mapa.dataColeta)) {
      parcela.coletado = Math.max(parcela.coletado, pgTempSasAdaptNumero_(mapa.coletado));
    }
    if (pgTempSasAdaptDiaISO_(mapa.dataEntrega)) {
      parcela.entregue = Math.max(parcela.entregue, pgTempSasAdaptNumero_(mapa.coletado));
    }
  });
  parcelas.forEach(function(parcela) {
    var item = linha(parcela.kit, parcela.sku, parcela.destino);
    item.mapaSolicitado += parcela.mapaSolicitado;
    item.coletado += parcela.coletado;
    item.entregue += parcela.entregue;
  });

  // Para cada vínculo físico da operação, o denominador é a PREVISÃO do CD.
  porKitSkuCD.forEach(function(item) {
    var chave = JSON.stringify([item.sku, item.kit]);
    var previsoes = (internalizado.previsoesPorCD || {})[item.destino] || {};
    var recebidos = (internalizado.porCD || {})[item.destino] || {};
    if (Object.prototype.hasOwnProperty.call(previsoes, chave)) {
      item.total = pgTempSasAdaptNumero_(previsoes[chave]);
    }
    if (Object.prototype.hasOwnProperty.call(recebidos, chave)) {
      item.internalizado = pgTempSasAdaptNumero_(recebidos[chave]);
    }
  });

  // Sem Previsão no CD a linha fica auditável, sem assumir o total do Mapa.
  var internalizacaoSemCorrespondencia = 0;
  var athosPorSku = Array.from(porKitSkuCD.values(), function(item) {
    if (item.mapaSolicitado > 0 && item.internalizado === null &&
        (internalizado.porCD || {})[item.destino]) internalizacaoSemCorrespondencia++;
    if (!porCD.has(item.destino)) {
      porCD.set(item.destino, {destino: item.destino, total: 0, mapaSolicitado: 0,
        coletado: 0, entregue: 0, internalizado: null});
    }
    var expedicao = porCD.get(item.destino);
    expedicao.total += item.total || 0;
    expedicao.mapaSolicitado += item.mapaSolicitado;
    expedicao.coletado += item.coletado;
    expedicao.entregue += item.entregue;
    if (item.internalizado !== null) {
      expedicao.internalizado = (expedicao.internalizado === null ? 0 : expedicao.internalizado) + item.internalizado;
    }
    return item;
  }).sort(function(x, y) {
    return x.sku.localeCompare(y.sku) || x.kit.localeCompare(y.kit) || x.destino.localeCompare(y.destino);
  });
  var expedicoesAthos = Array.from(porCD.values()).sort(function(x, y) {
    return y.total - x.total || x.destino.localeCompare(y.destino);
  });
  var cdsComInternalizado = expedicoesAthos.filter(function(cd) { return cd.internalizado !== null; });
  var temCDIndisponivel = expedicoesAthos.some(function(cd) { return !(internalizado.porCD || {})[cd.destino]; });
  return {
    athosPorSku: athosPorSku, expedicoesAthos: expedicoesAthos,
    mapaSolicitado: expedicoesAthos.reduce(function(total, cd) { return total + cd.mapaSolicitado; }, 0),
    coletadoAthos: expedicoesAthos.reduce(function(total, cd) { return total + cd.coletado; }, 0),
    entregueAthos: expedicoesAthos.reduce(function(total, cd) { return total + cd.entregue; }, 0),
    internalizadoAthos: temCDIndisponivel || !cdsComInternalizado.length ? null :
      cdsComInternalizado.reduce(function(total, cd) { return total + cd.internalizado; }, 0),
    internalizacaoIndisponivel: internalizado.indisponiveis,
    internalizacaoSemCorrespondencia: internalizacaoSemCorrespondencia
  };
}

function pgTempSasAdaptTiragemAcabadoras_(acabadoras) {
  var campos = ['GRÁFICA', 'UNIDADE', 'ENVIO', 'CARACTERÍSTICA DA SOLICITAÇÃO',
    'SKU', 'TIRAGEM A ENTREGAR (total por CD)'];
  var p = pgTempSasAdaptIndices_(acabadoras[0], campos, 'PCP_ACABADORAS');
  var skus = new Set(), total = 0;
  for (var i = 1; i < acabadoras.length; i++) {
    var l = acabadoras[i] || [], sku = pgTempSasAdaptNormalizar_(l[p.SKU]);
    // ATHOS/V1 é SAS Adapt mesmo quando a coluna UNIDADE traz apenas SAS.
    if (!sku || pgTempSasAdaptNormalizar_(l[p['GRÁFICA']]) !== 'ATHOS' ||
        pgTempSasAdaptNormalizar_(l[p.ENVIO]) !== 'V1' ||
        !['SAS', 'SAS ADAPT'].includes(pgTempSasAdaptNormalizar_(l[p.UNIDADE])) ||
        /CANCELAD|REENTRADA/.test(pgTempSasAdaptNormalizar_(l[p['CARACTERÍSTICA DA SOLICITAÇÃO']]))) continue;
    skus.add(sku);
    total += Math.max(0, pgTempSasAdaptNumero_(l[p['TIRAGEM A ENTREGAR (total por CD)']]));
  }
  return {total: total, skus: Array.from(skus)};
}

var PG_TEMP_SAS_ADAPT_CAMPOS_PCP = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
  'CD DESTINO','TIRAGEM','TIRAGEM TOTAL','TIRAGEM COLETADA','Data_Coleta_Mapa','Entrega_TP'];

function pgTempSasAdaptIndices_(cabecalho, campos, fonte) {
  var lista = (cabecalho || []).map(pgTempSasAdaptNormalizar_), indices = {};
  campos.forEach(function(campo) {
    var coluna = lista.indexOf(pgTempSasAdaptNormalizar_(campo));
    if (coluna < 0) throw new Error('TEMP SAS ADAPT: coluna ' + campo + ' ausente em ' + fonte);
    indices[campo] = coluna;
  });
  return indices;
}

function pgTempSasAdaptResumoGraficas_(pcp, hojeISO) {
  var p = pgTempSasAdaptIndices_(pcp[0], PG_TEMP_SAS_ADAPT_CAMPOS_PCP, 'PCP');
  var hoje = hojeISO == null ? pgTempSasAdaptDiaISO_(new Date()) : pgTempSasAdaptDiaISO_(hojeISO);
  if (!hoje) throw new Error('TEMP SAS ADAPT: data de referencia invalida');
  var operacoes = Object.create(null), graficas = Object.create(null), skusOrigem = Object.create(null);
  var linhasGraficas = [], pcpTotal = 0, saiuBruto = 0, saiu = 0;
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
  var pcpPorSku = Object.keys(skusOrigem).map(function(sku) {
    var item = skusOrigem[sku];
    return { sku: sku, total: item.total, saiu: item.saiu, saiuBruto: item.saiuBruto,
      graficas: Object.keys(item.graficas).sort().join(', ') };
  }).sort(function(x, y) { return x.sku.localeCompare(y.sku); });
  return {
    dataReferencia: hoje, pcpTotal: pcpTotal, saiuGraficas: saiu, saiuGraficasBruto: saiuBruto,
    graficas: Object.keys(graficas).map(function(k) { return graficas[k]; })
      .sort(function(x, y) { return y.total - x.total || x.nome.localeCompare(y.nome); }),
    pcpPorSku: pcpPorSku, linhasGraficas: linhasGraficas, qtdLinhasGraficas: linhasGraficas.length
  };
}

function pgTempSasAdaptResumo_(pcp, athos, hojeISO, saidasMapa) {
  var resumo = pgTempSasAdaptResumoGraficas_(pcp, hojeISO);
  var acols = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM A ENTREGAR (total por CD)','Tiragem recebida (Total SKU)',
    'Formação de kit/Encaixotamento Final Real','Acbto Final Real'];
  var a = pgTempSasAdaptIndices_(athos[0], acols, 'PCP_ACABADORAS');
  var hoje = resumo.dataReferencia;
  var skusOrigem = new Set(resumo.pcpPorSku.map(function(item) { return item.sku; }));
  var skusAthos = Object.create(null), expedicoesAthos = Object.create(null), linhasAthos = [], diagnosticos = [];
  var totalAthos = 0, produzido = 0, coletadoAthos = 0, qtdApontamentos = 0;
  // Concilia parcelas de saida por mapa/SKU/CD; codigos repetidos nao
  // duplicam a quantidade coletada. Nao compensa atraso de outro destino.
  var parcelasMapa = Object.create(null), saidaPorDestino = Object.create(null);
  (saidasMapa || []).forEach(function(m) {
    var sku = pgTempSasAdaptNormalizar_(m.sku), destino = pgTempSasAdaptDestino_(m.destino);
    if (!skusOrigem.has(sku) || !destino) return;
    var codigo = pgTempSasAdaptNormalizar_(m.codigoMapa);
    // O mesmo mapa pode levar diversos kits do mesmo SKU. Somar kits distintos,
    // mantendo protecao contra repeticao identica de mapa/SKU/CD/kit.
    var kit = pgTempSasAdaptNormalizar_(m.kit);
    var chave = JSON.stringify([sku, destino, codigo || 'LINHA ' + m.linhaMapa, kit]);
    var volume = Math.max(0, pgTempSasAdaptNumero_(m.coletado));
    if (!parcelasMapa[chave] || parcelasMapa[chave].volume < volume) {
      parcelasMapa[chave] = {sku: sku, destino: destino, codigo: codigo, volume: volume};
    }
  });
  Object.keys(parcelasMapa).forEach(function(chave) {
    var m = parcelasMapa[chave], k = JSON.stringify([m.sku, m.destino]);
    if (!saidaPorDestino[k]) saidaPorDestino[k] = {sku:m.sku, destino:m.destino, restante: 0, mapas: []};
    saidaPorDestino[k].restante += m.volume;
    if (m.codigo && saidaPorDestino[k].mapas.indexOf(m.codigo) < 0) saidaPorDestino[k].mapas.push(m.codigo);
  });
  // As parcelas que já têm CD explícito no PCP_ACABADORAS são consumidas
  // antes das linhas sem CD; um destino informado nunca perde sua quantidade.
  var destinosInformados = Object.create(null);
  for(var ac=1;ac<athos.length;ac++){
    var al=athos[ac]||[];
    var aSku=pgTempSasAdaptNormalizar_(al[a.SKU]);
    if(!skusOrigem.has(aSku)||pgTempSasAdaptNormalizar_(al[a['GRÁFICA']])!=='ATHOS'||
      pgTempSasAdaptNormalizar_(al[a.ENVIO])!=='V1')continue;
    var aCD=pgTempSasAdaptDestino_(al[a['CD DESTINO']]);
    if(aCD)destinosInformados[JSON.stringify([aSku,aCD])]=true;
  }
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
    if (!codigo || !skusOrigem.has(codigo)) continue;
    var volume = pgTempSasAdaptNumero_(l[a['TIRAGEM A ENTREGAR (total por CD)']]);
    var recebida = pgTempSasAdaptNumero_(l[a['Tiragem recebida (Total SKU)']]);
    var dataFinalRaw = l[a['Formação de kit/Encaixotamento Final Real']];
    var dataFinalISO = pgTempSasAdaptDiaISO_(dataFinalRaw);
    var apontada = Boolean(dataFinalISO && dataFinalISO <= hoje);
    var destinoCD = pgTempSasAdaptDestino_(l[a['CD DESTINO']]);
    // O PCP_ACABADORAS pode não trazer CD para a saída Athos. Nesse caso,
    // a confirmação usa os destinos originais G do mapa por SKU, sem CD PCP.
    // Não se presume destino para volume ainda não expedido quando há vários CDs.
    var chavesSaida = destinoCD
      ? [JSON.stringify([codigo,destinoCD])]
      : Object.keys(saidaPorDestino).filter(function(k){
          var e=saidaPorDestino[k];
          return e.sku===codigo && !destinosInformados[JSON.stringify([codigo,e.destino])];
        }).sort();
    var saldoLinha = Math.max(0,volume),confirmadoMapa=0,codigosConfirmados=[];
    var volumesPorDestino=Object.create(null),cdsComMapa=[];
    chavesSaida.forEach(function(k){
      var saida=saidaPorDestino[k];
      if(!saida)return;
      cdsComMapa.push(saida.destino);
      var parcial=Math.min(saldoLinha,Math.max(0,saida.restante));
      saldoLinha-=parcial;
      saida.restante-=parcial;
      confirmadoMapa+=parcial;
      if(parcial>0){
        volumesPorDestino[saida.destino]=(volumesPorDestino[saida.destino]||0)+parcial;
        saida.mapas.forEach(function(c){if(codigosConfirmados.indexOf(c)<0)codigosConfirmados.push(c);});
      }
    });
    var destinoUnico=destinoCD||(cdsComMapa.length===1?cdsComMapa[0]:'');
    if(destinoUnico){
      // Sem CD no PCP mas um único CD no Mapa: todo o plano cabe nele.
      if(!expedicoesAthos[destinoUnico])expedicoesAthos[destinoUnico]={destino:destinoUnico,total:0,coletado:0};
      expedicoesAthos[destinoUnico].total+=volume;
    }else{
      // Sem CD e com diversos destinos: exibir só o que foi comprovado;
      // não atribuir artificialmente o saldo ao CD de uma coleta parcial.
      var semDestino=Math.max(0,volume-confirmadoMapa);
      if(semDestino){
        var indefinido='CD NÃO INFORMADO';
        if(!expedicoesAthos[indefinido])expedicoesAthos[indefinido]={destino:indefinido,total:0,coletado:0};
        expedicoesAthos[indefinido].total+=semDestino;
      }
      Object.keys(volumesPorDestino).forEach(function(cd){
        if(!expedicoesAthos[cd])expedicoesAthos[cd]={destino:cd,total:0,coletado:0};
        expedicoesAthos[cd].total+=volumesPorDestino[cd];
      });
    }
    Object.keys(volumesPorDestino).forEach(function(cd){
      if(!expedicoesAthos[cd])expedicoesAthos[cd]={destino:cd,total:0,coletado:0};
      expedicoesAthos[cd].coletado+=volumesPorDestino[cd];
    });
    coletadoAthos += confirmadoMapa;
    // Uma coleta Athos -> CD comprova finalizacao mesmo sem a data BP.
    // Quando BP ja finalizou, nao somar duas vezes a mesma tiragem.
    var volumeProduzido = Math.max(apontada ? volume : 0, confirmadoMapa);
    var finalizacaoComprovada = apontada || confirmadoMapa > 0;
    if (!skusAthos[codigo]) skusAthos[codigo] = {
      sku: codigo, total: 0, recebido: 0, recebidoReconhecido: 0, produzido: 0, coletado: 0,
      producaoApontada: false, qtdApontamentos: 0, recebimentos: Object.create(null), linhas: []
    };
    var item = skusAthos[codigo];
    item.total += volume;
    // BB e total por SKU: repete em eventuais linhas destinadas a CDs diferentes.
    item.recebido = Math.max(item.recebido, recebida);
    if (recebida > 0) item.recebimentos[String(recebida)] = true;
    item.produzido += volumeProduzido;
    item.coletado += confirmadoMapa;
    item.producaoApontada = item.producaoApontada || finalizacaoComprovada;
    item.qtdApontamentos += finalizacaoComprovada ? 1 : 0;
    totalAthos += volume;
    produzido += volumeProduzido;
    qtdApontamentos += finalizacaoComprovada ? 1 : 0;
    var statusFinal = apontada ? 'Finalizado no PCP' : confirmadoMapa > 0 ? 'Saída Athos para CD confirmada' :
      dataFinalISO ? 'Data futura' : 'Sem finalização comprovada';
    var auditAthos = {
      source: 'PCP_ACABADORAS', fonte: 'PCP_ACABADORAS', row: j + 1, linha: j + 1,
      id: l[a.ID], sku: codigo, grafica: 'ATHOS', destino: pgTempSasAdaptNormalizar_(l[a['CD DESTINO']]),
      envio: 'V1', rawUnit: String(l[a.UNIDADE] || ''), caracteristica: caract,
      total: volume, recebidoRaw: recebida, recebido: 0, recebidoReconhecido: 0,
      produzido: volumeProduzido, coletado: confirmadoMapa, producaoApontada: finalizacaoComprovada,
      saidaMapa: confirmadoMapa, codigosMapa: codigosConfirmados.join(', '),
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
      recebidoReconhecido: item.recebidoReconhecido, produzido: item.produzido, coletado: item.coletado,
      producaoApontada: item.producaoApontada, qtdApontamentos: item.qtdApontamentos,
      recebimentoDivergente: divergente };
  }).sort(function(x, y) { return x.sku.localeCompare(y.sku); });
  return Object.assign(resumo, {
    totalAthos: totalAthos, recebidoAthos: recebidoAthos, recebidoAthosReconhecido: recebidoReconhecido,
    produzidoAthos: produzido, coletadoAthos: coletadoAthos,
    producaoApontada: qtdApontamentos > 0, qtdApontamentos: qtdApontamentos,
    expedicoesAthos: Object.keys(expedicoesAthos).map(function(k) { return expedicoesAthos[k]; })
      .sort(function(x, y) { return y.total - x.total || x.destino.localeCompare(y.destino); }),
    athosPorSku: athosPorSku, linhasAthos: linhasAthos,
    qtdLinhasAthos: linhasAthos.length, diagnosticos: diagnosticos
  });
}
// Referencia de pedidos/componentes das janelas. Ela nao filtra nem modifica
// os PCPs e o Mapa usados pelos indicadores existentes.
function pgTempSasAdaptLerJanelas_() {
  var id = '1vBqSFyKqv8Ttco5LkfQm4SBLOU2EX7FWkOw3maBndIQ';
  var meta = Sheets.Spreadsheets.get(id, {
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))'
  });
  var abas = (meta.sheets || []).map(function(s) { return s.properties; })
    .filter(function(s) { return /^JANELA[\s_-]*\d/.test(pgTempSasAdaptNormalizar_(s.title)); });
  if (!abas.length) throw new Error('Nenhuma janela encontrada na planilha de referência.');
  var retorno = Sheets.Spreadsheets.Values.batchGet(id, {
    ranges: abas.map(function(s) {
      return "'" + s.title.replace(/'/g, "''") + "'!A1:Y" + s.gridProperties.rowCount;
    }),
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  }).valueRanges || [];
  if (retorno.length !== abas.length) throw new Error('Leitura incompleta das janelas.');
  return abas.map(function(s, i) {
    return {id: String(s.sheetId), titulo: s.title, valores: retorno[i].values || []};
  });
}

function pgTempSasAdaptEntregasJanelas_(janelas, saidasMapa) {
  // Uma unidade aqui é um exemplar da coluna K, não um kit finalizado.
  var grupos = Object.create(null), demandas = Object.create(null), parcelas = Object.create(null), volumes = Object.create(null);
  var grupoPorAba = {'0':1,'676724057':1,'1073453236':1,'1744242808':1,
    '1214924467':2,'1546857491':2,'1758854262':3};
  function chave(kit, sku, destino) {
    return JSON.stringify([pgTempSasAdaptNormalizar_(kit), pgTempSasAdaptNormalizar_(sku), pgTempSasAdaptDestino_(destino)]);
  }
  (janelas || []).forEach(function(janela) {
    var titulo = pgTempSasAdaptNormalizar_(janela.titulo), id = String(janela.id);
    var match = /^JANELA[\s_-]*([123])(?:\b|$)/.exec(titulo);
    var numero = grupoPorAba[id] || (match && Number(match[1]));
    if (!numero) throw new Error('Janela sem classificação: ' + janela.titulo);
    var valores = janela.valores || [], cab = (valores[0] || []).map(pgTempSasAdaptNormalizar_);
    function coluna(nome) {
      var i = cab.indexOf(pgTempSasAdaptNormalizar_(nome));
      if (i < 0) throw new Error('Coluna ' + nome + ' ausente em ' + janela.titulo + '.');
      return i;
    }
    if (cab[10] !== 'QTDE') throw new Error('Coluna K (Qtde) ausente em ' + janela.titulo + '.');
    var c = {pedido:coluna('Pedido'),kit:coluna('Cod Kit'),sku:coluna('Componente'),destino:coluna('CD')};
    var res = grupos[numero] || (grupos[numero] = {id:String(numero),titulo:'Janela '+numero,
      total:0,entregue:0,saldo:0,aConferir:0,pedidos:0,fonteIds:[],fonteTitulos:[]});
    res.fonteIds.push(id);
    res.fonteTitulos.push(janela.titulo);
    var pedidos = Object.create(null);
    for (var i=1;i<valores.length;i++) {
      var linha=valores[i] || [], raw=linha[10];
      if (raw == null || raw === '') continue;
      var q=pgTempSasAdaptNumero_(raw);
      if (!isFinite(q) || q < 0 || !isFinite(typeof raw === 'number' ? raw : Number(String(raw).replace(/\./g,'').replace(',','.'))))
        throw new Error('Qtde inválida em '+janela.titulo+', linha '+(i+1)+'.');
      if (!q) continue;
      var pedido=pgTempSasAdaptNormalizar_(linha[c.pedido]),kit=pgTempSasAdaptNormalizar_(linha[c.kit]),
        sku=pgTempSasAdaptNormalizar_(linha[c.sku]),cd=pgTempSasAdaptDestino_(linha[c.destino]);
      if (!pedido || !kit || !sku || !cd) throw new Error('Referência incompleta em '+janela.titulo+', linha '+(i+1)+'.');
      var kp=JSON.stringify([pedido,kit,cd]);
      if (!pedidos[kp]) { pedidos[kp]=true; res.pedidos++; }
      var k=chave(kit,sku,cd), d=demandas[k] || (demandas[k]=Object.create(null));
      d[numero]=(d[numero]||0)+q;
      res.total+=q;
    }
  });
  // As parcelas do mesmo mapa/kit/componente/CD são contadas somente uma vez.
  (saidasMapa || []).forEach(function(m) {
    var k=chave(m.kit,m.sku,m.destino);
    if (!demandas[k]) return;
    var volume=Math.max(0,pgTempSasAdaptNumero_(m.coletado)), mp=pgTempSasAdaptNormalizar_(m.codigoMapa);
    var id=JSON.stringify([k,mp||'LINHA '+m.linhaMapa]);
    if (!parcelas[id] || parcelas[id].volume<volume) parcelas[id]={chave:k,volume:volume};
  });
  Object.keys(parcelas).forEach(function(id) {
    var p=parcelas[id]; volumes[p.chave]=(volumes[p.chave]||0)+p.volume;
  });
  Object.keys(demandas).forEach(function(k) {
    var d=demandas[k], ns=Object.keys(d), total=ns.reduce(function(s,n){return s+d[n];},0);
    var coleta=Math.min(total,volumes[k]||0);
    ns.forEach(function(n) {
      var q=d[n];
      // Quando a mesma chave aparece em diferentes janelas, só reconhece o
      // mínimo inequivocamente atribuível. O intervalo restante é potencial
      // (não aditivo entre janelas) e permanece dentro do saldo.
      var confirmado=Math.min(q,Math.max(0,coleta-(total-q)));
      var possivel=Math.min(q,coleta);
      grupos[n].entregue+=confirmado;
      grupos[n].aConferir+=Math.max(0,possivel-confirmado);
    });
  });
  return Object.keys(grupos).sort(function(a,b){return Number(a)-Number(b);}).map(function(n) {
    var r=grupos[n];r.saldo=r.total-r.entregue;return r;
  });
}

function pgTempSasAdaptConciliarJanelas_(janelas, saidasMapa, internalizado) {
  var abas={'0':1,'676724057':1,'1073453236':1,'1744242808':1,'1214924467':2,'1546857491':2,'1758854262':3};
  var chaves=new Map(), detalhes=[], divergencias=[], trilha=[], resumoJanela=new Map(), resumoCD=new Map(), resumoJanelaCD=new Map();
  function grupo(kit,sku,cd) {
    var k=JSON.stringify([kit,sku,cd]);
    if(!chaves.has(k))chaves.set(k,{kit:kit,sku:sku,destino:cd,demandas:new Map(),parcelas:new Map()});
    return chaves.get(k);
  }
  function resumo(map,k,campos) {
    if(!map.has(k))map.set(k,Object.assign({total:0,mapaSolicitado:0,coletado:0,entregue:0,internalizado:null,aConferir:0,saldo:0,coletaSemJanela:0,entregaSemJanela:0,coletaFora:0,entregaFora:0},campos));
    return map.get(k);
  }
  function normal(v){return pgTempSasAdaptNormalizar_(v);}
  function numero(v){return Math.max(0,pgTempSasAdaptNumero_(v));}
  function adicionar(r,d) {
    ['total','mapaSolicitado','coletado','entregue','aConferir','saldo'].forEach(function(k){r[k]+=d[k]||0;});
    if(d.internalizado!=null)r.internalizado=(r.internalizado||0)+d.internalizado;
  }
  (janelas||[]).forEach(function(aba){
    var id=String(aba.id), m=/^JANELA[\s_-]*([123])(?:\b|$)/.exec(normal(aba.titulo)), n=abas[id]||(m&&Number(m[1]));
    var v=aba.valores||[], h=(v[0]||[]).map(normal);
    var c={kit:h.indexOf('COD KIT'),sku:h.indexOf('COMPONENTE'),cd:h.indexOf('CD'),pedido:h.indexOf('PEDIDO')};
    if(!n||h[10]!=='QTDE'||Object.keys(c).some(function(k){return c[k]<0;}))throw new Error('Referência inválida: '+aba.titulo);
    var r=resumo(resumoJanela,n,{id:String(n),titulo:'Janela '+n,fonteIds:[],pedidos:0});
    r.fonteIds.push(id);
    var pedidos=new Set();
    v.slice(1).forEach(function(l,i){
      l=l||[];var q=numero(l[10]);if(!q)return;
      var kit=normal(l[c.kit]),sku=normal(l[c.sku]),cd=pgTempSasAdaptDestino_(l[c.cd]),pedido=normal(l[c.pedido]);
      if(!kit||!sku||!cd||!pedido)throw new Error('Referência incompleta: '+aba.titulo+' linha '+(i+2));
      pedidos.add(JSON.stringify([pedido,kit,cd]));
      var g=grupo(kit,sku,cd);
      if(!g.demandas.has(n))g.demandas.set(n,{total:0,origens:[]});
      var d=g.demandas.get(n);d.total+=q;d.origens.push(aba.titulo.trim()+'!K'+(i+2));
    });
    r.pedidos+=pedidos.size;
  });
  // Somente o leitor do Mapa, previamente filtrado para ATHOS + V1, alimenta esta conciliação.
  (saidasMapa||[]).forEach(function(m){
    var cd=pgTempSasAdaptDestino_(m.destino);
    if(cd!=='CD JDI'&&cd!=='CD FOR')return;
    var g=grupo(normal(m.kit),normal(m.sku),cd);
    var mp=normal(m.codigoMapa),k=mp||'LINHA '+m.linhaMapa;
    if(!g.parcelas.has(k))g.parcelas.set(k,{mapa:mp,solicitado:0,coletado:0,entregue:0,nfs:new Set(),linhas:new Set()});
    var p=g.parcelas.get(k),v=numero(m.coletado);
    p.solicitado=Math.max(p.solicitado,numero(m.tiragem));
    var dc=pgTempSasAdaptDiaISO_(m.dataColeta),de=pgTempSasAdaptDiaISO_(m.dataEntrega);
    if(dc&&(!p.dataColeta||dc<p.dataColeta))p.dataColeta=dc;
    if(de&&(!p.dataEntrega||de<p.dataEntrega))p.dataEntrega=de;
    if(m.dataColeta)p.coletado=Math.max(p.coletado,v);
    if(m.dataEntrega){p.entregue=Math.max(p.entregue,v);p.coletado=Math.max(p.coletado,v);}
    [m.nfVenda,m.nfRemessa].forEach(function(nf){var s=String(nf==null?'':nf).trim();if(s&&s!=='-'&&s!=='0')p.nfs.add(s);});
    if(m.linhaMapa)p.linhas.add(m.linhaMapa);
  });
  chaves.forEach(function(g){
    var demand=0, linhas=[], cd=resumo(resumoCD,g.destino,{destino:g.destino});
    var recebidos=(internalizado&&internalizado.porCD||{})[g.destino]||{},ki=JSON.stringify([g.sku,g.kit]);
    var recebido=Object.prototype.hasOwnProperty.call(recebidos,ki)?numero(recebidos[ki]):null;
    Array.from(g.demandas.keys()).sort(function(a,b){return a-b;}).forEach(function(n){
      var d=g.demandas.get(n);demand+=d.total;
      linhas.push({janela:'Janela '+n,kit:g.kit,sku:g.sku,destino:g.destino,total:d.total,mapaSolicitado:0,coletado:0,entregue:0,internalizado:null,aConferir:0,saldo:0,status:'Sem mapa',origens:d.origens.join(' | '),refs:[],ocupado:0});
    });
    function ordem(p){return p.dataColeta||p.dataEntrega||'9999-12-31';}
    var parcelas=Array.from(g.parcelas.values()).sort(function(a,b){
      return (a.coletado>0?0:1)-(b.coletado>0?0:1)||ordem(a).localeCompare(ordem(b))||Math.min.apply(null,Array.from(a.linhas).concat([Infinity]))-Math.min.apply(null,Array.from(b.linhas).concat([Infinity]))||a.mapa.localeCompare(b.mapa);
    });
    // Primeiro distribua as coletas físicas; somente depois reserve mapa ainda não coletado.
    // Assim, uma solicitação parcial não empurra outra coleta real para uma janela posterior.
    function distribuir(p,sol,col,ent,cap){
      function evidencia(janela,s,c,e,q,origens,status){
        return {janela:janela,kit:g.kit,sku:g.sku,destino:g.destino,mapa:p.mapa,nfs:Array.from(p.nfs).join(' | '),linhasMapa:Array.from(p.linhas).join(' | '),dataColeta:c>0?(p.dataColeta||''):'',dataEntrega:e>0?(p.dataEntrega||''):'',mapaSolicitado:s,coletado:c,entregue:e,volumeAlocado:q,origens:origens,status:status};
      }
      linhas.forEach(function(r){
        var q=Math.min(r.total-r.ocupado,cap);if(q<=0)return;
        var s=Math.min(q,sol),c=Math.min(q,col),e=Math.min(c,ent);
        sol-=s;col-=c;ent-=e;cap-=q;r.ocupado+=q;r.mapaSolicitado+=s;r.coletado+=c;r.entregue+=e;
        var ev=evidencia(r.janela,s,c,e,q,r.origens,g.demandas.size>1?'Ordem cronológica (FIFO)':'Vínculo único');
        trilha.push(ev);r.refs.push(ev);
      });
      if(cap>0){
        var ev=evidencia('Sem janela',sol,col,ent,cap,linhas.map(function(r){return r.origens;}).join(' | '),demand?'Excedente do mesmo kit/SKU/CD':'Sem vínculo na base de janelas');
        divergencias.push(ev);trilha.push(ev);cd.coletaFora+=col;cd.entregaFora+=ent;
      }
    }
    parcelas.forEach(function(p){var col=p.coletado;if(col>0)distribuir(p,Math.min(p.solicitado,col),col,p.entregue,col);});
    parcelas.forEach(function(p){var saldo=Math.max(0,p.solicitado-p.coletado);if(saldo>0)distribuir(p,saldo,0,0,saldo);});
    linhas.forEach(function(r){
      if(recebido!==null){r.internalizado=Math.min(r.total,recebido);recebido-=r.internalizado;}
      r.saldo=r.total-r.coletado;
      function unicos(k){return Array.from(new Set(r.refs.map(function(x){return x[k];}).filter(Boolean))).join(' | ');}
      r.mapas=unicos('mapa');r.nfs=unicos('nfs');r.linhasMapa=unicos('linhasMapa');r.dataColeta=unicos('dataColeta');r.dataEntrega=unicos('dataEntrega');
      r.evidenciasMapa=r.refs.map(function(x){return (x.mapa||'sem código')+' [linha '+x.linhasMapa+'; NF '+x.nfs+'; coleta '+x.dataColeta+'; entrega '+x.dataEntrega+'; sol '+x.mapaSolicitado+'; col '+x.coletado+'; ent '+x.entregue+']';}).join(' | ');
      if(r.refs.length)r.status=g.demandas.size>1?'Alocado por ordem das janelas (FIFO)':'Vínculo único';
      delete r.refs;delete r.ocupado;detalhes.push(r);
      var n=Number(r.janela.slice(7));adicionar(resumoJanela.get(n),r);
      adicionar(resumo(resumoJanelaCD,n+'|'+g.destino,{titulo:r.janela,destino:g.destino}),r);adicionar(cd,r);
    });
  });
  var j=Array.from(resumoJanela.values()).sort(function(a,b){return Number(a.id)-Number(b.id);});
  var cds=Array.from(resumoCD.values()).sort(function(a,b){return a.destino.localeCompare(b.destino);});
  cds.forEach(function(r){r.saldo=r.total-r.coletado;r.aConferir=r.coletaSemJanela;});
  var somaCD=function(k){return cds.reduce(function(s,r){return s+(r[k]||0);},0);};
  return {entregasPorJanela:j,janelasPorCD:Array.from(resumoJanelaCD.entries()).sort(function(a,b){return Number(a[0].split('|')[0])-Number(b[0].split('|')[0])||a[1].destino.localeCompare(b[1].destino);}).map(function(x){return x[1];}),
    divergenciasMapa:divergencias,trilhaMapa:trilha,athosPorSku:detalhes.sort(function(a,b){return a.janela.localeCompare(b.janela)||a.destino.localeCompare(b.destino)||a.kit.localeCompare(b.kit)||a.sku.localeCompare(b.sku);}),
    expedicoesAthos:cds,tiragemJanelas:somaCD('total'),mapaSolicitado:somaCD('mapaSolicitado'),coletadoAthos:somaCD('coletado'),entregueAthos:somaCD('entregue'),internalizadoAthos:cds.some(function(r){return r.internalizado===null;})?null:somaCD('internalizado')};
}

function getTempSasAdapt() {
  var pcp = pgTempSasAdaptLerColunas_('PCP', PG_TEMP_SAS_ADAPT_CAMPOS_PCP);
  var resumo = pgTempSasAdaptResumoGraficas_(pcp);
  var camposAcabadoras = ['GRÁFICA', 'UNIDADE', 'ENVIO', 'CARACTERÍSTICA DA SOLICITAÇÃO',
    'SKU', 'TIRAGEM A ENTREGAR (total por CD)'];
  var acabadoras = pgTempSasAdaptLerColunas_('PCP_ACABADORAS', camposAcabadoras);
  var planoAthos = pgTempSasAdaptTiragemAcabadoras_(acabadoras);
  resumo.pcpTotal = planoAthos.total;
  var saidasMapa = pgTempSasAdaptLerSaidasMapa_();
  var internalizado = pgTempSasAdaptLerInternalizado_();
  Object.assign(resumo, pgTempSasAdaptSaidaPorSkuCD_(saidasMapa, internalizado, planoAthos.skus));
  // Falha da nova referencia nao interrompe a visao nem muda seus totais.
  try {
    Object.assign(resumo, pgTempSasAdaptConciliarJanelas_(pgTempSasAdaptLerJanelas_(), saidasMapa, internalizado));
  } catch (e) {
    resumo.entregasPorJanela = []; resumo.janelasPorCD = []; resumo.athosPorSku = []; resumo.expedicoesAthos = []; resumo.divergenciasMapa=[]; resumo.trilhaMapa=[];
    resumo.erroEntregasPorJanela = 'Não foi possível atualizar as entregas por janela. Tente atualizar a visão.';
  }
  resumo.atualizadoEm = new Date().toISOString();
  return resumo;
}
