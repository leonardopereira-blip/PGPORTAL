// =========================================================================
// GERENCIADOR AUTOMÁTICO DE VERSÕES NO GOOGLE DRIVE
// =========================================================================

const PASTA_PAI_VERSOES_ID = '1QD0uZvGGY7_AwaRt1cPwCleD62yqCmxS';

function criarNovaVersaoNoDrive() {
  try {
    var pastaPai = DriveApp.getFolderById(PASTA_PAI_VERSOES_ID);
    var pastas = pastaPai.getFolders();
    
    var maxVersao = 0;
    
    // Varre todas as pastas e encontra o maior número de versão existente
    while (pastas.hasNext()) {
      var pasta = pastas.next();
      var nome = pasta.getName();
      var match = nome.match(/Vers[aã]o\s*(\d+)/i);
      
      if (match) {
        var num = parseInt(match[1], 10);
        if (num > maxVersao) {
          maxVersao = num;
        }
      }
    }
    
    var numeroNovaVersao = maxVersao + 1;
    var nomeNovaPasta = "Versao " + numeroNovaVersao;
    var novaPasta = pastaPai.createFolder(nomeNovaPasta);
    
    Logger.log("✅ Pasta criada com sucesso: " + nomeNovaPasta + " (ID: " + novaPasta.getId() + ")");
    return novaPasta.getId();

  } catch (e) {
    Logger.log("❌ Erro ao criar pasta de versão: " + e.toString());
    throw new Error("Erro no Drive: " + e.toString());
  }
}