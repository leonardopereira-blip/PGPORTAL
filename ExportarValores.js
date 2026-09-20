function exportarPlanilhaSomenteValores() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Uma exportacao ja esta em andamento para este usuario.');
  try {
    var inicio = Date.now();
    var origem = SpreadsheetApp.getActiveSpreadsheet().getId();
    var props = PropertiesService.getUserProperties();
    var chave = 'EXPORTACAO_CSV_' + origem;
    var salvo = props.getProperty(chave);
    var estado = salvo ? JSON.parse(salvo) : null;
    var pasta, manifesto;
    if (!estado || estado.concluido) {
      console.log('[CSV] Listando abas do ORIGINAL, sem ler celulas pela API Sheets');
      var meta = Sheets.Spreadsheets.get(origem, {
        fields: 'properties(title),sheets(properties(sheetId,title))'
      });
      var agora = new Date().toISOString();
      pasta = DriveApp.createFolder('EXPORTACAO VALORES - ' + meta.properties.title + ' - ' + agora);
      manifesto = { origem: origem, nome: meta.properties.title, iniciadoEm: agora,
        abas: meta.sheets.map(function(s) {
          var p = s.properties;
          return { id: p.sheetId, nome: p.title,
            arquivo: p.sheetId + '_' + p.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') + '.csv' };
        }) };
      var arquivoManifesto = pasta.createFile('manifesto.json', JSON.stringify(manifesto, null, 2), MimeType.PLAIN_TEXT);
      estado = { pastaId: pasta.getId(), manifestoId: arquivoManifesto.getId(), indice: 0, concluido: false };
      props.setProperty(chave, JSON.stringify(estado));
    } else {
      pasta = DriveApp.getFolderById(estado.pastaId);
      manifesto = JSON.parse(DriveApp.getFileById(estado.manifestoId).getBlob().getDataAsString());
      if (manifesto.origem !== origem) throw new Error('Origem da exportacao invalida.');
    }
    var pastaUrl = 'https://drive.google.com/drive/folders/' + estado.pastaId;
    console.log('[CSV] Arquivos: ' + pastaUrl);
    for (; estado.indice < manifesto.abas.length; estado.indice++) {
      if (Date.now() - inicio > 210000) {
        props.setProperty(chave, JSON.stringify(estado));
        console.log('[CSV] Progresso salvo. Execute exportarPlanilhaSomenteValores novamente para continuar.');
        return { concluido: false, exportadas: estado.indice, total: manifesto.abas.length, pasta: pastaUrl };
      }
      var aba = manifesto.abas[estado.indice];
      console.log('[CSV] Exportando ORIGINAL: ' + aba.nome + ' (' + (estado.indice + 1) + '/' + manifesto.abas.length + ')');
      if (!pasta.getFilesByName(aba.arquivo).hasNext()) {
        var resposta = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + encodeURIComponent(origem) +
          '/export?format=csv&gid=' + encodeURIComponent(aba.id), {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
        pgValidarRespostaCSV_(resposta, aba.nome);
        pasta.createFile(resposta.getBlob().setName(aba.arquivo));
      }
      console.log('[CSV] Salvo: ' + aba.arquivo);
      props.setProperty(chave, JSON.stringify(Object.assign({}, estado, { indice: estado.indice + 1 })));
    }
    console.log('[CSV] Todas as abas exportadas. Montando ZIP');
    var blobs = manifesto.abas.map(function(aba) {
      var arquivos = pasta.getFilesByName(aba.arquivo);
      if (!arquivos.hasNext()) throw new Error('CSV ausente: ' + aba.arquivo);
      return arquivos.next().getBlob().setName(aba.arquivo);
    });
    blobs.push(DriveApp.getFileById(estado.manifestoId).getBlob().setName('manifesto.json'));
    var existentes = pasta.getFilesByName('planilha_somente_valores.zip');
    var zip = existentes.hasNext() ? existentes.next() :
      pasta.createFile(Utilities.zip(blobs, 'planilha_somente_valores.zip'));
    estado.concluido = true;
    estado.zipId = zip.getId();
    props.setProperty(chave, JSON.stringify(estado));
    var zipUrl = 'https://drive.google.com/file/d/' + estado.zipId + '/view';
    console.log('[CSV] CONCLUIDO: ' + zipUrl);
    return { concluido: true, abas: manifesto.abas.length, zip: zipUrl, pasta: pastaUrl };
  } finally {
    lock.releaseLock();
  }
}

function pgValidarRespostaCSV_(resposta, aba) {
  var codigo = resposta.getResponseCode();
  if (codigo !== 200) throw new Error('Exportacao CSV de ' + aba + ' falhou: HTTP ' + codigo +
    '. Execute novamente para retomar.');
  var headers = resposta.getAllHeaders();
  var tipo = Object.keys(headers).filter(function(k) { return k.toLowerCase() === 'content-type'; })[0];
  if (!tipo || !/\b(?:text|application)\/csv\b/i.test(String(headers[tipo]))) {
    throw new Error('A exportacao de ' + aba + ' nao retornou CSV. Verifique o acesso ao arquivo original.');
  }
}
