const PASTA_CACHE_ID = "1BE3_IL2lfsuFfR3JD1a7Bx7PLtc3Oug-";

// Função Universal para gerar/atualizar os arquivos
function salvarJSONNoDrive(nomeArquivo, dadosObjeto) {
  try {
    var pasta = DriveApp.getFolderById(PASTA_CACHE_ID);
    var conteudoJSON = JSON.stringify(dadosObjeto);
    var arquivos = pasta.getFilesByName(nomeArquivo);
    
    if (arquivos.hasNext()) {
      arquivos.next().setContent(conteudoJSON); // Apenas sobrescreve, mantendo o mesmo ID
    } else {
      pasta.createFile(nomeArquivo, conteudoJSON, MimeType.PLAIN_TEXT);
    }
    return true;
  } catch (e) {
    Logger.log("Erro no cache (" + nomeArquivo + "): " + e.toString());
    return false;
  }
}

// =========================================================================
// GATILHO: RODAR DE 1 EM 1 HORA
// =========================================================================
function atualizarTodoOCache() {
  // Lê as funções que você já tem no Code.gs e gera os caches
  salvarJSONNoDrive("cache_dashboard.json", getDadosDashboard());
  salvarJSONNoDrive("cache_cockpit.json", getDadosCockpit());
  salvarJSONNoDrive("cache_pre_producao.json", getDadosPreProducao());
  salvarJSONNoDrive("cache_qualidade.json", getDadosQualidade());
  salvarJSONNoDrive("cache_ppm.json", getDadosPPM());
  salvarJSONNoDrive("cache_inspecoes.json", getDadosInspecaoCDs());
  salvarJSONNoDrive("cache_alocacao.json", getDadosAlocacao());
  salvarJSONNoDrive("cache_chamados.json", getDadosChamados());
  salvarJSONNoDrive("cache_caixas.json", getDadosCaixas());
  salvarJSONNoDrive("cache_mapa.json", getDadosMapaSaida());
  salvarJSONNoDrive("cache_observacoes.json", buscarHistoricoObsGiro());
}
// Adicione no Cache.gs
function lerJSONDoDrive(nomeArquivo) {
  try {
    // ID colocado diretamente aqui para não ter erro de escopo!
    var pasta = DriveApp.getFolderById("1BE3_IL2lfsuFfR3JD1a7Bx7PLtc3Oug-"); 
    var arquivos = pasta.getFilesByName(nomeArquivo);
    
    if (arquivos.hasNext()) {
      return arquivos.next().getBlob().getDataAsString();
    }
    return "[]"; 
  } catch (e) {
    Logger.log("Erro ao ler " + nomeArquivo + ": " + e.toString());
    return "[]";
  }
}

// =========================================================================
// FUNÇÕES PONTE (Para o HTML chamar e ler do Cache)
// =========================================================================

function getDadosAlocacao_Cache() { return lerJSONDoDrive("cache_alocacao.json"); }
function getDadosCaixas_Cache() { return lerJSONDoDrive("cache_caixas.json"); }
function getDadosChamados_Cache() { return lerJSONDoDrive("cache_chamados.json"); }
function getDadosCockpit_Cache() { return lerJSONDoDrive("cache_cockpit.json"); }
function getDadosDashboard_Cache() { return lerJSONDoDrive("cache_dashboard.json"); }
function getDadosInspecaoCDs_Cache() { return lerJSONDoDrive("cache_inspecoes.json"); }
function getDadosMapaSaida_Cache() { return lerJSONDoDrive("cache_mapa.json"); }
function buscarHistoricoObsGiro_Cache() { return lerJSONDoDrive("cache_observacoes.json"); }
function getDadosPPM_Cache() { return lerJSONDoDrive("cache_ppm.json"); }
function getDadosPreProducao_Cache() { return lerJSONDoDrive("cache_pre_producao.json"); }
function getDadosQualidade_Cache() { return lerJSONDoDrive("cache_qualidade.json"); }