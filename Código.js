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

function salvarObsGiro(tipo, chave, obs, contextoStr, eventoId) {
  return pgSalvarObsGiroPortal_(tipo, chave, obs, contextoStr, eventoId);
}

function buscarHistoricoObsGiro() {
  return pgBuscarHistoricoObsGiroPortal_();
}