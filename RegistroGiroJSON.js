// PG_GIRO_PRAZOS_JSON_V41
// Registro append-only, para futura consolidação com outros JSONs.
// O histórico original de observações continua sendo salvo pela função existente.
function pgGiroPastaJSONV41_() {
  // Pasta dedicada às observações, independente da pasta de cache do portal.
  // A conta de execução precisa ter acesso de edição a esta pasta.
  return DriveApp.getFolderById('1BE3_IL2lfsuFfR3JD1a7Bx7PLtc3Oug-');
}

function pgGiroDocumentoJSONV41_(pasta, nome) {
  var arquivos = pasta.getFilesByName(nome);
  var arquivo = arquivos.hasNext() ? arquivos.next() : null;
  if (!arquivo) return { arquivo: null,
    documento: {schema:'pgportal.giro.observacoes.v1', atualizadoEm:'', registros:[]} };
  var parsed = JSON.parse(arquivo.getBlob().getDataAsString('UTF-8') || '{}');
  if (!parsed || !Array.isArray(parsed.registros)) throw new Error('Formato de JSON anterior incompatível.');
  return { arquivo: arquivo, documento: parsed };
}
function salvarObsGiroComJSONV41(tipo, chave, texto, contexto, eventoId) {
  // Primeiro conserva o fluxo já existente e seu histórico.
  var resultado = pgSalvarObsGiroPortal_(tipo, chave, texto, contexto, eventoId);
  if (!resultado || !resultado.success) return resultado;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var pasta = pgGiroPastaJSONV41_();
    var nome = 'Giro_Diario_Observacoes.json';
    var atual = pgGiroDocumentoJSONV41_(pasta, nome);
    var d = atual.documento;
    var id = String(resultado.id || eventoId || Utilities.getUuid());
    var registro = {
      id:id, tipo:String(tipo), chave:String(chave),
      contexto:JSON.parse(String(contexto || '{}')),
      texto:String(texto), registradoEm:new Date().toISOString(),
      usuario:String(resultado.user || ''),
      origem:'PGPORTAL / Giro Diario', status:'registrado'
    };
    if (!d.registros.some(function(x) { return x.id === id; })) d.registros.push(registro);
    d.atualizadoEm = new Date().toISOString();
    var conteudo = JSON.stringify(d, null, 2);
    if (atual.arquivo) atual.arquivo.setContent(conteudo);
    else pasta.createFile(nome, conteudo, MimeType.PLAIN_TEXT);
    resultado.jsonSaved = true;
    resultado.jsonEventId = id;
  } catch (e) {
    // Não regravar o histórico original: ele já foi salvo com sucesso.
    console.error('JSON Giro V41:', e);
    resultado.jsonSaved = false;
    resultado.jsonError = String(e.message || e);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
  return resultado;
}
function obterJSONGiroV41() {
  try {
    var pasta = pgGiroPastaJSONV41_();
    var atual = pgGiroDocumentoJSONV41_(pasta, 'Giro_Diario_Observacoes.json');
    return {success:true, documento:atual.documento};
  } catch(e) {
    return {success:false, error:String(e.message || e)};
  }
}

// PG_REPORT_POS_JSON_V42C

// O histórico permanece append-only na PCPs. Um ID por intenção torna o retry
// seguro e impede que uma resposta atrasada substitua a nota de outra pessoa.
var PG_GIRO_REVISAO_CHAVE = 'PG_GIRO_REVISAO_V2';
function pgGiroRevisao_() {
  var cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  var valor = cache ? cache.get(PG_GIRO_REVISAO_CHAVE) : null;
  if (!valor) {
    valor = typeof PropertiesService !== 'undefined'
      ? PropertiesService.getScriptProperties().getProperty(PG_GIRO_REVISAO_CHAVE) || '0' : '0';
    if (cache) cache.put(PG_GIRO_REVISAO_CHAVE, valor, 21600);
  }
  return valor;
}
function pgGiroInvalidarRevisao_() {
  var valor = new Date().getTime() + ':' + Utilities.getUuid();
  if (typeof PropertiesService !== 'undefined') {
    PropertiesService.getScriptProperties().setProperty(PG_GIRO_REVISAO_CHAVE, valor);
  }
  if (typeof CacheService !== 'undefined') CacheService.getScriptCache().put(PG_GIRO_REVISAO_CHAVE, valor, 21600);
  return valor;
}
function pgGiroEventoId_(id) {
  if (id == null || id === '') return Utilities.getUuid();
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(id)) {
    throw new Error('Identificador da observação inválido.');
  }
  return id;
}
function pgGiroContexto_(contexto) {
  var texto = typeof contexto === 'string' ? contexto : JSON.stringify(contexto || {});
  if (texto.length > 40000) throw new Error('Contexto da observação acima do limite.');
  var obj;
  try { obj = JSON.parse(texto || '{}'); } catch (e) { throw new Error('Contexto da observação inválido.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Contexto da observação inválido.');
  return {texto: JSON.stringify(obj), objeto: obj};
}
function pgGiroEventoLinha_(row, tipo, indice) {
  var contexto = {};
  try { contexto = JSON.parse(String(row[4] || '{}')); } catch (e) {}
  var data = row[0] instanceof Date
    ? Utilities.formatDate(row[0], 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss') : String(row[0] || '');
  return {id: String(row[5] || ('legado:' + tipo + ':' + indice)), data: data, sequencia: Number(indice),
    user: String(row[1] || ''), chave: pgGiroNormalizarChave_(tipo, row[2]),
    obs: String(row[3] || ''), tipo: tipo, contexto: contexto};
}
function pgGiroLerAba_(sheet, tipo, desde) {
  var mapa = {}, ultima = sheet ? sheet.getLastRow() : 0;
  if (!ultima || desde >= ultima) return {historico: mapa, ultima: ultima};
  var primeira = Math.max(1, Number(desde || 0) + 1);
  var colunas = typeof sheet.getMaxColumns === 'function' ? Math.min(6, sheet.getMaxColumns()) : 6;
  var linhas = sheet.getRange(primeira, 1, ultima - primeira + 1, colunas).getValues();
  var eventos = linhas.map(function(row, i) { return pgGiroEventoLinha_(row, tipo, primeira + i); })
    .filter(function(e) { return e.chave && e.obs.trim() && !/^data(?: e hora)?$/i.test(e.data); });
  // A data, seguida da posição append-only, determina a ordem do legado.
  eventos.reverse().sort(function(a, b) {
    var av = pgGiroMomento_(a.data), bv = pgGiroMomento_(b.data);
    return (isFinite(bv) ? bv : -Infinity) - (isFinite(av) ? av : -Infinity) || b.sequencia - a.sequencia;
  });
  var ids = Object.create(null);
  eventos.forEach(function(e) {
    if (ids[e.id]) return;
    ids[e.id] = true;
    if (!mapa[e.chave]) mapa[e.chave] = [];
    mapa[e.chave].push(e);
  });
  return {historico: mapa, ultima: ultima};
}
function pgBuscarHistoricoObsGiroPortal_() {
  var ss = pgArquivoObservacoesGiro_();
  return {master: pgGiroLerAba_(ss.getSheetByName('Obs_Cockpit'), 'MASTER', 0).historico,
    sku: pgGiroLerAba_(ss.getSheetByName('Obs_Cockpit_sku'), 'SKU', 0).historico};
}
// Recuperação independente das observações: não depende da leitura de previsões de CD.
// O contexto físico já está preservado na planilha; a tela só precisa dos dados do histórico.
// Unifica a planilha append-only com o cache historico existente no Drive.
// A consulta nao altera nenhuma das fontes e nao perde notas quando uma delas falha.
function buscarHistoricoObsGiroLeve() {
  var saida = {master:{}, sku:{}}, origens = [], avisos = [];
  var ids = {master:Object.create(null), sku:Object.create(null)};
  var mesclar = function(fonte) {
    ['master','sku'].forEach(function(tipo) {
      var grupos = fonte && fonte[tipo] || {};
      Object.keys(grupos).forEach(function(chave) {
        var chaveNormal = pgGiroNormalizarChave_(tipo === 'sku' ? 'SKU' : 'MASTER', chave);
        if (!chaveNormal || !Array.isArray(grupos[chave])) return;
        var destino = saida[tipo][chaveNormal] || (saida[tipo][chaveNormal] = []);
        grupos[chave].forEach(function(e) {
          if (!e || !String(e.obs || '').trim()) return;
          var eventoId = String(e.id || '').trim();
          var assinatura = eventoId ? 'id:' + eventoId :
            'legado:' + [e.data, e.user, e.obs, chaveNormal].join('\u0001');
          if (ids[tipo][assinatura]) return;
          ids[tipo][assinatura] = true;
          destino.push({id:eventoId, data:e.data || '', sequencia:Number(e.sequencia || 0),
            user:e.user || '', obs:String(e.obs), tipo:tipo === 'sku' ? 'SKU' : 'MASTER'});
        });
      });
    });
  };
  try {
    mesclar(pgBuscarHistoricoObsGiroPortal_());
    origens.push('PCPs');
  } catch(e) {
    avisos.push('PCPs: ' + String(e.message || e));
  }
  try {
    var cache = JSON.parse(lerJSONDoDrive('cache_observacoes.json', true));
    if (!cache || !cache.master || !cache.sku) throw new Error('cache sem historico valido');
    mesclar(cache);
    origens.push('cache_observacoes.json');
  } catch(e) {
    avisos.push('Cache Drive: ' + String(e.message || e));
  }
  if (!origens.length) return {success:false,
    error:'Nenhuma fonte de observacoes disponivel. ' + avisos.join(' | ')};
  var totais = {master:0, sku:0};
  ['master','sku'].forEach(function(tipo) {
    Object.keys(saida[tipo]).forEach(function(chave) {
      var eventos = saida[tipo][chave];
      eventos.sort(function(a,b) {
        return pgGiroMomento_(b.data)-pgGiroMomento_(a.data) ||
          b.sequencia-a.sequencia;
      });
      totais[tipo] += eventos.length;
    });
  });
  return {success:true, historico:saida, totais:totais, origens:origens, avisos:avisos};
}
function pgSalvarObsGiroPortal_(tipo, chave, obs, contextoStr, eventoId) {
  var lock, bloqueado = false;
  try {
    if (tipo !== 'MASTER' && tipo !== 'SKU') throw new Error('Tipo de observação inválido.');
    chave = pgGiroNormalizarChave_(tipo, chave);
    obs = String(obs == null ? '' : obs).trim();
    if (!chave || !obs) throw new Error('Chave e observação são obrigatórias.');
    if (chave.length > 2000 || obs.length > 10000) throw new Error('Observação acima do limite.');
    var id = pgGiroEventoId_(eventoId), contexto = pgGiroContexto_(contextoStr);
    lock = LockService.getScriptLock();
    lock.waitLock(20000); bloqueado = true;
    var ss = pgArquivoObservacoesGiro_();
    var nome = tipo === 'SKU' ? 'Obs_Cockpit_sku' : 'Obs_Cockpit';
    var sheet = ss.getSheetByName(nome);
    if (!sheet) {
      sheet = ss.insertSheet(nome);
      sheet.appendRow(['Data e Hora', 'Usuário', 'Chave de Ligação', 'Observação', 'Contexto Físico (JSON)', 'Evento']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#284081').setFontColor('white');
      sheet.setFrozenRows(1);
    }
    if (typeof sheet.getMaxColumns === 'function' && sheet.getMaxColumns() < 6) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 6 - sheet.getMaxColumns());
    }
    var ultima = sheet.getLastRow();
    // Procura só a coluna de IDs; não relê centenas de observações a cada tecla.
    if (ultima > 0 && eventoId) {
      var encontrada = sheet.getRange(1, 6, ultima, 1).createTextFinder(id).matchEntireCell(true).findNext();
      if (encontrada) {
        var existente = pgGiroEventoLinha_(sheet.getRange(encontrada.getRow(), 1, 1, 6).getValues()[0], tipo, encontrada.getRow());
        if (existente.chave !== chave || existente.obs !== obs || JSON.stringify(existente.contexto) !== contexto.texto) {
          throw new Error('Este identificador já foi usado para outra observação.');
        }
        existente.success = true; existente.duplicate = true;
        return existente;
      }
    }
    var email = 'Anônimo';
    try { email = String(Session.getActiveUser().getEmail() || '').trim() || 'Anônimo'; } catch (e) {}
    var agora = new Date();
    // As cinco primeiras colunas e as chaves antigas continuam compatíveis.
    var proteger = function(texto) { return /^[=+@-]/.test(texto) ? "'" + texto : texto; };
    sheet.appendRow([agora, proteger(email), chave, proteger(obs), contexto.texto, id]);
    SpreadsheetApp.flush();
    var sequencia = sheet.getLastRow();
    pgGiroInvalidarRevisao_();
    return {success: true, duplicate: false, id: id, tipo: tipo, chave: chave, sequencia: sequencia,
      data: Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
      user: email, obs: obs, contexto: contexto.objeto};
  } catch (e) {
    return {success: false, error: String(e.message || e)};
  } finally { if (bloqueado) lock.releaseLock(); }
}
function salvarObsGiroPortal(tipo, chave, obs, contextoStr, eventoId) {
  return pgSalvarObsGiroPortal_(tipo, chave, obs, contextoStr, eventoId);
}
function buscarAtualizacoesGiroPortal(revisao) {
  // Leitura da revisão antes das linhas: uma gravação concorrente depois deste
  // ponto reaparece no próximo delta, em vez de ficar oculta por um token novo.
  var id = pgGiroRevisao_();
  var agora = new Date().getTime();
  var conferirCompleto = !revisao || !Number.isFinite(revisao.conferidoEm) || agora - revisao.conferidoEm >= 60000;
  if (revisao && revisao.id === id && !conferirCompleto) return {success: true, alterado: false, revisao: revisao};
  var ss = pgArquivoObservacoesGiro_();
  var m = ss.getSheetByName('Obs_Cockpit'), s = ss.getSheetByName('Obs_Cockpit_sku');
  var p = ss.getSheetByName(PG_ECD_PREVISOES_ABA);
  var parcial = !!(!conferirCompleto && revisao && Number.isInteger(revisao.master) && Number.isInteger(revisao.sku) && Number.isInteger(revisao.previsoes)
    && revisao.master >= 0 && revisao.sku >= 0 && revisao.previsoes >= 0
    && revisao.master <= (m ? m.getLastRow() : 0) && revisao.sku <= (s ? s.getLastRow() : 0)
    && revisao.previsoes <= (p ? p.getLastRow() : 0));
  var master = pgGiroLerAba_(m, 'MASTER', parcial ? revisao.master : 0);
  var sku = pgGiroLerAba_(s, 'SKU', parcial ? revisao.sku : 0);
  var previsoes = pgECDLerRegistros_(p, parcial ? revisao.previsoes : 0);
  var saida = {};
  Object.keys(previsoes.previsoes).forEach(function(k) { saida[k] = pgECDPublica_(previsoes.previsoes[k]); });
  return {success: true, alterado: true, parcial: parcial,
    historico: {master: master.historico, sku: sku.historico}, previsoes: saida,
    revisao: {id: id, master: master.ultima, sku: sku.ultima, previsoes: previsoes.ultima,
      conferidoEm: parcial ? revisao.conferidoEm : agora}};
}
