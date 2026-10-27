// Previsões manuais próprias da visão Entregas por CD. Nenhuma escrita no PCP.
var PG_ECD_PREVISOES_ABA = 'Previsoes_Entrega_CD';
var PG_ECD_PREVISOES_CABECALHO = ['Chave', 'Coleta prevista', 'Entrega prevista',
  'Observação', 'Versão', 'Atualizado em', 'Usuário', 'Requisição', 'Registro JSON'];

function pgECDNormalizar_(valor) {
  return String(valor == null ? '' : valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function pgECDChave_(chave) {
  if (typeof chave !== 'string' || chave.length > 2000) throw new Error('Chave de previsão inválida.');
  var partes;
  try { partes = JSON.parse(chave); } catch (e) { throw new Error('Chave de previsão inválida.'); }
  if (!Array.isArray(partes) || partes.length !== 10 || partes[0] !== 'ECD1' ||
      partes.some(function(p) { return typeof p !== 'string'; })) {
    throw new Error('Chave de previsão inválida.');
  }
  partes = partes.map(pgECDNormalizar_);
  var vazios = ['', '-', 'N/A', 'NA', 'NULL', 'UNDEFINED', '#N/A'];
  if (['PCP', 'ACABADORA'].indexOf(partes[1]) < 0 || [2, 3, 4, 5].some(function(i) {
    return vazios.indexOf(partes[i]) >= 0;
  })) throw new Error('Informe origem, marca, gráfica, SKU e CD para salvar a previsão.');
  var canonica = JSON.stringify(partes);
  if (canonica.length > 2000) throw new Error('Chave de previsão acima do limite.');
  return canonica;
}

function pgECDData_(valor) {
  if (valor == null || valor === '') return '';
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error('Informe uma data válida para a previsão.');
  }
  var d = new Date(valor + 'T00:00:00Z');
  if (!isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new Error('Informe uma data válida para a previsão.');
  }
  return valor;
}

function pgECDTextoPlanilha_(valor) {
  var texto = String(valor == null ? '' : valor);
  return /^[=+@-]/.test(texto) ? "'" + texto : texto;
}

function pgECDPublica_(registro) {
  return {chave: registro.chave, dataColeta: registro.dataColeta, dataEntrega: registro.dataEntrega,
    observacao: registro.observacao, versao: registro.versao,
    atualizadoEm: registro.atualizadoEm, usuario: registro.usuario};
}

function pgECDLerRegistros_(sheet) {
  if (!sheet) return {previsoes: Object.create(null), requisicoes: Object.create(null)};
  var ultima = sheet.getLastRow();
  if (ultima < 1) throw new Error('Cabeçalho das previsões de CD ausente.');
  var dados = sheet.getRange(1, 1, ultima, PG_ECD_PREVISOES_CABECALHO.length).getValues();
  if (PG_ECD_PREVISOES_CABECALHO.some(function(c, i) { return dados[0][i] !== c; })) {
    throw new Error('Formato da aba de previsões de CD incompatível. Nenhum registro foi alterado.');
  }
  var previsoes = Object.create(null), requisicoes = Object.create(null);
  dados.slice(1).forEach(function(row, indice) {
    var r;
    try {
      r = JSON.parse(String(row[8] || ''));
      if (pgECDChave_(r.chave) !== r.chave || pgECDData_(r.dataColeta) !== r.dataColeta ||
          pgECDData_(r.dataEntrega) !== r.dataEntrega ||
          typeof r.observacao !== 'string' || r.observacao.length > 500 ||
          !Number.isInteger(r.versao) || r.versao < 1 ||
          typeof r.atualizadoEm !== 'string' || !isFinite(Date.parse(r.atualizadoEm)) ||
          typeof r.usuario !== 'string' || typeof r.requestId !== 'string' || !r.requestId ||
          r.versao !== (previsoes[r.chave] ? previsoes[r.chave].versao : 0) + 1 ||
          requisicoes[r.requestId]) throw new Error('Registro inválido');
    } catch (e) {
      throw new Error('Histórico de previsões de CD ilegível na linha ' + (indice + 2) + '. Nenhum registro foi alterado.');
    }
    previsoes[r.chave] = r;
    requisicoes[r.requestId] = r;
  });
  return {previsoes: previsoes, requisicoes: requisicoes};
}

function getPrevisoesEntregaCDPortal() {
  var ss = pgArquivoObservacoesGiro_();
  var dados = pgECDLerRegistros_(ss.getSheetByName(PG_ECD_PREVISOES_ABA));
  var saida = Object.create(null);
  Object.keys(dados.previsoes).forEach(function(chave) { saida[chave] = pgECDPublica_(dados.previsoes[chave]); });
  return {success: true, previsoes: saida};
}

function salvarPrevisaoEntregaCDPortal(payload) {
  payload = payload || {};
  var chave = pgECDChave_(payload.chave);
  var dataColeta = pgECDData_(payload.dataColeta), dataEntrega = pgECDData_(payload.dataEntrega);
  if (dataColeta && dataEntrega && dataEntrega < dataColeta) {
    throw new Error('A previsão de entrega não pode ser anterior à previsão de coleta.');
  }
  if (payload.observacao != null && typeof payload.observacao !== 'string') throw new Error('Observação inválida.');
  var observacao = String(payload.observacao || '').trim();
  if (observacao.length > 500) throw new Error('A observação deve ter no máximo 500 caracteres.');
  var versaoEsperada = payload.versaoEsperada;
  if (!Number.isInteger(versaoEsperada) || versaoEsperada < 0) throw new Error('Versão da previsão inválida. Atualize o quadro.');
  var requestId = payload.requestId;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(requestId)) {
    throw new Error('Identificador do salvamento inválido.');
  }
  var lock = LockService.getScriptLock(), bloqueado = false;
  try {
    lock.waitLock(20000);
    bloqueado = true;
    var ss = pgArquivoObservacoesGiro_(), sheet = ss.getSheetByName(PG_ECD_PREVISOES_ABA);
    var dados = pgECDLerRegistros_(sheet);
    var repetida = dados.requisicoes[requestId];
    if (repetida) {
      if (repetida.chave !== chave || repetida.dataColeta !== dataColeta ||
          repetida.dataEntrega !== dataEntrega || repetida.observacao !== observacao) {
        throw new Error('Este identificador de salvamento já foi usado para outra alteração. Atualize o quadro.');
      }
      return {success: true, previsao: pgECDPublica_(repetida)};
    }
    var anterior = dados.previsoes[chave];
    if ((anterior ? anterior.versao : 0) !== versaoEsperada) {
      throw new Error('A previsão foi alterada por outra pessoa. Atualize o quadro antes de salvar novamente.');
    }
    if (!anterior && !dataColeta && !dataEntrega && !observacao) throw new Error('Preencha uma previsão ou observação.');
    var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    if ((dataColeta && dataColeta < hoje) || (dataEntrega && dataEntrega < hoje)) {
      throw new Error('A nova previsão deve ser hoje ou uma data futura.');
    }
    var usuario = 'Anônimo';
    try { usuario = String(Session.getActiveUser().getEmail() || '').trim() || 'Anônimo'; } catch (e) {}
    var registro = {chave: chave, dataColeta: dataColeta, dataEntrega: dataEntrega,
      observacao: observacao, versao: (anterior ? anterior.versao : 0) + 1,
      atualizadoEm: new Date().toISOString(), usuario: usuario, requestId: requestId};
    if (!sheet) {
      sheet = ss.insertSheet(PG_ECD_PREVISOES_ABA);
      sheet.getRange(1, 1, 1, PG_ECD_PREVISOES_CABECALHO.length).setValues([PG_ECD_PREVISOES_CABECALHO]);
      sheet.getRange(1, 1, 1, PG_ECD_PREVISOES_CABECALHO.length)
        .setFontWeight('bold').setBackground('#284081').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    // JSON é a leitura canônica; textos exibidos são escapados sem perder o original.
    var row = [chave, dataColeta, dataEntrega, pgECDTextoPlanilha_(observacao), registro.versao,
      registro.atualizadoEm, pgECDTextoPlanilha_(usuario), requestId, JSON.stringify(registro)];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return {success: true, previsao: pgECDPublica_(registro)};
  } finally {
    if (bloqueado) lock.releaseLock();
  }
}

function gerarPlanilhaEntregasCD(payload) {
  payload = payload || {};
  var abas = payload.abas;
  if (!Array.isArray(abas) || abas.length !== 2 || !abas[0] || !abas[1] ||
      abas[0].nome !== 'Quadro' || abas[1].nome !== 'Base_SKUs') {
    throw new Error('A extração de Entregas CD deve conter Quadro e Base_SKUs, nesta ordem.');
  }
  var seguro = Object.assign({}, payload, {auditoriaPortal: true, abas: abas});
  return gerarPlanilhaReportExecutiva(seguro);
}
