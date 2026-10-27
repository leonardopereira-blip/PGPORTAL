// Previsões compartilhadas entre Giro e Entregas por CD. Histórico append-only.
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
    atualizadoEm: registro.atualizadoEm, usuario: registro.usuario, requestId: registro.requestId};
}

function pgECDLerRegistros_(sheet, desde) {
  if (!sheet) return {previsoes: Object.create(null), requisicoes: Object.create(null), ultima: 0};
  var ultima = sheet.getLastRow();
  if (ultima < 1) throw new Error('Cabeçalho das previsões de CD ausente.');
  var cabecalho = sheet.getRange(1, 1, 1, PG_ECD_PREVISOES_CABECALHO.length).getValues()[0];
  if (PG_ECD_PREVISOES_CABECALHO.some(function(c, i) { return cabecalho[i] !== c; })) {
    throw new Error('Formato da aba de previsões de CD incompatível. Nenhum registro foi alterado.');
  }
  var primeira = Math.max(2, Number(desde || 0) + 1);
  var dados = primeira > ultima ? [] : sheet.getRange(primeira, 1, ultima - primeira + 1, PG_ECD_PREVISOES_CABECALHO.length).getValues();
  var previsoes = Object.create(null), requisicoes = Object.create(null);
  dados.forEach(function(row, indice) {
    var r;
    try {
      r = JSON.parse(String(row[8] || ''));
      if (pgECDChave_(r.chave) !== r.chave || pgECDData_(r.dataColeta) !== r.dataColeta ||
          pgECDData_(r.dataEntrega) !== r.dataEntrega ||
          typeof r.observacao !== 'string' || r.observacao.length > 500 ||
          !Number.isInteger(r.versao) || r.versao < 1 ||
          typeof r.atualizadoEm !== 'string' || !isFinite(Date.parse(r.atualizadoEm)) ||
          typeof r.usuario !== 'string' || typeof r.requestId !== 'string' || !r.requestId ||
          ((!desde || previsoes[r.chave]) && r.versao !== (previsoes[r.chave] ? previsoes[r.chave].versao : 0) + 1) ||
          requisicoes[r.requestId]) throw new Error('Registro inválido');
    } catch (e) {
      throw new Error('Histórico de previsões de CD ilegível na linha ' + (indice + primeira) + '. Nenhum registro foi alterado.');
    }
    previsoes[r.chave] = r;
    requisicoes[r.requestId] = r;
  });
  return {previsoes: previsoes, requisicoes: requisicoes, ultima: ultima};
}

function getPrevisoesEntregaCDPortal() {
  var ss = pgArquivoObservacoesGiro_();
  var dados = pgECDLerRegistros_(ss.getSheetByName(PG_ECD_PREVISOES_ABA));
  var saida = Object.create(null);
  Object.keys(dados.previsoes).forEach(function(chave) { saida[chave] = pgECDPublica_(dados.previsoes[chave]); });
  return {success: true, previsoes: saida};
}

function pgECDAlteracao_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Previsão inválida.');
  var chave = pgECDChave_(payload.chave);
  var campos = payload.campos == null ? ['dataColeta', 'dataEntrega', 'observacao'] : payload.campos;
  if (!Array.isArray(campos) || !campos.length || campos.length > 3 ||
      campos.some(function(c, i) { return ['dataColeta', 'dataEntrega', 'observacao'].indexOf(c) < 0 || campos.indexOf(c) !== i; })) {
    throw new Error('Informe os campos alterados da previsão.');
  }
  var alteracao = {};
  ['dataColeta', 'dataEntrega', 'observacao'].forEach(function(c) {
    if (campos.indexOf(c) < 0) return;
    if (c === 'observacao') {
      if (payload[c] != null && typeof payload[c] !== 'string') throw new Error('Observação inválida.');
      alteracao[c] = String(payload[c] || '').trim();
      if (alteracao[c].length > 500) throw new Error('A observação deve ter no máximo 500 caracteres.');
    } else alteracao[c] = pgECDData_(payload[c]);
  });
  return {chave: chave, alteracao: alteracao};
}

function pgECDSalvarLote_(entradas) {
  var lock = LockService.getScriptLock(), bloqueado = false;
  try {
    lock.waitLock(20000); bloqueado = true;
    var ss = pgArquivoObservacoesGiro_(), sheet = ss.getSheetByName(PG_ECD_PREVISOES_ABA);
    var dados = pgECDLerRegistros_(sheet), novas = [], saida = {};
    var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    var usuario = 'Anônimo';
    try { usuario = String(Session.getActiveUser().getEmail() || '').trim() || 'Anônimo'; } catch (e) {}
    entradas.forEach(function(entrada) {
      var chave = entrada.chave, alteracao = entrada.alteracao, requestId = entrada.requestId;
      var repetida = dados.requisicoes[requestId];
      if (repetida) {
        var intencaoOriginal = repetida.alteracao || {dataColeta: repetida.dataColeta,
          dataEntrega: repetida.dataEntrega, observacao: repetida.observacao};
        if (repetida.chave !== chave || JSON.stringify(intencaoOriginal) !== JSON.stringify(alteracao)) {
          throw new Error('Este identificador de salvamento já foi usado para outra alteração.');
        }
        // Retry devolve o valor atual, nunca reaplica uma intenção mais antiga.
        saida[chave] = pgECDPublica_(dados.previsoes[chave]);
        return;
      }
      var anterior = dados.previsoes[chave];
      var registro = {chave: chave, dataColeta: anterior ? anterior.dataColeta : '',
        dataEntrega: anterior ? anterior.dataEntrega : '', observacao: anterior ? anterior.observacao : '',
        versao: (anterior ? anterior.versao : 0) + 1, atualizadoEm: new Date().toISOString(),
        usuario: usuario, requestId: requestId, alteracao: alteracao};
      Object.keys(alteracao).forEach(function(c) {
        if (c !== 'observacao' && alteracao[c] && alteracao[c] < hoje) {
          throw new Error('A nova previsão deve ser hoje ou uma data futura.');
        }
        registro[c] = alteracao[c];
      });
      if (registro.dataColeta && registro.dataEntrega && registro.dataEntrega < registro.dataColeta) {
        throw new Error('A previsão de entrega não pode ser anterior à previsão de coleta.');
      }
      if (!anterior && !registro.dataColeta && !registro.dataEntrega && !registro.observacao) {
        throw new Error('Preencha uma previsão ou observação.');
      }
      // A edição é um patch aplicado à última linha sob lock. A última intenção
      // prevalece apenas nos campos editados; notas e coletas de terceiros ficam.
      novas.push(registro);
      dados.previsoes[chave] = registro; dados.requisicoes[requestId] = registro;
      saida[chave] = pgECDPublica_(registro);
    });
    if (novas.length) {
      if (!sheet) {
        sheet = ss.insertSheet(PG_ECD_PREVISOES_ABA);
        sheet.getRange(1, 1, 1, PG_ECD_PREVISOES_CABECALHO.length).setValues([PG_ECD_PREVISOES_CABECALHO]);
        sheet.getRange(1, 1, 1, PG_ECD_PREVISOES_CABECALHO.length)
          .setFontWeight('bold').setBackground('#284081').setFontColor('#ffffff');
        sheet.setFrozenRows(1);
      }
      var linhas = novas.map(function(r) { return [r.chave, r.dataColeta, r.dataEntrega,
        pgECDTextoPlanilha_(r.observacao), r.versao, r.atualizadoEm,
        pgECDTextoPlanilha_(r.usuario), r.requestId, JSON.stringify(r)]; });
      sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, PG_ECD_PREVISOES_CABECALHO.length).setValues(linhas);
      SpreadsheetApp.flush();
      pgGiroInvalidarRevisao_();
    }
    return {success: true, previsoes: saida};
  } finally { if (bloqueado) lock.releaseLock(); }
}

function salvarPrevisaoEntregaCDPortal(payload) {
  var entrada = pgECDAlteracao_(payload);
  if (!payload.requestId) throw new Error('Identificador do salvamento inválido.');
  entrada.requestId = pgGiroEventoId_(payload.requestId);
  var r = pgECDSalvarLote_([entrada]);
  return {success: true, previsao: r.previsoes[entrada.chave]};
}

function salvarPrevisoesEntregaCDPortal(payload) {
  if (!payload || !Array.isArray(payload.previsoes) || !payload.previsoes.length || payload.previsoes.length > 2000) {
    throw new Error('Selecione de 1 a 2000 previsões para salvar por vez.');
  }
  if (!payload.requestId) throw new Error('Identificador do salvamento inválido.');
  var requestId = pgGiroEventoId_(payload.requestId);
  if (requestId.length > 110) throw new Error('Identificador do lote acima do limite.');
  var chaves = Object.create(null);
  var entradas = payload.previsoes.map(function(p, i) {
    var entrada = pgECDAlteracao_(p);
    if (chaves[entrada.chave]) throw new Error('Uma previsão está repetida no lote.');
    chaves[entrada.chave] = true;
    entrada.requestId = requestId + ':' + i;
    return entrada;
  });
  return pgECDSalvarLote_(entradas);
}

function gerarPlanilhaEntregasCD(payload) {
  payload = payload || {};
  var abas = payload.abas;
  var nomes = Array.isArray(abas) ? abas.map(function(a) { return a && a.nome; }).join('|') : '';
  if (nomes !== 'Quadro|Base_SKUs' && nomes !== 'Quadro_Marca_CD|Quadro_Marca_Serie_CD|Base_SKUs') {
    throw new Error('A extração deve conter os dois quadros de Entregas CD e Base_SKUs, nesta ordem.');
  }
  var seguro = Object.assign({}, payload, {auditoriaPortal: true, abas: abas});
  return gerarPlanilhaReportExecutiva(seguro);
}
