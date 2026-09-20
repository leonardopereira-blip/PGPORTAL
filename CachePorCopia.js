var pgFonteSnapshot_ = null;
var pgPreparacaoCache_ = null;

function atualizarTodoOCachePorCopia() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Uma geracao por copia ja esta em andamento.');
  var props = PropertiesService.getUserProperties();
  var estado;
  try {
    var origem = SpreadsheetApp.getActiveSpreadsheet().getId();
    var chave = 'CACHE_SNAPSHOT_' + origem;
    var salvo = props.getProperty(chave);
    estado = salvo ? JSON.parse(salvo) : null;
    if (!estado || estado.concluido) {
      console.log('[snapshot] Criando copia completa e atual da planilha');
      var original = DriveApp.getFileById(origem);
      var copia = original.makeCopy('CACHE VALORES - ' + new Date().toISOString() + ' - ' + original.getName());
      estado = { id: copia.getId(), origem: origem, criadoEm: new Date().toISOString(), valores: false };
      props.setProperty(chave, JSON.stringify(estado));
    }
    if (estado.id === origem || estado.origem !== origem) throw new Error('ID da copia invalido.');
    console.log('[snapshot] Copia: https://docs.google.com/spreadsheets/d/' + estado.id + '/edit');
    console.log('[snapshot] Fotografia dos dados criada em ' + estado.criadoEm);
    if (!estado.valores) {
      var meta = Sheets.Spreadsheets.get(estado.id, {
        fields: 'sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)),protectedRanges(protectedRangeId))'
      });
      var pedidos = [];
      meta.sheets.forEach(function(sheet) {
        if (!sheet.properties.gridProperties || (sheet.properties.sheetType && sheet.properties.sheetType !== 'GRID')) {
          throw new Error('Conversao nao suportada para a aba ' + sheet.properties.title);
        }
        (sheet.protectedRanges || []).forEach(function(p) {
          pedidos.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } });
        });
      });
      meta.sheets.forEach(function(sheet) {
        var p = sheet.properties;
        var range = { sheetId: p.sheetId, startRowIndex: 0, startColumnIndex: 0,
          endRowIndex: p.gridProperties.rowCount, endColumnIndex: p.gridProperties.columnCount };
        pedidos.push({ copyPaste: { source: range, destination: range,
          pasteType: 'PASTE_VALUES', pasteOrientation: 'NORMAL' } });
      });
      console.log('[snapshot] Convertendo TODAS as abas em valores na copia');
      // Um lote evita recalculos entre conversoes de abas dependentes.
      Sheets.Spreadsheets.batchUpdate({ requests: pedidos }, estado.id);
      estado.valores = true;
      props.setProperty(chave, JSON.stringify(estado));
      console.log('[snapshot] Conversao em valores concluida');
    }
    pgFonteSnapshot_ = estado.id;
    pgMetadadosCache_ = null;
    pgPreparacaoCache_ = Object.create(null);
    console.log('[snapshot] Preparando e validando todos os JSONs antes de publicar');
    atualizarTodoOCache();
    var preparados = pgPreparacaoCache_;
    pgPreparacaoCache_ = null;
    console.log('[snapshot] Todos os JSONs preparados. Publicando no Drive');
    Object.keys(preparados).forEach(function(nome) {
      if (!salvarJSONNoDrive(nome, JSON.parse(preparados[nome]))) {
        throw new Error('Publicacao interrompida em ' + nome + '. Alguns arquivos podem ter sido atualizados.');
      }
    });
    // Aquece uma fatia de dashboard por mes (o cache do dashboard e fatiado).
    var ram = Object.keys(preparados).filter(function(nome) {
      return nome.indexOf(CACHE_DASHBOARD_PREFIXO) === 0;
    }).every(function(nome) {
      var mes = nome.slice(CACHE_DASHBOARD_PREFIXO.length).replace(/\.json$/, '');
      return salvarNoCacheRAM(pgChaveRamMesDashboard_(mes), preparados[nome]);
    });
    if (preparados[CACHE_DASHBOARD_INDICE]) salvarNoCacheRAM('DADOS_DASHBOARD_INDICE', preparados[CACHE_DASHBOARD_INDICE]);
    pgRemoverFatiasObsoletas_(Object.keys(preparados).filter(function(nome) {
      return nome.indexOf(CACHE_DASHBOARD_PREFIXO) === 0;
    }).map(function(nome) { return nome.slice(CACHE_DASHBOARD_PREFIXO.length).replace(/\.json$/, ''); }));
    estado.concluido = true;
    props.setProperty(chave, JSON.stringify(estado));
    console.log('[snapshot] Todos os JSONs publicados; RAM=' + ram);
    return { copiaId: estado.id, criadoEm: estado.criadoEm, arquivos: Object.keys(preparados), ram: ram };
  } finally {
    pgFonteSnapshot_ = null;
    pgPreparacaoCache_ = null;
    pgMetadadosCache_ = null;
    lock.releaseLock();
  }
}

function pgValidarBlocoSnapshot_(bloco, nome, inicio) {
  bloco.forEach(function(row, i) {
    row.forEach(function(valor, j) {
      if (typeof valor === 'string' && /^(#REF!|#ERROR!|#VALUE!|#DIV\/0!|#N\/A|#NAME\?|#NUM!|#SPILL!|#CALC!|#LOADING!|Loading\.{0,3}|Carregando\.{0,3})$/i.test(valor.trim())) {
        throw new Error('Copia com erro em ' + nome + '!' + pgColunaCache_(j + 1) + (inicio + i + 1) +
          ': ' + valor + '. JSONs anteriores preservados. Verifique as importacoes na copia.');
      }
    });
  });
}
