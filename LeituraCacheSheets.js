var pgMetadadosCache_;

// Abas lidas de um arquivo separado, ja em valores estaticos. Evita o recalculo
// da planilha principal, que e o que torna a leitura de PCP tao lenta.
var PG_ARQUIVO_PCPS = '1M0NOlNfABSI7BByc7fG8VEF6xDG9Joh5FVJa8IwOO1c';
var PG_FONTES_EXTERNAS = {
  'PCP': PG_ARQUIVO_PCPS,
  'PCP_ACABADORAS': PG_ARQUIVO_PCPS,
  'Base_Cockpit_Status': PG_ARQUIVO_PCPS,
  'Base_OTIF': PG_ARQUIVO_PCPS,
  'Internalização': PG_ARQUIVO_PCPS,
  'MAPA DE SAÍDA': PG_ARQUIVO_PCPS,
  'MAPA DE SAIDA': PG_ARQUIVO_PCPS,
  'MAPA DE SAIDA ': PG_ARQUIVO_PCPS
};

// O snapshot por copia ja contem todas as abas em valores, entao ele tem
// precedencia sobre a fonte externa.
function pgFonteExternaCache_(nomes) {
  if (typeof pgFonteSnapshot_ !== 'undefined' && pgFonteSnapshot_) return null;
  for (var i = 0; i < nomes.length; i++) {
    if (PG_FONTES_EXTERNAS[nomes[i]]) return PG_FONTES_EXTERNAS[nomes[i]];
  }
  return null;
}

// Mostra o que existe no arquivo externo: nomes de abas, tamanho e os tipos da
// primeira linha de dados. Serve para conferir se os nomes batem.
function diagnosticarFonteExterna() {
  var ids = [];
  Object.keys(PG_FONTES_EXTERNAS).forEach(function(nome) {
    if (ids.indexOf(PG_FONTES_EXTERNAS[nome]) < 0) ids.push(PG_FONTES_EXTERNAS[nome]);
  });
  var relatorio = [];
  ids.forEach(function(id) {
    var meta = pgMetadadosPlanilhaCache_(id);
    console.log('[externa] ' + id + ' | fuso ' + meta.fuso);
    meta.abas.forEach(function(aba) {
      var g = aba.gridProperties || {};
      console.log('[externa] aba "' + aba.title + '" ' + g.rowCount + 'x' + g.columnCount);
      relatorio.push({ aba: aba.title, linhas: g.rowCount, colunas: g.columnCount });
    });
    meta.abas.forEach(function(aba) {
      var nome = "'" + aba.title.replace(/'/g, "''") + "'";
      var amostra = Sheets.Spreadsheets.Values.get(id, nome + '!A1:Z2', {
        valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
      }).values || [];
      var linha = amostra[1] || [];
      console.log('[externa] "' + aba.title + '" tipos da linha 2: ' +
        linha.slice(0, 26).map(function(v) { return typeof v; }).join(','));
      console.log('[externa] "' + aba.title + '" linha 2: ' +
        JSON.stringify(linha.slice(0, 26)));
    });
  });
  Object.keys(PG_FONTES_EXTERNAS).forEach(function(nome) {
    console.log('[externa] o portal espera a aba "' + nome + '"');
  });
  return relatorio;
}

function testarCopiaDaPlanilha() {
  var origem = SpreadsheetApp.getActiveSpreadsheet().getId();
  var propriedades = PropertiesService.getUserProperties();
  var chave = 'DIAGNOSTICO_COPIA_' + origem;
  var copiaId = propriedades.getProperty(chave);
  if (!copiaId) {
    console.log('[diagnostico] Criando copia da planilha pelo Drive');
    var arquivo = DriveApp.getFileById(origem);
    var copia = arquivo.makeCopy('DIAGNOSTICO - ' + arquivo.getName());
    copiaId = copia.getId();
    propriedades.setProperty(chave, copiaId);
  }
  console.log('[diagnostico] Copia de teste: https://docs.google.com/spreadsheets/d/' + copiaId + '/edit');
  var inicio = Date.now();
  console.log('[diagnostico] Lendo PCP!B1 da COPIA');
  try {
    var resposta = Sheets.Spreadsheets.Values.get(copiaId, "'PCP'!B1", {
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    var segundos = (Date.now() - inicio) / 1000;
    console.log('[diagnostico] COPIA respondeu em ' + segundos + 's. A fonte do portal permanece a original.');
    return { copiaId: copiaId, segundos: segundos, respondeu: !!resposta };
  } catch (e) {
    throw new Error('A COPIA tambem falhou apos ' + ((Date.now() - inicio) / 1000) +
      's. Ela foi mantida para investigacao. ' + e.message);
  }
}

function diagnosticarCelulaPCP() {
  var meta = pgMetadadosPlanilhaCache_();
  var inicio = Date.now();
  console.log('[diagnostico] Lendo somente PCP!B1 (cabecalho), sem atualizar caches');
  try {
    var resultado = Sheets.Spreadsheets.Values.get(meta.id, "'PCP'!B1", {
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    console.log('[diagnostico] Uma celula respondeu em ' + ((Date.now() - inicio) / 1000) + 's');
    return { segundos: (Date.now() - inicio) / 1000, respondeu: !!resultado };
  } catch (e) {
    throw new Error('A leitura de UMA celula falhou apos ' + ((Date.now() - inicio) / 1000) +
      's. O problema tambem ocorre fora da atualizacao do cache. ' + e.message);
  }
}

function pgMetadadosPlanilhaCache_(idExterno) {
  var id = idExterno;
  if (!id) {
    console.log('[cache API] Obtendo ID da planilha');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Planilha vinculada indisponivel.');
    id = typeof pgFonteSnapshot_ !== 'undefined' && pgFonteSnapshot_ ? pgFonteSnapshot_ : ss.getId();
  }
  if (!pgMetadadosCache_) pgMetadadosCache_ = Object.create(null);
  if (pgMetadadosCache_[id]) return pgMetadadosCache_[id];
  console.log('[cache API] Consultando abas pela API Sheets em ' + id);
  var meta = Sheets.Spreadsheets.get(id, {
    fields: 'properties(timeZone),sheets(properties(title,gridProperties(rowCount,columnCount)))'
  });
  pgMetadadosCache_[id] = {
    id: id,
    externa: !!idExterno,
    fuso: meta.properties.timeZone,
    abas: meta.sheets.map(function(s) { return s.properties; }),
    nomes: meta.sheets.map(function(s) { return s.properties.title; })
  };
  return pgMetadadosCache_[id];
}

function pgColunaCache_(numero) {
  var texto = '';
  while (numero > 0) {
    numero--;
    texto = String.fromCharCode(65 + numero % 26) + texto;
    numero = Math.floor(numero / 26);
  }
  return texto;
}

// A API evita getSheetByName e preserva os tipos usados pelos processadores.
// Os valores vem em blocos e os formatos de data de amostras pequenas, porque
// pedir numberFormat celula a celula custa mais que os proprios dados.
function pgLerAbaCache_(nomes, colunas, exibicao, opcional, calendario) {
  try {
    if (!Array.isArray(nomes)) nomes = [nomes];
    var idExterno = pgFonteExternaCache_(nomes);
    var meta = pgMetadadosPlanilhaCache_(idExterno);
    if (idExterno) console.log('[cache API] ' + nomes[0] + ': lendo do arquivo separado');
    var nome = nomes.filter(function(n) { return meta.nomes.indexOf(n) >= 0; })[0];
    if (!nome && calendario) nome = meta.nomes.filter(function(n) {
      return n.toUpperCase().includes('CAL') && n.toUpperCase().includes('EDIT');
    })[0];
    if (!nome) {
      if (opcional) return null;
      throw new Error('Aba ausente: ' + nomes.join(', ') + '. Cache anterior preservado.');
    }
    var aba = "'" + nome.replace(/'/g, "''") + "'";
    var dimensoes = meta.abas.filter(function(s) { return s.title === nome; })[0].gridProperties;
    if (!dimensoes) throw new Error('Aba sem grade: ' + nome);
    var limiteColunas = Math.min(colunas || dimensoes.columnCount, dimensoes.columnCount);
    var ultimaColuna = pgColunaCache_(limiteColunas);
    var inicioLeitura = Date.now();
    var dados = [];
    // Blocos: pedir a aba inteira de uma vez estoura o servidor em abas grandes.
    var passo = pgBlocoLinhasCache_(limiteColunas);
    for (var inicio = 0; inicio < dimensoes.rowCount; inicio += passo) {
      var fim = Math.min(inicio + passo, dimensoes.rowCount);
      var intervalo = aba + '!A' + (inicio + 1) + ':' + ultimaColuna + fim;
      var inicioBloco = Date.now();
      console.log('[cache API] Lendo ' + intervalo);
      var bloco = pgValoresComRetentativa_(meta.id, intervalo, exibicao).values || [];
      console.log('[cache API] ' + intervalo + ': ' + bloco.length + ' linhas em ' +
        ((Date.now() - inicioBloco) / 1000) + 's');
      if (bloco.length) {
        while (dados.length < inicio) dados.push([]);
        bloco.forEach(function(row) { dados.push(row); });
      }
    }
    console.log('[cache API] ' + nome + ': ' + dados.length + ' linhas em ' +
      ((Date.now() - inicioLeitura) / 1000) + 's');
    if (typeof pgFonteSnapshot_ !== 'undefined' && pgFonteSnapshot_) {
      pgValidarBlocoSnapshot_(dados, nome, 0);
    }
    var largura = dados.reduce(function(max, row) {
      return Math.max(max, row.length);
    }, colunas || 1);
    if (!exibicao && dados.length) {
      // Na fonte externa as datas podem ter vindo como texto OU como serial com
      // formato de data. Os dois casos precisam virar Date, entao rodamos ambos.
      if (meta.externa) pgNormalizarTextoCache_(meta, nome, dados);
      pgConverterDatasCache_(meta, nome, aba, dados, Math.min(largura, limiteColunas));
    }
    dados.forEach(function(row) { while (row.length < largura) row.push(''); });
    return dados;
  } catch (e) {
    var erro = new Error('Leitura pela API Sheets: ' + e.message);
    erro.cacheLeitura = true;
    throw erro;
  }
}

// Mantem a requisicao longe do limite do servidor: ~200 mil celulas por bloco.
function pgBlocoLinhasCache_(colunas) {
  return Math.max(500, Math.min(5000, Math.floor(200000 / Math.max(colunas, 1))));
}

// 'service is currently unavailable' e sobrecarga momentanea: vale repetir.
function pgValoresComRetentativa_(id, intervalo, exibicao) {
  var opcoes = {
    valueRenderOption: exibicao ? 'FORMATTED_VALUE' : 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  };
  for (var tentativa = 1; ; tentativa++) {
    try {
      return Sheets.Spreadsheets.Values.get(id, intervalo, opcoes);
    } catch (e) {
      if (tentativa >= 3 || !/unavailable|internal error|timed? ?out|backend/i.test(e.message)) throw e;
      console.log('[cache API] ' + intervalo + ' falhou (' + e.message +
        '); tentativa ' + (tentativa + 1) + ' em ' + (tentativa * 5) + 's');
      Utilities.sleep(tentativa * 5000);
    }
  }
}

// No arquivo separado os valores podem ter vindo como texto. Reconstroi numeros
// e datas para que os processadores recebam os mesmos tipos da planilha viva.
function pgNormalizarTextoCache_(meta, nome, dados) {
  var convertidas = Object.create(null);
  var numeros = 0, datas = 0;
  var erros = [];
  // #REF! e companhia vieram como texto da planilha de origem. Nao valem como
  // dado: esvaziamos a celula e avisamos, em vez de derrubar todo o cache.
  var ehErro = function(t) {
    return /^(#REF!|#ERROR!|#VALUE!|#DIV\/0!|#N\/A|#NAME\?|#NUM!|#SPILL!|#CALC!|#LOADING!|Loading\.{0,3}|Carregando\.{0,3})$/i.test(t);
  };
  var serial = function(valor) {
    if (!Object.prototype.hasOwnProperty.call(convertidas, valor)) {
      if (valor < 1 || valor > 73050) {
        convertidas[valor] = null;
        return null;
      }
      var local = new Date(Date.UTC(1899, 11, 30) + Math.round(valor * 86400000));
      convertidas[valor] = Utilities.parseDate(local.toISOString().slice(0, 23).replace('T', ' '),
        meta.fuso, 'yyyy-MM-dd HH:mm:ss.SSS').getTime();
    }
    if (convertidas[valor] === null) return null;
    return new Date(convertidas[valor]);
  };
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    for (var j = 0; j < linha.length; j++) {
      var v = linha[j];
      if (typeof v !== 'string') continue;
      var t = v.trim();
      if (!t) continue;
      if (ehErro(t)) {
        if (erros.length < 20) erros.push(pgColunaCache_(j + 1) + (i + 1) + '=' + t);
        erros.total = (erros.total || 0) + 1;
        linha[j] = '';
        continue;
      }
      var iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
      var br = iso ? null : /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
      if (iso || br) {
        var a = iso ? iso[1] : br[3], m = iso ? iso[2] : br[2], d = iso ? iso[3] : br[1];
        var hh = (iso ? iso[4] : br[4]) || '0', mi = (iso ? iso[5] : br[5]) || '0', ss = (iso ? iso[6] : br[6]) || '0';
        var texto = a + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2) + ' ' +
          ('0' + hh).slice(-2) + ':' + ('0' + mi).slice(-2) + ':' + ('0' + ss).slice(-2) + '.000';
        try { linha[j] = Utilities.parseDate(texto, meta.fuso, 'yyyy-MM-dd HH:mm:ss.SSS'); datas++; } catch (e) {}
        continue;
      }
      // Numero em texto: aceita 1.234,56 e 1234.56, mas nao codigos com zero a esquerda.
      if (!/^-?\d[\d.,]*%?$/.test(t) || /^0\d/.test(t)) continue;
      var pct = t.slice(-1) === '%';
      var corpo = pct ? t.slice(0, -1) : t;
      var ultimaVirgula = corpo.lastIndexOf(','), ultimoPonto = corpo.lastIndexOf('.');
      if (ultimaVirgula > ultimoPonto) corpo = corpo.replace(/\./g, '').replace(',', '.');
      else if (ultimaVirgula >= 0 && ultimoPonto < 0) corpo = corpo.replace(',', '.');
      else if (/^-?\d{1,3}(\.\d{3})+$/.test(corpo)) corpo = corpo.replace(/\./g, ''); // milhar pt-BR
      else corpo = corpo.replace(/,/g, '');
      var n = Number(corpo);
      if (!isFinite(n)) continue;
      linha[j] = pct ? n / 100 : n;
      numeros++;
    }
  }
  if (numeros || datas) {
    console.log('[cache API] ' + nome + ': texto convertido em ' + numeros + ' numeros e ' + datas + ' datas');
  }
  if (erros.total) {
    console.warn('[cache API] ' + nome + ': ' + erros.total + ' celula(s) com erro de formula no arquivo separado, ' +
      'tratadas como vazias. Primeiras: ' + erros.join(', ') + '. Corrija na origem e gere o texto de novo.');
  }
  return dados;
}

// Descobre quais colunas sao de data a partir de amostras do inicio, do meio e
// do fim, e converte os seriais dessas colunas em Date no fuso da planilha.
function pgConverterDatasCache_(meta, nome, aba, dados, largura) {
  var temNumeros = dados.some(function(row) {
    return row.some(function(v) { return typeof v === 'number'; });
  });
  if (!temNumeros) return;
  var ultimaColuna = pgColunaCache_(largura);
  var linhas = pgLinhasAmostraDatasCache_(dados, largura);
  if (!linhas.length) return;
  var ranges = linhas.map(function(i) {
    return aba + '!A' + (i + 1) + ':' + ultimaColuna + (i + 1);
  });
  console.log('[cache API] ' + nome + ': formatos em ' + ranges.length + ' linha(s) de amostra');
  var formatos = Sheets.Spreadsheets.get(meta.id, {
    ranges: ranges,
    fields: 'sheets(data(startRow,startColumn,rowData(values(effectiveFormat(numberFormat(type))))))'
  });
  var colunasData = Object.create(null);
  (formatos.sheets || []).forEach(function(sheet) {
    (sheet.data || []).forEach(function(grid) {
      (grid.rowData || []).forEach(function(row) {
        (row.values || []).forEach(function(cell, j) {
          var tipo = ((cell.effectiveFormat || {}).numberFormat || {}).type;
          if (['DATE', 'DATE_TIME', 'TIME'].indexOf(tipo) >= 0) {
            colunasData[(grid.startColumn || 0) + j] = true;
          }
        });
      });
    });
  });
  var indices = Object.keys(colunasData);
  if (!indices.length) return;
  console.log('[cache API] ' + nome + ': ' + indices.length + ' coluna(s) de data');
  var convertidas = Object.create(null);
  dados.forEach(function(row) {
    indices.forEach(function(chave) {
      var coluna = Number(chave);
      var valor = row[coluna];
      if (typeof valor !== 'number') return;
      if (!Object.prototype.hasOwnProperty.call(convertidas, valor)) {
        if (valor < 1 || valor > 73050) {
          convertidas[valor] = null;
          return;
        }
        var local = new Date(Date.UTC(1899, 11, 30) + Math.round(valor * 86400000));
        convertidas[valor] = Utilities.parseDate(local.toISOString().slice(0, 23).replace('T', ' '),
          meta.fuso, 'yyyy-MM-dd HH:mm:ss.SSS').getTime();
      }
      if (convertidas[valor] === null) {
        row[coluna] = '';
        return;
      }
      row[coluna] = new Date(convertidas[valor]);
    });
  });
}

// Escolhe poucas linhas que, juntas, tenham numero em toda coluna numerica.
// Amostrar as primeiras linhas nao serve: se elas estiverem vazias nas colunas
// de prazo, o formato de data dessas colunas passa batido e as datas ficam como
// numero. Guloso: a cada passo entra a linha que cobre mais colunas restantes.
function pgLinhasAmostraDatasCache_(dados, largura, limite) {
  // Uma passada monta, por linha, as colunas numericas; o guloso reusa isso.
  var porLinha = [];
  var faltando = Object.create(null);
  var total = 0;
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var cols = null;
    for (var j = 0; j < linha.length && j < largura; j++) {
      if (typeof linha[j] !== 'number') continue;
      (cols || (cols = [])).push(j);
      if (!faltando[j]) { faltando[j] = true; total++; }
    }
    if (cols) porLinha.push([i, cols]);
  }
  if (!total) return [];
  var escolhidas = [];
  var maximo = limite || 25;
  while (total > 0 && escolhidas.length < maximo) {
    var melhor = -1, melhorCols = null, melhorCobertura = 0;
    for (var k = 0; k < porLinha.length; k++) {
      var cols = porLinha[k][1];
      var cobertura = 0;
      for (var c = 0; c < cols.length; c++) if (faltando[cols[c]]) cobertura++;
      if (cobertura > melhorCobertura) { melhorCobertura = cobertura; melhor = porLinha[k][0]; melhorCols = cols; }
    }
    if (melhor < 0) break;
    escolhidas.push(melhor);
    for (var c = 0; c < melhorCols.length; c++) {
      if (faltando[melhorCols[c]]) { delete faltando[melhorCols[c]]; total--; }
    }
  }
  if (total > 0) {
    console.log('[cache API] ' + total + ' coluna(s) numerica(s) ficaram fora da amostra de formatos');
  }
  return escolhidas.sort(function(a, b) { return a - b; });
}
