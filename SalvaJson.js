const PASTA_CACHE_ID = "1BE3_IL2lfsuFfR3JD1a7Bx7PLtc3Oug-";
const CACHE_DASHBOARD_ATIVO = "cache_dashboard_publicado.json";
const CACHE_DASHBOARD_TMP = "cache_dashboard.json";

// Limite pratico do File.setContent() no Apps Script (~10 MB). Acima disso gravamos via Blob.
var PG_LIMITE_SET_CONTENT = 9 * 1024 * 1024;

function pgGravarArquivoDrive_(pasta, nomeArquivo, conteudoJSON) {
  var blob = Utilities.newBlob(conteudoJSON, 'application/json', nomeArquivo);
  var bytes = blob.getBytes().length;
  var arquivos = pasta.getFilesByName(nomeArquivo);
  var existente = arquivos.hasNext() ? arquivos.next() : null;

  if (existente && bytes <= PG_LIMITE_SET_CONTENT) {
    console.log('[cache] Drive: gravando ' + nomeArquivo + ' (' + bytes + ' bytes)');
    existente.setContent(conteudoJSON);
    return;
  }

  // Arquivos grandes: cria pelo Blob (setContent estoura o limite de tamanho) e descarta a versao antiga.
  console.log('[cache] Drive: regravando ' + nomeArquivo + ' via Blob (' + bytes + ' bytes)');
  var novo = pasta.createFile(blob);
  novo.setName(nomeArquivo);
  if (existente) existente.setTrashed(true);
  while (arquivos.hasNext()) arquivos.next().setTrashed(true);
}

function salvarJSONNoDrive(nomeArquivo, dadosObjeto) {
  try {
    var conteudoJSON = JSON.stringify(otimizarPayload(dadosObjeto));
    if (typeof pgPreparacaoCache_ !== 'undefined' && pgPreparacaoCache_) {
      pgPreparacaoCache_[nomeArquivo] = conteudoJSON;
      console.log('[snapshot] JSON preparado: ' + nomeArquivo);
      return true;
    }
    console.log('[cache] Drive: abrindo pasta para ' + nomeArquivo);
    var pasta = DriveApp.getFolderById(PASTA_CACHE_ID);
    console.log('[cache] Drive: preparando ' + nomeArquivo + ' (' + conteudoJSON.length + ' caracteres)');
    pgGravarArquivoDrive_(pasta, nomeArquivo, conteudoJSON);
    console.log('[cache] Drive: salvo ' + nomeArquivo);
    return true;
  } catch (e) {
    Logger.log("Erro no cache (" + nomeArquivo + "): " + e.toString());
    console.error('[cache] Falha ao gravar ' + nomeArquivo + ': ' + e.toString());
    return false;
  }
}

function lerJSONDoDrive(nomeArquivo) {
  try {
    var pasta = DriveApp.getFolderById(PASTA_CACHE_ID); 
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

function salvarNoCacheRAM(chave, dados) {
  try {
    if (typeof pgPreparacaoCache_ !== 'undefined' && pgPreparacaoCache_) return true;
    var cache = CacheService.getScriptCache();
    var jsonString = (typeof dados === 'string') ? dados : JSON.stringify(dados);
    var maxChars = 45000; 
    var numChunks = Math.ceil(jsonString.length / maxChars);
    var cacheData = {};

    for (var i = 0; i < numChunks; i++) {
      var chunk = jsonString.substring(i * maxChars, (i + 1) * maxChars);
      cacheData[chave + '_chunk_' + i] = chunk;
    }

    cache.putAll(cacheData, 21600); // 6 horas de retenção
    cache.put(chave + '_metadata', numChunks.toString(), 21600);
    return true;
  } catch(e) {
    Logger.log("Erro ao salvar RAM Cache: " + e.toString());
    return false;
  }
}

function lerDoCacheRAM(chave) {
  try {
    var cache = CacheService.getScriptCache();
    var numChunksStr = cache.get(chave + '_metadata');

    if (!numChunksStr) return null; 

    var numChunks = parseInt(numChunksStr, 10);
    if (!Number.isInteger(numChunks) || numChunks < 1 || numChunks > 1000) return null;
    var keys = [];
    for (var i = 0; i < numChunks; i++) keys.push(chave + '_chunk_' + i);
    var chunks = cache.getAll(keys);
    var partes = [];
    for (var i = 0; i < keys.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(chunks, keys[i])) return null;
      partes.push(chunks[keys[i]]);
    }
    var jsonString = partes.join('');

    return jsonString;
  } catch(e) {
    return null;
  }
}

// ======================================================
// CACHE DO DASHBOARD FATIADO POR MES DA COLETA FINAL (RE) PLAN
// ======================================================

const CACHE_DASHBOARD_PREFIXO = "cache_dashboard_mes_";
const CACHE_DASHBOARD_INDICE = "cache_dashboard_indice.json";
const COLUNA_MES_DASHBOARD = "Coleta/Internalização de estoque final (re) plan";
const MES_DASHBOARD_SEM_DATA = "sem-data";

function pgArquivoMesDashboard_(mes) {
  return CACHE_DASHBOARD_PREFIXO + mes + ".json";
}

function pgChaveRamMesDashboard_(mes) {
  return 'DADOS_DASHBOARD_' + mes;
}

// Aceita Date, ISO (yyyy-mm-dd...) e dd/mm/aaaa; devolve "aaaa-mm" ou "" quando nao ha data valida.
function pgMesDeValor_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return "";
    return Utilities.formatDate(valor, 'GMT-3', 'yyyy-MM');
  }
  if (typeof valor === 'number') return "";
  var texto = String(valor).trim();
  if (!texto) return "";
  var iso = texto.match(/^(\d{4})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2];
  var br = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (br) return br[3] + '-' + ('0' + br[2]).slice(-2);
  var data = new Date(texto);
  if (!isNaN(data.getTime())) return Utilities.formatDate(data, 'GMT-3', 'yyyy-MM');
  return "";
}

// Resolve o nome real do cabecalho (acentos/espacos variam entre planilhas).
function pgResolverColunaMes_(registro) {
  if (Object.prototype.hasOwnProperty.call(registro, COLUNA_MES_DASHBOARD)) return COLUNA_MES_DASHBOARD;
  var normalizar = function(texto) {
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  };
  var chaves = Object.keys(registro);
  for (var i = 0; i < chaves.length; i++) {
    var n = normalizar(chaves[i]);
    if (n.indexOf('coleta') === 0 && n.indexOf('final') > -1 && n.indexOf('(re) plan') > -1) return chaves[i];
  }
  return "";
}

function pgAgruparDashboardPorMes_(dados) {
  var coluna = "";
  for (var i = 0; i < dados.length && !coluna; i++) coluna = pgResolverColunaMes_(dados[i]);
  if (!coluna) console.warn('[cache] Dashboard: coluna "' + COLUNA_MES_DASHBOARD + '" nao encontrada; tudo vai para ' + MES_DASHBOARD_SEM_DATA);
  var grupos = Object.create(null);
  for (var j = 0; j < dados.length; j++) {
    var chaveColuna = coluna;
    // Registros de outras abas podem trazer o cabecalho com grafia diferente.
    if (chaveColuna && !Object.prototype.hasOwnProperty.call(dados[j], chaveColuna)) {
      chaveColuna = pgResolverColunaMes_(dados[j]);
    }
    var mes = chaveColuna ? pgMesDeValor_(dados[j][chaveColuna]) : "";
    if (!mes) mes = MES_DASHBOARD_SEM_DATA;
    if (!grupos[mes]) grupos[mes] = [];
    grupos[mes].push(dados[j]);
  }
  return { coluna: coluna, grupos: grupos };
}

function pgOrdenarMeses_(meses) {
  return meses.slice().sort(function(a, b) {
    if (a === MES_DASHBOARD_SEM_DATA) return 1;
    if (b === MES_DASHBOARD_SEM_DATA) return -1;
    return a < b ? 1 : (a > b ? -1 : 0); // mais recentes primeiro
  });
}

// Remove fatias de meses que nao existem mais na planilha.
function pgRemoverFatiasObsoletas_(mesesValidos) {
  var validos = Object.create(null);
  mesesValidos.forEach(function(mes) { validos[pgArquivoMesDashboard_(mes)] = true; });
  var removidos = [];
  try {
    var arquivos = DriveApp.getFolderById(PASTA_CACHE_ID).getFiles();
    while (arquivos.hasNext()) {
      var arquivo = arquivos.next();
      var nome = arquivo.getName();
      if (nome.indexOf(CACHE_DASHBOARD_PREFIXO) === 0 && !validos[nome]) {
        arquivo.setTrashed(true);
        removidos.push(nome);
      }
    }
  } catch (e) {
    console.warn('[cache] Dashboard: nao foi possivel limpar fatias antigas: ' + e.message);
  }
  if (removidos.length) console.log('[cache] Dashboard: fatias removidas -> ' + removidos.join(', '));
  return removidos;
}

function getDadosDashboardIndice() {
  var json = lerDoCacheRAM('DADOS_DASHBOARD_INDICE');
  if (!json) json = lerJSONDoDrive(CACHE_DASHBOARD_INDICE);
  if (json && json !== "[]") {
    try {
      var indice = JSON.parse(json);
      if (indice && indice.meses && indice.meses.length) {
        salvarNoCacheRAM('DADOS_DASHBOARD_INDICE', json);
        return JSON.stringify(indice);
      }
    } catch (e) {
      console.error('[cache] Indice do dashboard corrompido: ' + e.message);
    }
  }
  throw new Error(CACHE_DASHBOARD_INDICE + ' indisponivel. Atualize o cache antes de abrir o portal.');
}

function getDadosDashboardMes(mes) {
  var chave = String(mes || "").trim();
  if (!/^(\d{4}-\d{2}|sem-data)$/.test(chave)) throw new Error('Mes invalido: ' + mes);
  var json = lerDoCacheRAM(pgChaveRamMesDashboard_(chave));
  if (json && json !== "[]") return json;
  json = lerJSONDoDrive(pgArquivoMesDashboard_(chave));
  if (json && json !== "[]") {
    salvarNoCacheRAM(pgChaveRamMesDashboard_(chave), json);
    return json;
  }
  throw new Error('Fatia ' + pgArquivoMesDashboard_(chave) + ' indisponivel.');
}

// Junta todas as fatias. Usado por chamadores antigos; o portal carrega mes a mes.
function pgJuntarFatiasDashboard_() {
  var indice;
  try { indice = JSON.parse(getDadosDashboardIndice()); } catch (e) { return ""; }
  var partes = [];
  indice.meses.forEach(function(item) {
    var json = getDadosDashboardMes(item.mes);
    if (json && json !== "[]") partes.push(json.replace(/^\s*\[/, '').replace(/\]\s*$/, ''));
  });
  var corpo = partes.filter(function(p) { return p.trim() !== ""; }).join(',');
  return corpo ? '[' + corpo + ']' : "";
}

// Envia o JSON já armazenado, evitando desserializar e serializar milhares de registros no RPC.
function getDadosDashboardInicial() {
  var json = lerDoCacheRAM('DADOS_DASHBOARD');
  if (json && json !== "[]") return json;
  json = pgJuntarFatiasDashboard_();
  if (!json) {
    json = lerJSONDoDrive(CACHE_DASHBOARD_ATIVO);
    if (!json || json === "[]") json = lerJSONDoDrive(CACHE_DASHBOARD_TMP);
  }
  if (json && json !== "[]") {
    salvarNoCacheRAM('DADOS_DASHBOARD', json);
    return json;
  }
  throw new Error('Cache do dashboard indisponivel. Nao foi feita leitura da planilha viva no carregamento inicial.');
}

function getMetadadosCachePortal() {
  try {
    var pasta = DriveApp.getFolderById(PASTA_CACHE_ID);
    var arquivos = pasta.getFilesByName(CACHE_DASHBOARD_INDICE);
    if (!arquivos.hasNext()) arquivos = pasta.getFilesByName(CACHE_DASHBOARD_ATIVO);
    if (!arquivos.hasNext()) arquivos = pasta.getFilesByName(CACHE_DASHBOARD_TMP);
    var atualizadoEm = arquivos.hasNext() ? arquivos.next().getLastUpdated().toISOString() : "";
    return {
      atualizadoEm: atualizadoEm,
      consultadoEm: new Date().toISOString()
    };
  } catch (e) {
    console.error('[cache] Metadados: ' + e.message);
    return {
      atualizadoEm: "",
      consultadoEm: new Date().toISOString(),
      erro: e.message
    };
  }
}

function getDadosDashboard_Cache() {
  var json = getDadosDashboardInicial();
  try { return JSON.parse(json); } catch (e) { return json; }
}

function atualizarCacheDashboard() {
  var inicio = Date.now();
  console.log('[cache] Dashboard: iniciando leitura das planilhas');
  var dadosPCP = _processarDadosDashboardBruto();
  console.log('[cache] Dashboard: leitura concluida, ' + dadosPCP.length + ' registros');
  if (!dadosPCP.length) throw new Error('Dashboard sem registros. Cache anterior preservado.');

  var agrupado = pgAgruparDashboardPorMes_(dadosPCP);
  var meses = pgOrdenarMeses_(Object.keys(agrupado.grupos));
  console.log('[cache] Dashboard: fatiando por ' + (agrupado.coluna || COLUNA_MES_DASHBOARD) + ' -> ' + meses.length + ' meses');

  var indice = { colunaBase: agrupado.coluna || COLUNA_MES_DASHBOARD, registros: dadosPCP.length,
    geradoEm: new Date().toISOString(), meses: [] };

  meses.forEach(function(mes) {
    var fatia = agrupado.grupos[mes];
    var arquivo = pgArquivoMesDashboard_(mes);
    if (!salvarJSONNoDrive(arquivo, fatia)) {
      throw new Error('Falha ao gravar ' + arquivo + '. Consulte o erro do Drive acima.');
    }
    salvarNoCacheRAM(pgChaveRamMesDashboard_(mes), JSON.stringify(otimizarPayload(fatia)));
    indice.meses.push({ mes: mes, registros: fatia.length, arquivo: arquivo });
  });

  if (!salvarJSONNoDrive(CACHE_DASHBOARD_INDICE, indice)) {
    throw new Error('Falha ao gravar ' + CACHE_DASHBOARD_INDICE + '. Fatias gravadas, indice anterior preservado.');
  }
  salvarNoCacheRAM('DADOS_DASHBOARD_INDICE', JSON.stringify(indice));
  if (typeof pgPreparacaoCache_ === 'undefined' || !pgPreparacaoCache_) {
    // O monolito em RAM vira obsoleto: o portal passa a ler fatia por fatia.
    try { CacheService.getScriptCache().remove('DADOS_DASHBOARD_metadata'); } catch (e) {}
    pgRemoverFatiasObsoletas_(meses);
  }

  console.log('[cache] Dashboard: ' + meses.length + ' fatias atualizadas em ' + ((Date.now() - inicio) / 1000) + 's');
  return { registros: dadosPCP.length, meses: indice.meses };
}

// Reaquece o cache em RAM a partir das fatias publicadas no Drive.
function publicarCacheDashboardAtual() {
  var indiceJson = lerJSONDoDrive(CACHE_DASHBOARD_INDICE);
  if (!indiceJson || indiceJson === "[]") throw new Error(CACHE_DASHBOARD_INDICE + ' indisponivel.');
  var indice = JSON.parse(indiceJson);
  salvarNoCacheRAM('DADOS_DASHBOARD_INDICE', indiceJson);
  var aquecidos = [];
  indice.meses.forEach(function(item) {
    var json = lerJSONDoDrive(item.arquivo || pgArquivoMesDashboard_(item.mes));
    if (json && json !== "[]") {
      salvarNoCacheRAM(pgChaveRamMesDashboard_(item.mes), json);
      aquecidos.push(item.mes);
    }
  });
  return { publicado: true, meses: aquecidos, registros: indice.registros };
}

function pgAtualizarArquivoCache_(arquivo, carregar) {
  console.log('[cache] Iniciando ' + arquivo);
  var dados = carregar();
  if (!dados || dados._ERRO_CRITICO || (Array.isArray(dados) && dados.some(function(r) { return r && r.erro; }))) {
    throw new Error('Dados invalidos para ' + arquivo + '. Cache anterior preservado.');
  }
  if (!salvarJSONNoDrive(arquivo, dados)) throw new Error('Falha ao gravar ' + arquivo);
}

function atualizarCachePreProducao() {
  pgAtualizarArquivoCache_('cache_pre_producao.json', getDadosPreProducao);
}

function atualizarCacheQualidade() {
  pgAtualizarArquivoCache_('cache_qualidade.json', getDadosQualidade);
}

function atualizarTodoOCache() {
  var falhas = [];
  try { atualizarCacheDashboard(); } catch (e) {
    console.error('[cache] Dashboard: ' + e.message);
    falhas.push('cache_dashboard.json: ' + e.message);
  }
  var etapas = [
    ['cache_cockpit.json', getDadosCockpit],
    ['cache_pre_producao.json', getDadosPreProducao],
    ['cache_qualidade.json', getDadosQualidade],
    ['cache_ppm.json', getDadosPPM],
    ['cache_inspecoes.json', getDadosInspecaoCDs],
    ['cache_alocacao.json', getDadosAlocacao],
    ['cache_chamados.json', getDadosChamados],
    ['cache_caixas.json', getDadosCaixas],
    ['cache_mapa.json', getDadosMapaSaida],
    ['cache_observacoes.json', buscarHistoricoObsGiro]
  ];
  etapas.forEach(function(etapa) {
    try { pgAtualizarArquivoCache_(etapa[0], etapa[1]); } catch (e) {
      console.error('[cache] ' + etapa[0] + ': ' + e.message);
      falhas.push(etapa[0] + ': ' + e.message);
    }
  });
  if (falhas.length) throw new Error('Caches com falha: ' + falhas.join(' | '));
  console.log('[cache] Todos os caches atualizados');
}

function getDadosAlocacao_Cache() { return JSON.parse(lerJSONDoDrive("cache_alocacao.json")); }
function getDadosCaixas_Cache() { return JSON.parse(lerJSONDoDrive("cache_caixas.json")); }
function getDadosChamados_Cache() { return JSON.parse(lerJSONDoDrive("cache_chamados.json")); }
function getDadosCockpit_Cache() { return JSON.parse(lerJSONDoDrive("cache_cockpit.json")); }
function getDadosInspecaoCDs_Cache() { return JSON.parse(lerJSONDoDrive("cache_inspecoes.json")); }
function getDadosMapaSaida_Cache() {
  var json = lerJSONDoDrive("cache_mapa.json");
  if (!json || json === "[]") return {};
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error('[cache] Mapa de Saida: JSON invalido, seguindo sem mapa: ' + e.message);
    return {};
  }
}
function buscarHistoricoObsGiro_Cache() { return JSON.parse(lerJSONDoDrive("cache_observacoes.json")); }
function getDadosPPM_Cache() { return JSON.parse(lerJSONDoDrive("cache_ppm.json")); }
function getDadosPreProducao_Cache() { return JSON.parse(lerJSONDoDrive("cache_pre_producao.json")); }
function getDadosQualidade_Cache() { return JSON.parse(lerJSONDoDrive("cache_qualidade.json")); }

function otimizarPayload(dados) {
  if (!Array.isArray(dados)) return dados;
  return dados.map(function(registro) {
    var limpo = {};
    for (var chave in registro) {
      if (!(String(chave).indexOf("Col") === 0 && registro[chave] === "")) {
        limpo[chave] = registro[chave];
      }
    }
    return limpo;
  });
}








// EXPORTADOR NATIVO GOOGLE SHEETS
function exportarGiroGSheets(dados) {
  try {
    var ss = SpreadsheetApp.create("Giro_Semanal_Pendencias_" + Utilities.formatDate(new Date(), "GMT-3", "dd_MM_yyyy_HHmm"));
    var sheet = ss.getActiveSheet();
    sheet.setName("Pendencias_Giro");
    
    var header = ["Gráfica", "Marca", "Série", "Status Geral", "Etapa Pendente", "Qtd SKUs", "Tiragem Total"];
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground("#059669").setFontColor("#ffffff");
    
    if (dados && dados.length > 0) {
      var rows = dados.map(function(r) {
        return [r.grafica || "", r.marca || "", r.serie || "", r.status || "", r.pendencia || "", r.qtd || 0, r.tiragemTotal || 0];
      });
      sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
    }
    
    sheet.autoResizeColumns(1, header.length);
    return { success: true, url: ss.getUrl() };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// =========================================================================
// MÓDULO DE DISPARO DE E-MAIL E CONSOLIDAÇÃO (GIRO SEMANAL) - V3 (SHEETS)
// =========================================================================
function enviarEmailsPendenciasGiro(dados) {
  try {
    // Trava de Segurança no Servidor
    var usuarioAtual = Session.getActiveUser().getEmail();
    if (usuarioAtual && usuarioAtual.toLowerCase() !== "leonardo.pereira@arcoeducacao.com.br") {
      return { success: false, error: "Acesso Negado: Apenas Leonardo Pereira pode disparar estes e-mails." };
    }
    var ssId = "1QqtNrdqJftDYT8LnfiPJmFUWZbkeoPcF2av2wUobxLM";
    var ss = SpreadsheetApp.openById(ssId);
    
    // 1. Limpar e preencher a aba "Pendencias" da linha 2 em diante (Consolidado)
    var abaPend = ss.getSheetByName("Pendencias");
    if (abaPend) {
      var ultimaLinha = abaPend.getLastRow();
      if (ultimaLinha > 1) {
        abaPend.getRange(2, 1, ultimaLinha - 1, abaPend.getLastColumn()).clearContent(); 
      }
      if (dados && dados.length > 0) {
        var linhas = dados.map(function(d) {
          return [d.grafica, d.sku, d.marca, d.serie, d.desc, d.pendencia, d.dias, d.tiragem];
        });
        abaPend.getRange(2, 1, linhas.length, 8).setValues(linhas);
      }
    }
    
    if (!dados || dados.length === 0) return { success: true, count: 0 };

    // 2. Mapear os destinatários da Aba "Email"
    var abaEmail = ss.getSheetByName("Email");
    var mapEmails = {};
    if (abaEmail) {
      var emailsData = abaEmail.getDataRange().getValues();
      for (var i = 1; i < emailsData.length; i++) {
        var g = String(emailsData[i][0]).trim().toUpperCase();
        var e = String(emailsData[i][1]).trim();
        if (g && e) mapEmails[g] = e;
      }
    }
    
    // 3. Agrupar dados por gráfica
    var grupos = {};
    dados.forEach(function(d) {
       var g = String(d.grafica || "N/A").toUpperCase();
       if (!grupos[g]) grupos[g] = { skus: 0, tiragem: 0, itens: [] };
       grupos[g].skus++;
       grupos[g].tiragem += Number(d.tiragem) || 0;
       grupos[g].itens.push(d);
    });
    
    var emailCCMaster = "leonardo.pereira@arcoeducacao.com.br";
    var enviosDisparados = 0;
    
    // 4. Disparar e-mail APENAS para as gráficas mapeadas
    Object.keys(grupos).forEach(function(g) {
        var destinatario = mapEmails[g];
        if (!destinatario) return;
        
        var info = grupos[g];
        
        // 4.1 CRIAR PLANILHA GOOGLE SHEETS EXCLUSIVA PARA A GRÁFICA
        var nomeArquivo = "Backlog_Producao_" + g + "_" + Utilities.formatDate(new Date(), "GMT-3", "dd_MM_yyyy");
        var novaSs = SpreadsheetApp.create(nomeArquivo);
        var novaAba = novaSs.getActiveSheet();
        novaAba.setName("Pendencias");
        
        var cabecalho = ["Gráfica", "SKU", "Marca", "Série", "Descrição", "Etapa Pendente", "Dias de Atraso", "Tiragem"];
        novaAba.appendRow(cabecalho);
        novaAba.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
        
        // Ordenar itens do mais atrasado pro menos atrasado (negativos)
        info.itens.sort(function(a, b) { return a.dias - b.dias; }); 
        
        var linhasGrafica = info.itens.map(function(item) {
            return [item.grafica, item.sku, item.marca, item.serie, item.desc, item.pendencia, item.dias, item.tiragem];
        });
        
        novaAba.getRange(2, 1, linhasGrafica.length, cabecalho.length).setValues(linhasGrafica);
        novaAba.autoResizeColumns(1, cabecalho.length);
        
        // Tenta compartilhar para qualquer pessoa com o link poder ler
        try { DriveApp.getFileById(novaSs.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
        
        var linkPlanilha = novaSs.getUrl();
        
        // 4.2 CONSTRUIR O HTML DO EMAIL
        var html = "<div style='font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;'>";
        html += "<div style='background-color: #0f172a; padding: 20px; text-align: center;'><h2 style='color: #ffffff; margin: 0;'>🚨 Relatório de Pendências (Backlog V1)</h2><p style='color: #94a3b8; margin: 5px 0 0 0; font-size: 14px;'>Gráfica: <b>" + g + "</b></p></div>";
        html += "<div style='padding: 20px;'>";
        html += "<p style='font-size: 14px;'>Olá, seguem as pendências de <b>Produção (Envio V1)</b> mapeadas no Backlog que requerem atualização no <b>PCP</b>.</p>";
        
        html += "<div style='display: flex; gap: 15px; margin: 25px 0;'>";
        html += "<div style='flex: 1; background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; text-align: center;'><b style='color: #64748b; font-size: 12px; text-transform: uppercase;'>SKUs Atrasados:</b> <span style='font-size: 24px; display: block; color: #1e40af; font-weight: bold; margin-top: 5px;'>" + info.skus + "</span></div>";
        html += "<div style='flex: 1; background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; text-align: center;'><b style='color: #64748b; font-size: 12px; text-transform: uppercase;'>Tiragem Atrasada:</b> <span style='font-size: 24px; display: block; color: #b91c1c; font-weight: bold; margin-top: 5px;'>" + info.tiragem.toLocaleString('pt-BR') + "</span></div>";
        html += "</div>";

        // Botão para a Planilha do Google
        html += "<div style='text-align: center; margin: 20px 0;'>";
        html += "<a href='" + linkPlanilha + "' style='background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;'>📊 Acessar Planilha de Pendências</a>";
        html += "</div>";
        
        html += "<h3 style='color: #334155; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;'>Top 10 Itens Críticos (Por Dias de Atraso):</h3>";
        html += "<table style='width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; margin-top: 10px;'>";
        html += "<tr style='background: #f1f5f9;'><th style='padding: 8px; border-bottom: 2px solid #cbd5e1;'>SKU / Marca</th><th style='padding: 8px; border-bottom: 2px solid #cbd5e1;'>Etapa Pendente</th><th style='padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;'>Atraso</th><th style='padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: right;'>Tiragem</th></tr>";
        
        var topItens = info.itens.slice(0, 10);
        topItens.forEach(function(item) {
            html += "<tr style='border-bottom: 1px solid #e2e8f0;'>";
            html += "<td style='padding: 8px; color: #0f172a;'><strong style='display: block;'>" + item.sku + "</strong><span style='color: #64748b; font-size: 9px;'>" + item.marca + " | " + item.serie + "</span></td>";
            html += "<td style='padding: 8px; color: #475569;'>" + item.pendencia + "</td>";
            html += "<td style='padding: 8px; text-align: center; color: #dc2626; font-weight: bold;'>" + item.dias + " d</td>";
            html += "<td style='padding: 8px; text-align: right; font-weight: bold; color: #334155;'>" + Number(item.tiragem).toLocaleString('pt-BR') + "</td>";
            html += "</tr>";
        });
        
        html += "</table>";
        html += "<p style='margin-top: 25px; font-size: 11px; color: #94a3b8; text-align: center; background: #f8fafc; padding: 10px; border-radius: 6px;'>Acesse a planilha no link acima para ver a lista completa de " + info.skus + " SKUs.</p>";
        html += "</div></div>";
        
        MailApp.sendEmail({
            to: destinatario,
            cc: emailCCMaster,
            subject: "🚨 Backlog de Produção Gráfica (V1) - " + g,
            htmlBody: html
        });
        
        enviosDisparados++;
    });
    
    return { success: true, count: enviosDisparados };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// =========================================================================
// GERADOR DE PLANILHA - EXATAMENTE O QUE ESTÁ FILTRADO NA TELA
// =========================================================================
function gerarPlanilhaGiroFiltrado(dados) {
  try {
    var nomeArquivo = "Giro_Filtrado_" + Utilities.formatDate(new Date(), "GMT-3", "dd_MM_yyyy_HHmm");
    var ss = SpreadsheetApp.create(nomeArquivo);
    var aba = ss.getActiveSheet();
    aba.setName("Giro_Filtrado");
    
    var cabecalho = ["Gráfica", "Marca", "Série", "SKU", "Descrição", "Status Geral", "Etapa Pendente", "Dias de Atraso", "Tiragem"];
    aba.appendRow(cabecalho);
    aba.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    
    // Ordena do mais atrasado (negativo) para o mais positivo
    dados.sort(function(a, b) { return a.dias - b.dias; });
    
    var linhas = dados.map(function(d) {
        return [d.grafica, d.marca, d.serie, d.sku, d.desc, d.status, d.pendencia, d.dias, d.tiragem];
    });
    
    if (linhas.length > 0) {
        aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
    }
    aba.autoResizeColumns(1, cabecalho.length);
    
    return { success: true, url: ss.getUrl() };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
