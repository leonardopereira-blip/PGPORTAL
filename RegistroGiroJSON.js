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
  var resultado = salvarObsGiro(tipo, chave, texto, contexto);
  if (!resultado || !resultado.success) return resultado;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var pasta = pgGiroPastaJSONV41_();
    var nome = 'Giro_Diario_Observacoes.json';
    var atual = pgGiroDocumentoJSONV41_(pasta, nome);
    var d = atual.documento;
    var id = String(eventoId || Utilities.getUuid());
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
