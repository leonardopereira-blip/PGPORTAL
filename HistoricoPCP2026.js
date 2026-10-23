// Historico isolado: nao participa do PCP atual nem dos caches do dashboard.
var PG_HISTORICO_PCP2026_ = {
  id: '1O2TCumUOJlU9GZRZ89lU1zVSqB9L3Do_Up6gBQx-6Dg',
  aba: 'Consolidado',
  cache: 'PG_HISTORICO_PCP2026_V1',
  ttl: 1800,
  campos: [
    { coluna: 'B', nome: 'grafica', cabecalho: 'GRÁFICA' },
    { coluna: 'C', nome: 'unidade', cabecalho: 'UNIDADE' },
    { coluna: 'E', nome: 'envio', cabecalho: 'ENVIO' },
    { coluna: 'J', nome: 'serie', cabecalho: 'SÉRIE' },
    { coluna: 'X', nome: 'cd', cabecalho: 'CD DESTINO' },
    { coluna: 'AL', nome: 'tiragem', cabecalho: 'TIRAGEM OFICIAL (CALIBRADA)' },
    { coluna: 'BH', nome: 'dataReal', cabecalho: 'Coleta/Internalização de estoque final real.' }
  ]
};

function getDadosHistoricoPCP2026() {
  var cache = pgLerCacheHistorico2026_();
  if (cache) return cache;
  // Erros da fonte propagam para o cliente e nunca publicam um historico vazio.
  var dados = pgLerHistoricoPCP2026_();
  pgSalvarCacheHistorico2026_(dados);
  return dados;
}

function pgLerHistoricoPCP2026_() {
  var config = PG_HISTORICO_PCP2026_;
  var meta = Sheets.Spreadsheets.get(config.id, {
    fields: 'sheets(properties(title,gridProperties(rowCount)))'
  });
  var abas = (meta.sheets || []).filter(function(aba) {
    return aba.properties && aba.properties.title === config.aba;
  });
  if (!abas.length) throw new Error('Historico PCP 2026: aba Consolidado ausente.');
  var grade = abas[0].properties.gridProperties || {};
  var ultimaLinha = Number(grade.rowCount);
  if (!Number.isInteger(ultimaLinha) || ultimaLinha < 2) {
    throw new Error('Historico PCP 2026: grade da aba Consolidado invalida.');
  }
  // Sete colunas, em uma chamada. Cada intervalo comeca no cabecalho (linha 2),
  // preservando a posicao das linhas mesmo quando BH termina antes das demais.
  var ranges = config.campos.map(function(campo) {
    return "'Consolidado'!" + campo.coluna + '2:' + campo.coluna + ultimaLinha;
  });
  var resposta = Sheets.Spreadsheets.Values.batchGet(config.id, {
    ranges: ranges,
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  var blocos = resposta.valueRanges || [];
  if (blocos.length !== config.campos.length) {
    throw new Error('Historico PCP 2026: resposta incompleta da planilha.');
  }
  var colunas = {};
  var numeroLinhas = 0;
  config.campos.forEach(function(campo, indice) {
    var valores = blocos[indice].values || [];
    var cabecalho = valores[0] && valores[0][0];
    if (pgChaveCabecalhoHistorico2026_(cabecalho) !== pgChaveCabecalhoHistorico2026_(campo.cabecalho)) {
      throw new Error('Historico PCP 2026: cabecalho inesperado em ' + campo.coluna +
        '2; esperado ' + campo.cabecalho + '.');
    }
    colunas[campo.nome] = valores;
    numeroLinhas = Math.max(numeroLinhas, valores.length);
  });
  function valor(nome, linha) {
    var celulas = colunas[nome][linha];
    return celulas && celulas.length ? celulas[0] : '';
  }
  var rows = [];
  for (var i = 1; i < numeroLinhas; i++) {
    var tiragem = pgNumeroHistorico2026_(valor('tiragem', i));
    if (tiragem === null || tiragem < 0) {
      throw new Error('Historico PCP 2026: tiragem invalida em AL' + (i + 2) + '.');
    }
    // Linhas sem volume nao alteram nem a curva nem o denominador.
    if (tiragem === 0) continue;
    rows.push({
      grafica: pgTextoHistorico2026_(valor('grafica', i)).toUpperCase(),
      unidade: pgTextoHistorico2026_(valor('unidade', i)).toUpperCase(),
      envio: pgEnvioHistorico2026_(valor('envio', i)),
      serie: pgTextoHistorico2026_(valor('serie', i)),
      cd: pgTextoHistorico2026_(valor('cd', i)),
      tiragem: tiragem,
      // BH e exclusivamente real. Nao consultar BG, baseline ou datas previstas.
      // O ano original e mantido: o ciclo 2026 tem producao/coleta em 2025.
      dataReal: pgDataHistorico2026_(valor('dataReal', i))
    });
  }
  return { ciclo: 2026, atualizadoEm: new Date().toISOString(), rows: rows };
}

function pgTextoHistorico2026_(valor) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
}

function pgChaveCabecalhoHistorico2026_(valor) {
  return pgTextoHistorico2026_(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function pgEnvioHistorico2026_(valor) {
  var texto = pgTextoHistorico2026_(valor).toUpperCase();
  var numero = texto.match(/^V\s*0*(\d+)(?:\s*-\s*(?:20)?26)?$/);
  return numero ? 'V' + Number(numero[1]) : texto;
}

function pgNumeroHistorico2026_(valor) {
  if (valor === '' || valor == null) return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;
  var texto = valor.replace(/[\s\u00a0]/g, '');
  if (!texto) return 0;
  // O servico fornece numeros; aceitar tambem textos brasileiros sem arredondar.
  if (texto.indexOf(',') >= 0) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(texto)) return null;
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, '');
  } else if (!/^[+-]?\d+(?:\.\d+)?$/.test(texto)) return null;
  var numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function pgDataHistorico2026_(valor) {
  if (valor === '' || valor == null) return '';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 1 || valor > 120000) return '';
    // Datas do Sheets sao dias locais desde 30/12/1899. A parte inteira evita
    // deslocar o dia com o fuso do servidor ou com horarios presentes na celula.
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000)
      .toISOString().slice(0, 10);
  }
  var texto = pgTextoHistorico2026_(valor);
  var partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][0-9:.+Z-]+)?$/i);
  if (partes) return pgDataCalendarioHistorico2026_(+partes[1], +partes[2], +partes[3]);
  partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  return partes ? pgDataCalendarioHistorico2026_(+partes[3], +partes[2], +partes[1]) : '';
}

function pgDataCalendarioHistorico2026_(ano, mes, dia) {
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  var data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return '';
  return data.toISOString().slice(0, 10);
}

function pgLerCacheHistorico2026_() {
  try {
    var cache = CacheService.getScriptCache();
    var chave = PG_HISTORICO_PCP2026_.cache;
    var manifesto = JSON.parse(cache.get(chave + ':manifesto') || 'null');
    if (!manifesto || !/^[a-z0-9]+$/.test(manifesto.geracao) ||
        !Number.isInteger(manifesto.partes) || manifesto.partes < 1 || manifesto.partes > 200) return null;
    var chaves = [];
    for (var i = 0; i < manifesto.partes; i++) chaves.push(chave + ':' + manifesto.geracao + ':' + i);
    var partes = cache.getAll(chaves);
    var texto = '';
    for (var j = 0; j < chaves.length; j++) {
      if (!Object.prototype.hasOwnProperty.call(partes, chaves[j])) return null;
      texto += partes[chaves[j]];
    }
    var dados = JSON.parse(texto);
    return dados && dados.ciclo === 2026 && Array.isArray(dados.rows) ? dados : null;
  } catch (e) {
    // Cache e opcional; uma expulsao ou indisponibilidade pede uma nova leitura.
    return null;
  }
}

function pgSalvarCacheHistorico2026_(dados) {
  try {
    var config = PG_HISTORICO_PCP2026_;
    var cache = CacheService.getScriptCache();
    var texto = JSON.stringify(dados);
    var tamanho = 40000;
    var quantidade = Math.ceil(texto.length / tamanho);
    if (quantidade > 200) return;
    var geracao = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    var partes = {};
    for (var i = 0; i < quantidade; i++) {
      partes[config.cache + ':' + geracao + ':' + i] = texto.slice(i * tamanho, (i + 1) * tamanho);
    }
    cache.putAll(partes, config.ttl);
    // Manifesto publicado por ultimo: leitores nunca combinam geracoes distintas.
    cache.put(config.cache + ':manifesto', JSON.stringify({ geracao: geracao, partes: quantidade }), config.ttl);
  } catch (e) {
    console.warn('[historico PCP 2026] Cache indisponivel; leitura da fonte preservada.');
  }
}
