function atualizar_PCP_Funil_e_Atrasos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

 /* =====================================================
     MÓDULO 1 – IMPORT_PCP → PCP
     ===================================================== */

//  const abaImport = ss.getSheetByName("import_pcp");/
//  const abaPCP = ss.getSheetByName("PCP");/
//  if (!abaImport || !abaPCP) throw new Error("Aba import_pcp ou PCP não encontrada.");

//  abaPCP.getRange("BN2:DO").clearContent();

//  const ultimaLinhaPCP = abaImport.getLastRow();
//  if (ultimaLinhaPCP >= 2) {
//    const dadosPCP = abaImport
//      .getRange(2, 1, ultimaLinhaPCP - 1, 54)
//      .getValues()
//      .filter(l => l[1] !== "");

//    if (dadosPCP.length > 0) {
//      abaPCP.getRange(2, 66, dadosPCP.length, dadosPCP[0].length)
//        .setValues(dadosPCP);
//    }
//  } 

  /* =====================================================
     MÓDULO 1.5 – import_cal → CAL. EDIT.
     ===================================================== */

  const abaImportCal = ss.getSheetByName("import_cal");
  const abacal = ss.getSheetByName("CAL. EDIT.");
  if (!abaImportCal || !abacal) throw new Error("Aba cal edit ou import cal não encontrada.");

  abacal.getRange("k2:at").clearContent();

  const ultimaLinhaCal = abaImportCal.getLastRow();
  if (ultimaLinhaCal >= 2) {
    const dadosCal = abaImportCal
      .getRange(2, 2, ultimaLinhaCal - 1, 36)
      .getValues()
      .filter(l => l[1] !== "");

    if (dadosCal.length > 0) {
      abacal.getRange(2, 11, dadosCal.length, dadosCal[0].length)
        .setValues(dadosCal);
    }
  }


  /* =====================================================
     MÓDULO 2 – IMPORT_MP → MAPA DE SAÍDA
     ===================================================== */

  const abaImportMP = ss.getSheetByName("import_mp");
  const abaMapaSaida = ss.getSheetByName("MAPA DE SAÍDA");
  if (!abaImportMP || !abaMapaSaida) throw new Error("Aba import_mp ou MAPA DE SAÍDA não encontrada.");

  abaMapaSaida.getRange("D2:AC").clearContent();

  const ultimaLinhaMP = abaImportMP.getLastRow();
  if (ultimaLinhaMP >= 2) {
    const dadosMP = abaImportMP
      .getRange(2, 1, ultimaLinhaMP - 1, 26)
      .getValues()
      .filter(l => l[1] !== "");

    if (dadosMP.length > 0) {
      abaMapaSaida.getRange(2, 4, dadosMP.length, dadosMP[0].length)
        .setValues(dadosMP);
    }
  }
}
// =========================================================================
// MÓDULO DE OBSERVAÇÕES - GIRO SEMANAL (COCKPIT)
// =========================================================================

function salvarObsGiro(tipo, chave, obs, contextoStr) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Define a aba correta com base no tipo (MASTER ou SKU)
    var nomeAba = tipo === 'SKU' ? 'Obs_Cockpit_sku' : 'Obs_Cockpit';
    var sheet = ss.getSheetByName(nomeAba);

    // Se a aba não existir, cria e formata o cabeçalho automaticamente
    if (!sheet) {
      sheet = ss.insertSheet(nomeAba);
      sheet.appendRow(["Data e Hora", "Usuário", "Chave de Ligação", "Observação", "Contexto Físico (JSON)"]);
      sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#4f46e5").setFontColor("white");
      sheet.setFrozenRows(1);
    }

    var email = "Modo Desenvolvedor / Desconhecido";
    try { email = Session.getActiveUser().getEmail() || "Anônimo"; } catch(e){}
    var agora = new Date();

    // Insere a nova linha no banco de dados
    sheet.appendRow([agora, email, chave, obs, contextoStr]);
    
    // Retorna os dados formatados para atualizar o front-end na hora
    var dataFormatada = Utilities.formatDate(agora, "GMT-3", "dd/MM/yyyy HH:mm");
    return { success: true, data: dataFormatada, user: email, obs: obs, chave: chave, tipo: tipo };
    
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function buscarHistoricoObsGiro() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = { master: {}, sku: {} };

    // Função interna para varrer as abas e agrupar pela chave
    function lerAba(nomeAba, destinoMap) {
      var sheet = ss.getSheetByName(nomeAba);
      if (!sheet) return;
      
      var data = sheet.getDataRange().getDisplayValues();
      for (var i = 1; i < data.length; i++) {
        var dt = data[i][0];
        var usr = data[i][1];
        var chave = data[i][2];
        var obs = data[i][3];
        
        if (!chave) continue;
        if (!destinoMap[chave]) destinoMap[chave] = [];
        
        // Colocamos no início do array para o mais recente aparecer primeiro
        destinoMap[chave].unshift({ data: dt, user: usr, obs: obs });
      }
    }

    lerAba('Obs_Cockpit', result.master);
    lerAba('Obs_Cockpit_sku', result.sku);

    return result;
  } catch(e) {
    return { master: {}, sku: {} };
  }
}