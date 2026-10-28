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
  // K=kit original; L=SKU original; AN=coleta fisica; AT=data coleta.
  var letras = ['C','E','G','H','K','L','AN','AT'];
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
    var coletado = pgTempSasAdaptNumero_(v[6]);
    if ((grafica !== 'ATHOS' && grafica.indexOf('ATHOS ') !== 0) || envio !== 'V1' || coletado <= 0) continue;
    var sku = pgTempSasAdaptNormalizar_(v[5]), destino = pgTempSasAdaptDestino_(v[2]);
    if (!sku || !destino) continue;
    saidas.push({sku: sku, destino: destino, codigoMapa: pgTempSasAdaptNormalizar_(v[1]),
      kit: pgTempSasAdaptNormalizar_(v[4]), coletado: coletado,
      dataColeta: pgTempSasAdaptDiaISO_(v[7]), linhaMapa: i + 2});
  }
  return saidas;
}

function pgTempSasAdaptResumo_(pcp, athos, hojeISO, saidasMapa) {
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
  var skusAthos = Object.create(null), expedicoesAthos = Object.create(null), linhasGraficas = [], linhasAthos = [], diagnosticos = [];
  var pcpTotal = 0, saiuBruto = 0, saiu = 0, totalAthos = 0, produzido = 0, coletadoAthos = 0, qtdApontamentos = 0;
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
  // Concilia parcelas de saida por mapa/SKU/CD; codigos repetidos nao
  // duplicam a quantidade coletada. Nao compensa atraso de outro destino.
  var parcelasMapa = Object.create(null), saidaPorDestino = Object.create(null);
  (saidasMapa || []).forEach(function(m) {
    var sku = pgTempSasAdaptNormalizar_(m.sku), destino = pgTempSasAdaptDestino_(m.destino);
    if (!skusOrigem[sku] || !destino) return;
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
    if(!skusOrigem[aSku]||pgTempSasAdaptNormalizar_(al[a['GRÁFICA']])!=='ATHOS'||
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
    if (!codigo || !skusOrigem[codigo]) continue;
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
  var pcpPorSku = Object.keys(skusOrigem).map(function(sku) {
    var item = skusOrigem[sku];
    return { sku: sku, total: item.total, saiu: item.saiu, saiuBruto: item.saiuBruto,
      graficas: Object.keys(item.graficas).sort().join(', ') };
  }).sort(function(x, y) { return x.sku.localeCompare(y.sku); });
  return {
    dataReferencia: hoje, pcpTotal: pcpTotal, saiuGraficas: saiu, saiuGraficasBruto: saiuBruto,
    totalAthos: totalAthos, recebidoAthos: recebidoAthos, recebidoAthosReconhecido: recebidoReconhecido,
    produzidoAthos: produzido, coletadoAthos: coletadoAthos,
    producaoApontada: qtdApontamentos > 0, qtdApontamentos: qtdApontamentos,
    graficas: Object.keys(graficas).map(function(k) { return graficas[k]; })
      .sort(function(x, y) { return y.total - x.total || x.nome.localeCompare(y.nome); }),
    expedicoesAthos: Object.keys(expedicoesAthos).map(function(k) { return expedicoesAthos[k]; })
      .sort(function(x, y) { return y.total - x.total || x.destino.localeCompare(y.destino); }),
    athosPorSku: athosPorSku, pcpPorSku: pcpPorSku,
    linhasGraficas: linhasGraficas, linhasAthos: linhasAthos,
    qtdLinhasGraficas: linhasGraficas.length, qtdLinhasAthos: linhasAthos.length, diagnosticos: diagnosticos
  };
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
  var vinculos = Object.create(null), pedidos = [], resultados = [];
  function chave(kit, sku, destino) {
    return JSON.stringify([pgTempSasAdaptNormalizar_(kit), pgTempSasAdaptNormalizar_(sku),
      pgTempSasAdaptDestino_(destino)]);
  }
  (janelas || []).forEach(function(janela) {
    var valores = janela.valores || [], cab = (valores[0] || []).map(pgTempSasAdaptNormalizar_);
    function coluna(nome) {
      var i = cab.indexOf(pgTempSasAdaptNormalizar_(nome));
      if (i < 0) throw new Error('Coluna ' + nome + ' ausente em ' + janela.titulo + '.');
      return i;
    }
    var c = {pedido:coluna('Pedido'), kit:coluna('Cod Kit'), sku:coluna('Componente'),
      quantidade:coluna('Qtde'), destino:coluna('CD')};
    var res = {id:String(janela.id), titulo:janela.titulo, total:0, entregue:0,
      saldo:0, aConferir:0, pedidos:0, aConferirPedidos:0};
    resultados.push(res);
    var porPedido = Object.create(null);
    for (var i = 1; i < valores.length; i++) {
      var linha = valores[i] || [], pedido = pgTempSasAdaptNormalizar_(linha[c.pedido]);
      if (!pedido) continue;
      var kit = pgTempSasAdaptNormalizar_(linha[c.kit]);
      var sku = pgTempSasAdaptNormalizar_(linha[c.sku]);
      var cd = pgTempSasAdaptDestino_(linha[c.destino]);
      var qtdRaw = linha[c.quantidade], qtd = pgTempSasAdaptNumero_(qtdRaw);
      if (!kit || !sku || !cd || qtdRaw == null || qtdRaw === '' || qtd < 0 ||
          !isFinite(typeof qtdRaw === 'number' ? qtdRaw : Number(String(qtdRaw).replace(/\./g, '').replace(',', '.')))) {
        throw new Error('Pedido incompleto em ' + janela.titulo + ', linha ' + (i + 1) + '.');
      }
      var item = porPedido[pedido];
      if (!item) {
        item = porPedido[pedido] = {kit:kit, destino:cd, total:qtd, componentes:Object.create(null), resumo:res};
        pedidos.push(item);
        res.total += qtd;
        res.pedidos++;
      } else if (item.kit !== kit || item.destino !== cd || item.total !== qtd) {
        throw new Error('Dados divergentes do pedido em ' + janela.titulo + ', linha ' + (i + 1) + '.');
      }
      var k = chave(kit, sku, cd);
      if (!item.componentes[k]) {
        item.componentes[k] = true;
        if (!vinculos[k]) vinculos[k] = [];
        vinculos[k].push(item);
      }
    }
  });
  // A mesma parcela fisica do Mapa e considerada uma vez, usando a mesma
  // identidade mapa/kit/SKU/CD da leitura atual, sem rateio entre janelas.
  var parcelas = Object.create(null), volumes = Object.create(null);
  (saidasMapa || []).forEach(function(m) {
    var k = chave(m.kit, m.sku, m.destino);
    if (!vinculos[k]) return;
    var codigo = pgTempSasAdaptNormalizar_(m.codigoMapa);
    var id = JSON.stringify([k, codigo || 'LINHA ' + m.linhaMapa]);
    var volume = Math.max(0, pgTempSasAdaptNumero_(m.coletado));
    if (!parcelas[id] || parcelas[id].volume < volume) parcelas[id] = {chave:k, volume:volume};
  });
  Object.keys(parcelas).forEach(function(id) {
    var p = parcelas[id];
    volumes[p.chave] = (volumes[p.chave] || 0) + p.volume;
  });
  pedidos.forEach(function(item) {
    var entregue = item.total, ambiguo = false;
    Object.keys(item.componentes).forEach(function(k) {
      var volume = volumes[k] || 0;
      if (vinculos[k].length > 1) {
        if (volume > 0) ambiguo = true;
        volume = 0;
      }
      // Um kit exige todos os seus componentes, nao a soma dos impressos.
      entregue = Math.min(entregue, volume);
    });
    var saldo = Math.max(0, item.total - entregue);
    item.resumo.entregue += entregue;
    item.resumo.saldo += saldo;
    if (ambiguo && saldo > 0) {
      item.resumo.aConferir += saldo;
      item.resumo.aConferirPedidos++;
    }
  });
  return resultados;
}

function getTempSasAdapt() {
  var pCampos = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM','TIRAGEM TOTAL','TIRAGEM COLETADA','Data_Coleta_Mapa','Entrega_TP'];
  var aCampos = ['ID','GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU',
    'CD DESTINO','TIRAGEM A ENTREGAR (total por CD)','Tiragem recebida (Total SKU)',
    'Formação de kit/Encaixotamento Final Real','Acbto Final Real'];
  var pcp = pgTempSasAdaptLerColunas_('PCP', pCampos);
  var athos = pgTempSasAdaptLerColunas_('PCP_ACABADORAS', aCampos);
  var saidasMapa = pgTempSasAdaptLerSaidasMapa_();
  var resumo = pgTempSasAdaptResumo_(pcp, athos, null, saidasMapa);
  // Falha da nova referencia nao interrompe a visao nem muda seus totais.
  try {
    resumo.entregasPorJanela = pgTempSasAdaptEntregasJanelas_(pgTempSasAdaptLerJanelas_(), saidasMapa);
  } catch (e) {
    resumo.entregasPorJanela = [];
    resumo.erroEntregasPorJanela = 'Não foi possível atualizar as entregas por janela. Tente atualizar a visão.';
  }
  resumo.atualizadoEm = new Date().toISOString();
  return resumo;
}
