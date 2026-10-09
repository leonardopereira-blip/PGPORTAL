// =========================================================================
// MÓDULO 0 - CACHE TURBO (FATIAMENTO PARA BURLAR O LIMITE DE 100KB)
// =========================================================================

function salvarNoCache(chave, dados) {
  var cache = CacheService.getScriptCache();
  var jsonString = JSON.stringify(dados);
  // Limite seguro de caracteres (aprox. 90KB, já que JS usa 2 bytes por char)
  var maxChars = 45000; 
  var numChunks = Math.ceil(jsonString.length / maxChars);
  var cacheData = {};

  for (var i = 0; i < numChunks; i++) {
    var chunk = jsonString.substring(i * maxChars, (i + 1) * maxChars);
    cacheData[chave + '_chunk_' + i] = chunk;
  }

  // Salva no cache por 30 minutos (1800 segundos)
  cache.putAll(cacheData, 1800);
  cache.put(chave + '_metadata', numChunks.toString(), 1800);
}

function lerDoCache(chave) {
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

  try {
    return JSON.parse(jsonString);
  } catch(e) {
    return null;
  }
}

// ⚠️ ATENÇÃO: Configure um Acionador (Trigger) de tempo para rodar esta função a cada 10 ou 15 minutos!
function TRIGGER_AtualizarCache() {
  var dados;
  try { dados = _processarDadosDashboardBruto(); } catch (e) {
    if (e.refNoCabecalhoDashboard) return pgAdiarDashboardPorRef_(e);
    throw e;
  }
  salvarNoCache('DADOS_DASHBOARD', dados);
  Logger.log("Cache atualizado com sucesso. SKUs lidos: " + dados.length);
}

// ======================================================
// 1. ROTEAMENTO E HTML (CORE DO SISTEMA)
// ======================================================

function doGet() {
  return HtmlService.createTemplateFromFile('Main')
      .evaluate()
      .setTitle('Portal da Produção Gráfica')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
} 

function getMatrizSLAPortal() {
  var id = SpreadsheetApp.getActiveSpreadsheet().getId();
  var resposta = Sheets.Spreadsheets.Values.get(id, "'Matriz_SLA'!A1:K", {
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  return resposta.values || [];
}

// ======================================================
// 2. DADOS DO DASHBOARD (INDEX) - COM CACHE ATIVADO
// ======================================================

function getDadosDashboard() {
  var dadosEmCache = lerDoCache('DADOS_DASHBOARD');
  
  if (dadosEmCache) {
    return dadosEmCache;
  }
  
  var dadosFrescos = _processarDadosDashboardBruto();
  salvarNoCache('DADOS_DASHBOARD', dadosFrescos);
  return dadosFrescos;
}

// A FUNÇÃO ORIGINAL RENOMEADA (A "LEITURA TURBO REVISADA")
function _processarDadosDashboardBruto() {
  pgValidarCabecalhosDashboard_();
  var result = [];

  function limparHeader(h) { return h ? String(h).trim() : ""; }
  function personalizacaoSimNao(valor) {
    return String(valor == null ? "" : valor).trim().toUpperCase() === "SIM" ? "Sim" : "Não";
  }
 
  var safeIsoDate = function(valData) {
      if (!valData || valData === "") return "";
      if (valData instanceof Date) return valData.toISOString();
      if (typeof valData === 'string' && valData.includes('-')) return valData;
      return "";
  };

  // --- A. LER ABA PCP PRINCIPAL ---
  var dataPCP = pgLerAbaCache_('PCP');
  if(dataPCP) {
    console.log('[cache] PCP: leitura concluida, ' + dataPCP.length + ' linhas; processando');
    if (dataPCP.length > 1) {
      var headersPCP = dataPCP[0].map(limparHeader);
     
      for (var i = 1; i < dataPCP.length; i++) {
        // TRAVA: IGNORAR ITENS CANCELADOS
        var statusCancelado = false;
        if (dataPCP[i].length > 61 && String(dataPCP[i][61] || "").trim().toUpperCase() === "CANCELADO") statusCancelado = true;
        if (dataPCP[i].length > 72 && String(dataPCP[i][72] || "").trim().toUpperCase() === "CANCELADO") statusCancelado = true;
        if (statusCancelado) continue;
        var obj = {};
       
        for (var j = 0; j < headersPCP.length; j++) {
          var val = dataPCP[i][j];
          if(val !== "" && val !== null) {
            if (val instanceof Date) {
               obj[headersPCP[j]] = val.toISOString();
            } else {
               obj[headersPCP[j]] = val;
            }
          }
        }
        
        // MAPEAMENTO POR ÍNDICE
        obj["GIRO_STATUS_AY"] = String(dataPCP[i][50] || "").trim();
        obj["GIRO_COLETADA_AZ"] = dataPCP[i][51];
        obj["GIRO_TOTAL_BA"] = dataPCP[i][52];
        if(dataPCP[i].length > 1)   obj["JOIN_KEY"] = String(dataPCP[i][1] || "").trim();
        if(dataPCP[i].length > 2)   obj["META_OKR_POS"] = safeIsoDate(dataPCP[i][2]);
        if(dataPCP[i].length > 3)   obj["META_COLETA_D"] = safeIsoDate(dataPCP[i][3]);
        if(dataPCP[i].length > 16)  obj["Chave"] = dataPCP[i][16] || "";                 
        obj['_PG_TP_CHAVE_FORECAST'] = String(dataPCP[i][6] || '').trim(); // G: PROCX K/T
        if(dataPCP[i].length > 46)  obj["META_ARM_POS"] = safeIsoDate(dataPCP[i][46]);   
        if(dataPCP[i].length > 68)  obj["GRAFICA_FINAL"] = String(dataPCP[i][68] || "").trim().toUpperCase(); 
        if(dataPCP[i].length > 74)  obj["SKU_REAL"] = dataPCP[i][74] || "";              
        if(dataPCP[i].length > 88)  obj["CD_FINAL"] = String(dataPCP[i][88] || "").trim().toUpperCase(); 
        if(dataPCP[i].length > 89)  obj["META_PCP_POS"] = safeIsoDate(dataPCP[i][89]);   
        if(dataPCP[i].length > 90)  obj["META_COL_LIMITE"] = safeIsoDate(dataPCP[i][90]); 
        if(dataPCP[i].length > 110) obj["DT_ENTREGA_DG"] = safeIsoDate(dataPCP[i][110]); 
        if(dataPCP[i].length > 111) obj["META_COL_BASE"] = safeIsoDate(dataPCP[i][111]); 
        if(dataPCP[i].length > 134) obj["STATUS_EE"] = String(dataPCP[i][134] || "").trim(); 
        if(dataPCP[i].length > 69) obj["MARCA_FINAL"] = String(dataPCP[i][69] || "").trim().toUpperCase(); 
        if(dataPCP[i].length > 51)  obj["VOLUME_AZ"] = dataPCP[i][51] || 0;          // Coluna AZ (Tiragem Coletada)
        if(dataPCP[i].length > 129) obj["DATA_DZ"] = safeIsoDate(dataPCP[i][129]);   // Coluna DZ (Data Coleta TP)
        if(dataPCP[i].length > 130) obj["DATA_EA"] = safeIsoDate(dataPCP[i][130]);   // Coluna EA (Data Entrega TP)
        
        // PCP: CD_MAPA e a unica origem do CD para filtros, calculos e cruzamentos.
        // Conserva o CD original somente para auditoria, sem usá-lo como fallback.
        obj["CD_DESTINO"] = obj["CD_DESTINO"] ?? obj["CD DESTINO"] ?? "";
        obj["CD_DESTINO_PCP_ORIGINAL"] = obj["CD DESTINO"] || "";
        var cdMapaPCP = String(obj["CD_MAPA"] == null ? "" : obj["CD_MAPA"]).trim().toUpperCase();
        obj["CD DESTINO"] = cdMapaPCP;
        obj["CD_FINAL"] = cdMapaPCP;
        obj["CD"] = cdMapaPCP;
        obj["CK"] = cdMapaPCP; // Alias legado usado no cruzamento com o mapa.

        obj["TIRAGEM"] = obj["TIRAGEM"] || obj["QUANTIDADE"] || 0;
        
        if (!obj["Chave"] || obj["Chave"] === "") {
             var op = obj["Ordem de Produção"] || obj["Ordem"] || obj["OP"] || "";
             var sku = obj["Produto"] || obj["Item"] || obj["SKU"] || "";
             if(op && sku) obj["Chave"] = op + "_" + sku;
        }
        if(obj["Chave"]) {
          obj["CLIENTE_PERSONALIZADO"] = personalizacaoSimNao(dataPCP[i][136]); // EG
          obj["CAPA_PERSONALIZADA"] = personalizacaoSimNao(dataPCP[i][137]); // EH
          obj["_SOURCE"] = "PCP";
          obj['_PG_TP_LINHA'] = i + 1;
          result.push(obj);
        }
      }
    }
  }
 
  // --- B. LER ABA PCP_ACABADORAS ---
  var dataAcab = pgLerAbaCache_('PCP_ACABADORAS', 0, false, true);
  if(dataAcab) {
    console.log('[cache] PCP_ACABADORAS: leitura concluida, ' + dataAcab.length + ' linhas; processando');
    if (dataAcab.length > 1) {
      var headersAcab = dataAcab[0].map(limparHeader);
     
      for (var i = 1; i < dataAcab.length; i++) {
        var statusAcab = String(dataAcab[i][33] || "").trim().toUpperCase();
        if (statusAcab === "CANCELADO") continue;
        var obj = {};
       
        for (var j = 0; j < headersAcab.length; j++) {
          var val = dataAcab[i][j];
          if(val !== "" && val !== null) {
            if (val instanceof Date) {
               obj[headersAcab[j]] = val.toISOString();
            } else {
               obj[headersAcab[j]] = val;
            }
          }
        }
         
        obj["CD_DESTINO"] = obj["CD_DESTINO"] ?? obj["CD DESTINO"] ?? "";
        obj["Chave"] = dataAcab[i][0]; 
        if(dataAcab[i].length > 1)  obj["JOIN_KEY"] = String(dataAcab[i][1] || "").trim(); 
        if(dataAcab[i].length > 2)  obj["META_OKR_POS"] = safeIsoDate(dataAcab[i][2]);    
        if(dataAcab[i].length > 3)  obj["META_COLETA_D"] = safeIsoDate(dataAcab[i][3]);   
        if(dataAcab[i].length > 7)  obj["META_ARM_POS"] = safeIsoDate(dataAcab[i][7]);    
        if(dataAcab[i].length > 29) obj["GRAFICA_FINAL"] = String(dataAcab[i][29] || "").trim().toUpperCase(); 
        if(dataAcab[i].length > 43) obj["TIRAGEM"] = dataAcab[i][43] || 0;               
        if(dataAcab[i].length > 44) obj["CD_FINAL"] = String(dataAcab[i][44] || "").trim().toUpperCase(); 
        if(dataAcab[i].length > 48) obj["META_PCP_POS"] = safeIsoDate(dataAcab[i][48]);   
        if(dataAcab[i].length > 49) obj["META_COL_LIMITE"] = safeIsoDate(dataAcab[i][49]); 
        if(dataAcab[i].length > 72) obj["DT_ENTREGA_DG"] = safeIsoDate(dataAcab[i][72]); 
        if(dataAcab[i].length > 73) obj["META_COL_BASE"] = safeIsoDate(dataAcab[i][73]); 
        if(dataAcab[i].length > 30) obj["MARCA_FINAL"] = String(dataAcab[i][30] || "").trim().toUpperCase(); 
        
        // BLINDAGEM SAS x WAYS NA PCP_ACABADORAS.
        var marcaAcabKey = String(obj["MARCA_FINAL"] || "").trim().toUpperCase();

        function pgCorrigirPrefixoSasWaysAcab_(valor) {
          var chave = String(valor || "").trim();
          if (!chave) return chave;

          if (marcaAcabKey === "SAS" && /^WAYS(?=CD)/i.test(chave)) {
            return "SAS" + chave.substring(4);
          }

          if (marcaAcabKey === "WAYS" && /^SAS(?=CD)/i.test(chave)) {
            return "WAYS" + chave.substring(3);
          }

          return chave;
        }

        obj["JOIN_KEY"] = pgCorrigirPrefixoSasWaysAcab_(obj["JOIN_KEY"]);
        obj["Chave"] = pgCorrigirPrefixoSasWaysAcab_(obj["Chave"]);

        if(obj["Chave"]) {
          obj["CLIENTE_PERSONALIZADO"] = personalizacaoSimNao(dataAcab[i][88]); // CK
          obj["CAPA_PERSONALIZADA"] = personalizacaoSimNao(dataAcab[i][89]); // CL
          obj["_SOURCE"] = "ACABADORA";
          obj['_PG_TP_LINHA'] = i + 1;
          result.push(obj);
        }
      }
    }
  }
  return result;
}

// =========================================================================
// MÓDULOS SECUNDÁRIOS E DADOS DE APOIO
// =========================================================================

function atualizar_PCP_Funil_e_Atrasos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
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

// As duas abas de observações já existem no arquivo PCPs; manter as chaves
// MASTER/SKU e as cinco colunas históricas, sem gravar no workbook da PGBM.
function pgArquivoObservacoesGiro_() {
  if (typeof PG_ARQUIVO_PCPS === 'undefined' || !PG_ARQUIVO_PCPS) {
    throw new Error('ID da planilha PCPs indisponível.');
  }
  return SpreadsheetApp.openById(PG_ARQUIVO_PCPS);
}

// A chave não incorpora tiragem, status, linha ou aba (Principal/Congelados).
// Converte também as chaves antigas SKU com seis campos, retirando só o
// quarto campo quando ele é a tiragem numérica: gráfica|marca|SKU|volume|envio|CD.
function pgGiroNormalizarChave_(tipo, chave) {
  var partes = String(chave == null ? '' : chave).split('|').map(function(v) {
    return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toUpperCase();
  });
  if(tipo === 'SKU' && partes.length === 6 && /^\d[\d.,]*$/.test(partes[3])) {
    partes.splice(3, 1);
  }
  return partes.join('|');
}
function pgGiroTextoComparavel_(texto) {
  return String(texto == null ? '' : texto).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
function pgGiroMomento_(texto) {
  var m=String(texto || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(!m)return NaN;
  return Date.UTC(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+(m[6]||0));
}
function pgGiroEhMesmoEvento_(a,b) {
  var x=pgGiroMomento_(a),y=pgGiroMomento_(b);
  return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=120000;
}

function salvarObsGiro(tipo, chave, obs, contextoStr) {
  var lock = LockService.getScriptLock();
  try {
    if (tipo !== 'MASTER' && tipo !== 'SKU') throw new Error('Tipo de observação inválido.');
    chave = pgGiroNormalizarChave_(tipo, chave);
    obs = String(obs || '').trim();
    if (!chave || !obs) throw new Error('Chave e observação são obrigatórias.');
    lock.waitLock(30000);
    var ss = pgArquivoObservacoesGiro_();
    var nomeAba = tipo === 'SKU' ? 'Obs_Cockpit_sku' : 'Obs_Cockpit';
    var sheet = ss.getSheetByName(nomeAba);
    if (!sheet) {
      sheet = ss.insertSheet(nomeAba);
      sheet.appendRow(['Data e Hora', 'Usuário', 'Chave de Ligação', 'Observação', 'Contexto Físico (JSON)']);
      sheet.getRange('A1:E1').setFontWeight('bold').setBackground('#284081').setFontColor('white');
      sheet.setFrozenRows(1);
    }
    var email = 'Modo Desenvolvedor / Desconhecido';
    try { email = Session.getActiveUser().getEmail() || 'Anônimo'; } catch (e) {}
    var agora = new Date();
    var dataAgora = Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    // Sob lock, impede o mesmo envio duplicado inclusive se a tiragem mudou
    // entre abas. Conserva notas iguais lançadas em dias/horários diferentes.
    var last=sheet.getLastRow(),qtd=Math.min(last,400);
    if(qtd>0){
      var recentes=sheet.getRange(last-qtd+1,1,qtd,4).getDisplayValues();
      for(var i=recentes.length-1;i>=0;i--){
        var row=recentes[i];
        if(pgGiroNormalizarChave_(tipo,row[2])===chave &&
           pgGiroTextoComparavel_(row[1])===pgGiroTextoComparavel_(email) &&
           pgGiroTextoComparavel_(row[3])===pgGiroTextoComparavel_(obs) &&
           pgGiroEhMesmoEvento_(row[0],dataAgora)){
          return {success:true,duplicate:true,data:row[0],user:row[1],obs:row[3],chave:chave,tipo:tipo};
        }
      }
    }
    sheet.appendRow([agora, email, chave, obs, String(contextoStr || '{}')]);
    SpreadsheetApp.flush();
    return {
      success:true,duplicate:false,
      data:Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      user:email, obs:obs, chave:chave, tipo:tipo
    };
  } catch (e) {
    console.error('[Giro] Falha ao salvar observação na PCPs: ' + e);
    return {success:false, error:String(e.message || e)};
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function buscarHistoricoObsGiro() {
  var ss=pgArquivoObservacoesGiro_();
  var result={master:{},sku:{}};
  function lerAba(nomeAba,tipo,destino) {
    var sheet=ss.getSheetByName(nomeAba);
    if(!sheet||sheet.getLastRow()<1)return;
    var linhas=sheet.getRange(1,1,sheet.getLastRow(),4).getDisplayValues();
    // O histórico SKU antigo não possui cabeçalho; preservar a primeira linha.
    var first=linhas.length &&
      /^data(?: e hora)?$/i.test(String(linhas[0][0]||'').trim()) &&
      /^(obs|observação)$/i.test(String(linhas[0][3]||'').trim()) ? 1 : 0;
    var ultimoEvento=Object.create(null);
    // Data, não posição física da linha, determina qual nota é a mais recente.
    // Isso protege históricos importados ou reorganizados entre abas.
    var ordenadas=linhas.slice(first).map(function(row,i){
      return {row:row,indice:i,data:pgGiroMomento_(row[0])};
    }).sort(function(a,b){
      var av=Number.isFinite(a.data)?a.data:-Infinity;
      var bv=Number.isFinite(b.data)?b.data:-Infinity;
      return bv-av||b.indice-a.indice;
    });
    for(var i=0;i<ordenadas.length;i++){
      var row=ordenadas[i].row,chave=pgGiroNormalizarChave_(tipo,row[2]);
      if(!chave||!String(row[3]||'').trim())continue;
      var assinatura=chave+'\u0001'+pgGiroTextoComparavel_(row[1])+'\u0001'+pgGiroTextoComparavel_(row[3]);
      if(ultimoEvento[assinatura] && pgGiroEhMesmoEvento_(ultimoEvento[assinatura],row[0]))continue;
      ultimoEvento[assinatura]=row[0];
      if(!destino[chave])destino[chave]=[];
      destino[chave].push({data:row[0],user:row[1],obs:row[3]});
    }
  }
  lerAba('Obs_Cockpit','MASTER',result.master);
  lerAba('Obs_Cockpit_sku','SKU',result.sku);
  return result;
}

function getDadosCockpit() {
  var data = pgLerAbaCache_('Base_Cockpit_Status', 30, true);
  var result = [];
  
  function safeDate(val) {
    if (!val) return "";
    return String(val).trim();
  }
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][1]) {
      var k = data[i][0];
      var row = { _rowIndex: i + 1 };
      row["CHAVE"] = k;
      row["METADATA"] = {
        grafica: data[i][1], unidade: data[i][2], ciclo: data[i][3], envio: data[i][4],
        caracteristica: data[i][5], segmento: data[i][6], serie: data[i][7],
        tipo: data[i][8], cd: data[i][9]
      };
      
      row["ESTATICAS"] = { status: data[i][10], dtPlan: safeDate(data[i][11]), dtReal: safeDate(data[i][12]), resp: data[i][13], obs: data[i][14] };
      row["CAIXAS"]    = { status: data[i][15], dtPlan: safeDate(data[i][16]), dtReal: safeDate(data[i][17]), resp: data[i][18], obs: data[i][19] };
      row["PAPEL"]     = { status: data[i][20], dtPlan: safeDate(data[i][21]), dtReal: safeDate(data[i][22]), resp: data[i][23], obs: data[i][24] };
      row["ENVIO_EZ"]  = { status: data[i][25], dtPlan: safeDate(data[i][26]), dtReal: safeDate(data[i][27]), resp: data[i][28], obs: data[i][29] };
      
      result.push(row);
    }
  }
  return result;
}

function salvarItemCockpit(form) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Base_Cockpit_Status");
  var row = Number(form.rowIndex);
  var type = form.tipoItem;
 
  var colStart = 0;
  if(type === 'ESTATICAS') colStart = 11;
  if(type === 'CAIXAS') colStart = 16;
  if(type === 'PAPEL') colStart = 21;
  if(type === 'ENVIO_EZ') colStart = 26;
 
  if(colStart === 0 || row < 2) return { success: false, msg: "Erro de mapeamento" };
 
  var dadosSalvar = [[form.status, form.dataPlan, form.dataReal, form.responsavel, form.obs]];
  sheet.getRange(row, colStart, 1, 5).setValues(dadosSalvar);
  return { success: true };
}

function salvarLoteCockpit(form, rowIndexes) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Base_Cockpit_Status");
  if (!sheet) return { success: false, msg: "Aba não encontrada" };
 
  var type = form.tipoItem;
  var colStart = 0;
  if(type === 'ESTATICAS') colStart = 11;
  if(type === 'CAIXAS') colStart = 16;
  if(type === 'PAPEL') colStart = 21;
  if(type === 'ENVIO_EZ') colStart = 26;
 
  if(colStart === 0 || !rowIndexes || rowIndexes.length === 0) {
    return { success: false, msg: "Configuração inválida ou lista vazia" };
  }
  
  function getColLetter(idx) {
    var letter = "";
    while (idx > 0) {
      var temp = (idx - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      idx = (idx - temp - 1) / 26;
    }
    return letter;
  }
  
  var cStatus = getColLetter(colStart);
  var cDtPlan = getColLetter(colStart + 1);
  var cDtReal = getColLetter(colStart + 2);
  var cResp   = getColLetter(colStart + 3);
  var cObs    = getColLetter(colStart + 4);
  var rangesStatus = [], rangesDtPlan = [], rangesDtReal = [], rangesResp = [], rangesObs = [];
  
  rowIndexes.forEach(function(r) {
    rangesStatus.push(cStatus + r);
    rangesDtPlan.push(cDtPlan + r);
    rangesDtReal.push(cDtReal + r);
    rangesResp.push(cResp + r);
    rangesObs.push(cObs + r);
  });
  
  if(form.status) sheet.getRangeList(rangesStatus).setValue(form.status);
  if(form.dataPlan) sheet.getRangeList(rangesDtPlan).setValue(form.dataPlan);
 
  if(form.status === 'CONCLUIDO') {
      if(form.dataReal) sheet.getRangeList(rangesDtReal).setValue(form.dataReal);
      if(form.responsavel) sheet.getRangeList(rangesResp).setValue(form.responsavel);
  }
 
  if(form.obs) sheet.getRangeList(rangesObs).setValue(form.obs);
  return { success: true, count: rowIndexes.length };
}

function getEmailUsuario() {
  try {
    return Session.getActiveUser().getEmail();
  } catch(e) {
    return "Modo Desenvolvedor";
  }
}

// PG_FORECAST_COLETA_SERVER_V1
var PG_FORECAST_COLETA_EDITOR = 'leonardo.pereira@arcoeducacao.com.br';
var PG_FORECAST_COLETA_ABA = 'Forecast_Coleta_Portal';

function getForecastsColetaPortal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PG_FORECAST_COLETA_ABA);
  if (!sheet || sheet.getLastRow() < 2) return {};

  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var out = {};
  vals.forEach(function(r) {
    var chave = String(r[0] || '').trim();
    var dataRaw = r[1];
    var data = dataRaw instanceof Date
      ? Utilities.formatDate(dataRaw, Session.getScriptTimeZone() || 'GMT-3', 'yyyy-MM-dd')
      : String(dataRaw || '').trim();
    var valor = Number(r[2]);
    if (!chave || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !isFinite(valor) || valor < 0) return;
    if (!out[chave]) out[chave] = [];
    out[chave].push({ data: data, valor: valor });
  });
  Object.keys(out).forEach(function(chave) {
    out[chave].sort(function(a, b) { return a.data.localeCompare(b.data); });
  });
  return out;
}

function salvarForecastColetaPortal(payload) {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) {}
  if (email !== PG_FORECAST_COLETA_EDITOR) throw new Error('Usuário não autorizado a alterar o Forecast.');

  payload = payload || {};
  var chave = String(payload.chave || '').trim();
  if (!/^FC_[0-9A-F]{8}$/.test(chave)) throw new Error('Contexto de Forecast inválido.');

  var pontos = Array.isArray(payload.pontos) ? payload.pontos : [];
  if (pontos.length > 500) throw new Error('Quantidade de pontos de Forecast acima do limite.');

  var limpos = [];
  pontos.forEach(function(p) {
    var data = String((p && p.data) || '').trim();
    var valor = Number(p && p.valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida no Forecast: ' + data);
    if (!isFinite(valor) || valor < 0) throw new Error('Valor inválido no Forecast: ' + valor);
    limpos.push({ data: data, valor: Math.round(valor) });
  });
  limpos.sort(function(a, b) { return a.data.localeCompare(b.data); });

  for (var i = 1; i < limpos.length; i++) {
    if (limpos[i].data === limpos[i - 1].data) throw new Error('Data duplicada no Forecast: ' + limpos[i].data);
    if (limpos[i].valor < limpos[i - 1].valor) throw new Error('O Forecast acumulado não pode diminuir entre as datas.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(PG_FORECAST_COLETA_ABA);
    if (!sheet) {
      sheet = ss.insertSheet(PG_FORECAST_COLETA_ABA);
      sheet.getRange(1, 1, 1, 5).setValues([['Chave', 'Data', 'Forecast acumulado', 'Atualizado em', 'Usuário']]);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
      sheet.getRange('B:B').setNumberFormat('@');
      sheet.setFrozenRows(1);
    }

    var existentes = [];
    if (sheet.getLastRow() >= 2) {
      existentes = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
        .filter(function(r) { return String(r[0] || '').trim() !== chave; });
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
    }

    var agora = new Date();
    var novas = limpos.map(function(p) { return [chave, p.data, p.valor, agora, email]; });
    var final = existentes.concat(novas);
    if (final.length) sheet.getRange(2, 1, final.length, 5).setValues(final);
    SpreadsheetApp.flush();
    return { success: true, chave: chave, pontos: limpos };
  } finally {
    lock.releaseLock();
  }
}

function getDadosPreProducao() {
  var data = pgLerAbaCache_('CAL. EDIT.', 40, true, false, true);
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var sku = row[18];
    var status = row[16]; 
   
    if(!sku || sku.toString().trim() === "") continue;
    if(status && status.toString().trim().toUpperCase() === "CANCELADO") continue;
    
    var periodoRaw = row[38] ? String(row[38]).trim() : "";
    var periodoTratado = "(Vazio)";
    
    if (periodoRaw !== "" && periodoRaw !== "-") {
      var partes = periodoRaw.split("/");
      if (partes.length === 3) {
        var mes = parseInt(partes[1], 10);
        var ano = partes[2];
        if (ano.length === 2) ano = "20" + ano; 
        var tri = "";
        if (mes >= 1 && mes <= 3) tri = "T1";
        else if (mes >= 4 && mes <= 6) tri = "T2";
        else if (mes >= 7 && mes <= 9) tri = "T3";
        else if (mes >= 10 && mes <= 12) tri = "T4";
        if (tri !== "") periodoTratado = tri + "." + ano;
        else periodoTratado = periodoRaw.toUpperCase();
      }
      else if (periodoRaw.includes("-") && periodoRaw.split("-").length >= 3) {
        var partesISO = periodoRaw.split(" ")[0].split("T")[0].split("-");
        var anoISO = partesISO[0];
        var mesISO = parseInt(partesISO[1], 10);
        var triISO = "";
        if (mesISO >= 1 && mesISO <= 3) triISO = "T1";
        else if (mesISO >= 4 && mesISO <= 6) triISO = "T2";
        else if (mesISO >= 7 && mesISO <= 9) triISO = "T3";
        else if (mesISO >= 10 && mesISO <= 12) triISO = "T4";
        if (triISO !== "") periodoTratado = triISO + "." + anoISO;
        else periodoTratado = periodoRaw.toUpperCase();
      }
      else {
        periodoTratado = periodoRaw.toUpperCase();
      }
    }
    
    result.push({
      sku: sku,
      descricao: row[19],
      un: row[10],          
      ciclo: row[11],      
      envio: row[12],      
      pr: row[13],          
      indexTiragem: row[14],
      segmento: row[20],    
      serie: row[21],      
      tipo: row[22],        
      paginas: row[24],    
      grafica: row[25],    
      dtEnvioPlan: row[33],
      dtEnvioReal: row[34],
      dtRecBonPlan: row[35],
      dtRecBonReal: row[36],
      dtApvBonPlan: row[38],
      dtApvBonReal: row[39],
      periodo: periodoTratado 
    });
  }
  
  if (result.length === 0) {
    return [{ erro: "Li a aba, mas não achei dados na Coluna S (SKU)." }];
  }
  return result;
}

function getUltimaAtualizacaoPCP() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("PCP");
   
    if (!sheet) return "Aba PCP não encontrada";
    var dataHora = sheet.getRange(2, 66).getDisplayValue(); // Coluna BN
   
    return dataHora && dataHora !== "" ? dataHora : "Data não disponível";
  } catch(e) {
    return "Erro ao ler data";
  }
}

function getDadosQualidade() {
  try {
    var data = pgLerAbaCache_('qualidade_reclamacoes', 19);
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0] && !row[1]) continue;
      
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j] ? String(headers[j]).trim() : "Col" + j;
        var valor = row[j];
        if (valor instanceof Date) {
          obj[header] = valor.toISOString();
        } else {
          obj[header] = valor;
        }
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro Qualidade: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}

function getDadosRNC() {
  try {
    var data = pgLerAbaCache_('bd_rnc', 19);

    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0] && !row[1]) continue;

      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j] ? String(headers[j]).trim() : "Col" + j;
        var valor = row[j];
        if (valor instanceof Date) {
          obj[header] = valor.toISOString();
        } else {
          obj[header] = valor;
        }
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro RNC: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}

function getDadosPPM() {
  try {
    var data = pgLerAbaCache_('ppm_consolidado', 7);
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j] ? String(headers[j]).trim() : "Col" + j;
        obj[header] = row[j];
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro PPM: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}

function registrarAcessoUsuario() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (!email || email === "") email = "Usuário Anônimo / Fora do Domínio";
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Log_Acessos");
    
    if (!sheet) {
      sheet = ss.insertSheet("Log_Acessos");
      sheet.appendRow(["Data e Hora do Acesso", "Email do Usuário"]);
      sheet.getRange("A1:B1").setFontWeight("bold").setBackground("#4f46e5").setFontColor("white");
      sheet.setFrozenRows(1); 
      sheet.setColumnWidth(1, 200); 
      sheet.setColumnWidth(2, 300); 
    }
    
    var agora = new Date();
    sheet.appendRow([agora, email]);
    return true;
  } catch (e) {
    Logger.log("Erro ao registrar acesso invisível: " + e.message);
    return false;
  }
}

function getDadosAlocacao() {
  try {
    var data = pgLerAbaCache_('Alocacao_Reentradas', 30);
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0] && !data[i][1]) continue; 
     
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j] ? String(headers[j]).trim() : "Col" + j;
        var valor = data[i][j];
        obj[header] = (valor instanceof Date) ? valor.toISOString() : valor;
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro Alocação: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}

function getDadosChamados() {
  try {
    var data = pgLerAbaCache_('Chamados');
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      if (!data[i][6] || String(data[i][6]).trim() === "") continue;
     
      var obj = {};
      var rawRow = []; 
     
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j] ? String(headers[j]).trim() : "Col" + j;
        var valor = data[i][j];
        var valorTratado = (valor instanceof Date) ? valor.toISOString() : valor;
       
        obj[header] = valorTratado;
        rawRow.push(valorTratado); 
      }
     
      obj["_linhaBruta"] = rawRow;
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro Chamados: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}

function getDadosCaixas() {
  try {
    var data = pgLerAbaCache_('Caixas', 36);
    if (data.length <= 1) return [];
    var headers = data[0];
   
    var uniqueHeaders = [];
    var headerCounts = {};
    for (var j = 0; j < headers.length; j++) {
        var h = headers[j] ? String(headers[j]).trim() : "Col" + j;
        if (headerCounts[h]) {
            headerCounts[h]++;
            uniqueHeaders.push(h + "_" + headerCounts[h]);
        } else {
            headerCounts[h] = 1;
            uniqueHeaders.push(h);
        }
    }
    
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[5] && !row[9]) continue;
      
      var obj = {};
      for (var j = 0; j < uniqueHeaders.length; j++) {
        var header = uniqueHeaders[j];
        var valor = row[j];
        obj[header] = (valor instanceof Date) ? valor.toISOString() : valor;
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro Caixas: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}

function getDadosMapaSaida() {
  try {
    // AT/AU guardam as datas TP e AX o envio usado pela formula do PCP.
    var data = pgLerAbaCache_(['MAPA DE SAÍDA', 'MAPA DE SAIDA', 'MAPA DE SAIDA '], 53);
    var mapaSKU = {};
    var linhasAcompanhamento = [];
    var hoje = new Date();
    var hojeTP = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'yyyy-MM-dd');
    hoje.setHours(23, 59, 59, 999);

    var texto = function(val) { return String(val == null ? '' : val).trim(); };
    var quantidadeTP = function(val) {
      if (val === '' || val == null || (typeof val !== 'number' && typeof val !== 'string')) return null;
      var numero = val;
      if (typeof numero === 'string') {
        numero = numero.trim();
        if (!numero) return null;
        if (numero.indexOf(',') >= 0) numero = numero.replace(/\./g, '').replace(',', '.');
        else if (/^-?\d{1,3}(\.\d{3})+$/.test(numero)) numero = numero.replace(/\./g, '');
      }
      numero = Number(numero);
      return isFinite(numero) ? numero : null;
    };
    var interpretarDataTP = function(val) {
      if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : Utilities.formatDate(val, 'America/Sao_Paulo', 'yyyy-MM-dd');
      }
      // Os seriais sao datas civis da planilha, nao instantes em UTC.
      if (typeof val === 'number') {
        if (!isFinite(val) || val < 1 || val > 73050) return null;
        return new Date(Date.UTC(1899, 11, 30) + Math.floor(val) * 86400000).toISOString().slice(0, 10);
      }
      var s = texto(val);
      var iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
      var br = iso ? null : /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
      if (!iso && !br) return null;
      var ano = Number(iso ? iso[1] : br[3]);
      var mes = Number(iso ? iso[2] : br[2]);
      var dia = Number(iso ? iso[3] : br[1]);
      var hora = Number((iso ? iso[4] : br[4]) || 0);
      var minuto = Number((iso ? iso[5] : br[5]) || 0);
      var segundo = Number((iso ? iso[6] : br[6]) || 0);
      var calendario = new Date(Date.UTC(ano, mes - 1, dia));
      if (calendario.getUTCFullYear() !== ano || calendario.getUTCMonth() !== mes - 1 ||
          calendario.getUTCDate() !== dia || hora > 23 || minuto > 59 || segundo > 59) return null;
      if (iso && iso[7]) {
        var instante = new Date(s);
        return isNaN(instante.getTime()) ? null : Utilities.formatDate(instante, 'America/Sao_Paulo', 'yyyy-MM-dd');
      }
      return calendario.toISOString().slice(0, 10);
    };
    var datasTPCache = Object.create(null);
    var dataTP = function(val) {
      var chave = val instanceof Date ? 'date:' + val.getTime() : typeof val + ':' + val;
      if (!Object.prototype.hasOwnProperty.call(datasTPCache, chave)) {
        datasTPCache[chave] = interpretarDataTP(val);
      }
      return datasTPCache[chave];
    };

    // Parser e campos antigos continuam iguais para as telas que usam P/AA.
    var processarData = function(val) {
      if (val instanceof Date) return val;
      if (typeof val === 'string' && val.trim() !== '') {
        var d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var skuChave = String(row[41] || "").trim(); // Coluna AP
      if (skuChave && !mapaSKU[skuChave]) mapaSKU[skuChave] = [];
      
      var dtColeta = processarData(row[15]);  // Coluna P
      var dtEntrega = processarData(row[26]); // Coluna AA
      var evento = {
        vol: parseFloat(row[14]) || 0, // Coluna O
        dataColeta: dtColeta ? dtColeta.toISOString().split('T')[0] : null,
        dataEntrega: dtEntrega ? dtEntrega.toISOString().split('T')[0] : null,
        eventoTPVersao: 2,
        chaveMapa: skuChave,
        linhaMapa: i + 1,
        codigoMapa: texto(row[4]), // E: COD MP
        marca: texto(row[0]), // A: UN PCP
        destino: texto(row[1]), // B: CD PCP, destino aceito pela formula
        grafica: texto(row[2]), // C: GRAFICA PCP
        kit: texto(row[10]), // K: COD KIT; nao elimina parcelas do mesmo SKU
        sku: texto(row[11]), // L: SKU
        envioRaw: texto(row[7]), // H: envio original
        envio: texto(row[49]), // AX: envio normalizado pela planilha
        volumeColetado: quantidadeTP(row[39]), // AN: Volume Coletado
        volumeSolicitado: quantidadeTP(row[14]), // O: tiragem antes de Coleta_TP
        dataAgendada: dataTP(row[43]), // AR: Data_Agendada, sem MAXIFS
        coletaTP: dataTP(row[45]), // AT: Coleta_TP
        entregaTP: dataTP(row[46]), // AU: Entrega_TP
        statusTP: texto(row[47]) // AV: Status_TP
      };
      // Resultados 0/vazios de formulas em linhas sem registro nao sao mapas.
      if (evento.codigoMapa || evento.sku || (evento.volumeSolicitado || 0) !== 0 ||
          (evento.volumeColetado || 0) !== 0 || texto(row[13])) {
        var fisica = Object.assign({}, evento, {
          atualizadoOrigem: row[3] instanceof Date ? row[3].toISOString() : texto(row[3]),
          marcaOriginal: texto(row[5]), destinoOriginal: texto(row[6]), graficaOriginal: texto(row[13]),
          descricao: texto(row[12]), tiragemRelacionada: quantidadeTP(row[42]),
          solicitado: quantidadeTP(row[50]), confirmado: quantidadeTP(row[51]), naoGraficos: texto(row[52])
        });
        linhasAcompanhamento.push(fisica);
      }

      // AP nao participa da chave da formula. Agenda tambem recebe essas linhas,
      // sem inclui-las nas listas usadas por Coleta TP/Entrega TP realizadas.
      if (!skuChave) {
        if (evento.volumeSolicitado !== null || evento.marca || evento.sku) {
          if (!mapaSKU.__parcelasAgendaSemAP) mapaSKU.__parcelasAgendaSemAP = [];
          mapaSKU.__parcelasAgendaSemAP.push(evento);
        }
        continue;
      }

      if (dtColeta && dtColeta > hoje) {
        // P futuro segue fora das arrays antigas. A visao por eventos pode usar
        // AT realizado sem mudar a selecao das telas que dependem de P/AA.
        if (evento.coletaTP || evento.dataAgendada) {
          if (!mapaSKU.__eventosTPAdicionais) mapaSKU.__eventosTPAdicionais = [];
          mapaSKU.__eventosTPAdicionais.push(evento);
        }
        continue;
      }

      mapaSKU[skuChave].push(evento);
    }
    // Forecast e parcelas pertencem a mesma geracao do cache. Nunca consultar
    // a planilha durante a abertura do portal para completar este payload.
    mapaSKU.__forecastTP = pgChavesForecastTP_();
    mapaSKU.__agendaTPCompleta = true;
    mapaSKU.__agendaTPGeradoEm = new Date().toISOString();
    mapaSKU.__acompanhamentoMapaVersao = 1;
    mapaSKU.__linhasFisicas = linhasAcompanhamento;
    return mapaSKU;
   
  } catch (e) {
    if (e.cacheLeitura) throw e;
    return { _ERRO_CRITICO: "Erro ao ler Mapa: " + e.toString() };
  }
}

function getDadosInspecaoCDs() {
  try {
    var data = pgLerAbaCache_('qlogs_V4');
    if (data.length <= 1) return [];
    
    var headers = data[0];
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[1] && !row[10]) continue;
      
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j] ? String(headers[j]).trim() : "Col" + j;
        var valor = row[j];
        if (valor instanceof Date) {
          obj[header] = valor.toISOString();
        } else {
          obj[header] = valor;
        }
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    Logger.log("Erro Inspeções CDs: " + e.toString());
    if (e.cacheLeitura) throw e;
    return [];
  }
}
