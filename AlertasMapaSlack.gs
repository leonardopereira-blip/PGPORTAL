// Teste manual no DEV. O Workflow deve publicar somente em #mapa_diario.
// Configure PG_MAPA_SLACK_WORKFLOW_TESTE_URL nas propriedades do script DEV.
// Nenhum gatilho e criado; o envio de email existente permanece independente.

function pgAMSlackDividirDetalhes_(detalhes, limite) {
  limite = limite || 2500;
  // Cada unidade e um cabecalho, um item inteiro ou as notas finais.
  var unidades = detalhes.split(/\n\n(?=📅 Agendado hoje · pendente(?:\n|$)|🚚 Coletado hoje(?:\n|$)|Agendado hoje considera somente agendamentos ainda pendentes\.)/);
  var blocos = [], atual = '', maiorItem = 0, maiorUnidade = 0, itensAcimaDoLimite = 0;
  unidades.forEach(function(unidade) {
    var tamanho = unidade.length;
    maiorUnidade = Math.max(maiorUnidade, tamanho);
    if (/^(📅 Agendado hoje · pendente|🚚 Coletado hoje)(?:\n|$)/.test(unidade)) {
      maiorItem = Math.max(maiorItem, tamanho);
      if (tamanho > 2500) itensAcimaDoLimite++;
    }
    if (atual && atual.length + 2 + tamanho > limite) {
      blocos.push(atual);
      atual = unidade;
    } else {
      atual += (atual ? '\n\n' : '') + unidade;
    }
  });
  if (atual) blocos.push(atual);
  return { blocos: blocos, maiorItem: maiorItem, maiorUnidade: maiorUnidade, itensAcimaDoLimite: itensAcimaDoLimite };
}

function pgAMSlackLerCampos_(linha, rotulos) {
  var falha = function() { throw new Error('Um item do report tem campos inesperados ou ambiguos. Nenhum detalhe foi omitido; confira o formato antes do teste no Slack.'); };
  if (linha.indexOf(rotulos[0]) !== 0) falha();
  rotulos.slice(1).forEach(function(rotulo) { if (linha.split(rotulo).length !== 2) falha(); });
  var resto = linha.slice(rotulos[0].length), valores = [];
  rotulos.slice(1).forEach(function(rotulo) {
    var posicao = resto.indexOf(rotulo);
    if (posicao < 0) falha();
    valores.push(resto.slice(0, posicao));
    resto = resto.slice(posicao + rotulo.length);
  });
  valores.push(resto);
  if (valores.some(function(valor) { return valor === ''; })) falha();
  return valores;
}

function pgAMSlackCompactarDetalhes_(detalhes, quantidadeEsperada) {
  var linhas = detalhes.split('\n'), titulo = linhas.shift();
  var inicioNotas = linhas.indexOf('Agendado hoje considera somente agendamentos ainda pendentes. Coletado hoje segue a data da coleta realizada.');
  if (inicioNotas < 0) throw new Error('As notas dos detalhes do report mudaram. Confira o formato antes do teste no Slack.');
  var notas = linhas.slice(inicioNotas).join('\n');
  var corpo = linhas.slice(0, inicioNotas).join('\n').replace(/^\n+|\n+$/g, '');
  var originais = corpo === 'Nenhum item com movimento hoje.' ? [] : corpo.split(/\n\n(?=📅 Agendado hoje · pendente(?:\n|$)|🚚 Coletado hoje(?:\n|$))/);
  if (originais.length !== quantidadeEsperada) {
    throw new Error('A contagem de itens dos detalhes difere do report original. Nenhum item foi omitido; confira o formato antes do teste no Slack.');
  }
  var conferencias = { 'Dados iguais ao PCP': 'OK', 'SKU fora do PCP': 'FP', 'Dados diferentes': 'DD',
    'Dados faltando no mapa': 'DM', 'PCP sem mapa': 'PM' };
  var usadosConferencia = Object.create(null), usadosMovimento = Object.create(null);
  var grupos = [], porGrupo = Object.create(null), maiorItemRaw = 0;
  // Valores permanecem literais; aspas distinguem valores que contem o separador.
  var valor = function(v) { return / · |[\r\n";\[\]]/.test(v) ? JSON.stringify(v) : v; };
  originais.forEach(function(original) {
    maiorItemRaw = Math.max(maiorItemRaw, original.length);
    var item = original.split('\n');
    if (item.length < 7 || item.length > 9 || !/^(📅 Agendado hoje · pendente|🚚 Coletado hoje)$/.test(item[0])) {
      throw new Error('Um item dos detalhes tem formato inesperado. Nenhum item foi omitido; confira o report antes do teste no Slack.');
    }
    var local = pgAMSlackLerCampos_(item[1], ['Gráfica: ', ' | Marca: ', ' | CD destino: ']);
    var identidade = pgAMSlackLerCampos_(item[2], ['SKU: ', ' | Kit: ', ' | Envio: ']);
    var mapa = pgAMSlackLerCampos_(item[3], ['Código mapa: ']);
    var datas = pgAMSlackLerCampos_(item[4], ['Agendamento: ', ' | Coleta: ', ' | Entrega: ']);
    var tiragens = pgAMSlackLerCampos_(item[5], ['Tiragem agendada hoje: ', ' | Tiragem coletada hoje: ']);
    var status = pgAMSlackLerCampos_(item[6], ['Conferência: ', ' | Status coleta PCP: ']);
    var movimento = item[0] === '📅 Agendado hoje · pendente' ? 'A' : 'C';
    usadosMovimento[movimento] = true;
    var conferencia = Object.prototype.hasOwnProperty.call(conferencias, status[0]) ? conferencias[status[0]] : null;
    if (conferencia) usadosConferencia[status[0]] = true;
    else conferencia = JSON.stringify(status[0]);
    var linha = identidade.concat(mapa).map(valor).concat([
      '[' + datas.map(valor).join(';') + ']', '[' + tiragens.map(valor).join(';') + ']',
      movimento, conferencia, valor(status[1])
    ]).join(' · ');
    var opcionais = Object.create(null);
    item.slice(7).forEach(function(opcional) {
      var tipo = opcional.indexOf('Classificação no mapa: ') === 0 ? 'classificacao' : opcional.indexOf('Conferir: ') === 0 ? 'conferir' : '';
      if (!tipo || opcionais[tipo]) throw new Error('Os campos opcionais de um item mudaram. Nenhum detalhe foi omitido; confira o report antes do teste no Slack.');
      opcionais[tipo] = true;
      linha += '\n' + opcional;
    });
    var chave = JSON.stringify(local);
    if (!porGrupo[chave]) {
      porGrupo[chave] = { chave: chave, cabecalho: 'Gráfica: ' + valor(local[0]) + ' · Marca: ' + valor(local[1]) + ' · CD destino: ' + valor(local[2]), itens: [] };
      grupos.push(porGrupo[chave]);
    }
    porGrupo[chave].itens.push(linha);
  });
  var legenda = ['Campos: SKU · Kit · Envio · Código mapa · [Agendamento;Coleta;Entrega] · [Tiragem agendada hoje;Tiragem coletada hoje] · Movimento · Conferência · Status coleta PCP.'];
  var movimentos = [];
  if (usadosMovimento.A) movimentos.push('A=📅 Agendado hoje · pendente');
  if (usadosMovimento.C) movimentos.push('C=🚚 Coletado hoje');
  if (movimentos.length) legenda.push('Movimento: ' + movimentos.join('; ') + '.');
  var listaConferencias = Object.keys(usadosConferencia).map(function(texto) { return conferencias[texto] + '=' + texto; });
  if (listaConferencias.length) legenda.push('Conferência: ' + listaConferencias.join('; ') + '. Outros valores entre aspas são literais.');
  var base = titulo + (originais.length ? '\n' + legenda.join('\n') : '\nNenhum item com movimento hoje.');
  var resumo = base, itensResumo = 0, ultimoGrupoResumo = '', resumoEncerrado = false;
  var limiteResumo = 2300 - ('\n\nResumo dos detalhes: ' + quantidadeEsperada + ' de ' + quantidadeEsperada + ' itens.').length;
  var blocos = [], itensPorBloco = [], atual = base, quantidadeAtual = 0, ultimoGrupo = '';
  var maiorItem = 0, maiorUnidade = base.length, itensAcimaDoLimite = 0, quantidadeCompactada = 0;
  var fechar = function() { blocos.push(atual); itensPorBloco.push(quantidadeAtual); };
  grupos.forEach(function(grupo) {
    grupo.itens.forEach(function(item) {
      if (!resumoEncerrado) {
        var acrescimoResumo = (ultimoGrupoResumo === grupo.chave ? '\n' : '\n\n' + grupo.cabecalho + '\n') + item;
        if (resumo.length + acrescimoResumo.length <= limiteResumo) {
          resumo += acrescimoResumo; itensResumo++; ultimoGrupoResumo = grupo.chave;
        } else resumoEncerrado = true;
      }
      var unidade = base + '\n\n' + grupo.cabecalho + '\n' + item;
      maiorItem = Math.max(maiorItem, item.length);
      maiorUnidade = Math.max(maiorUnidade, unidade.length);
      if (unidade.length > 2500) itensAcimaDoLimite++;
      var acrescimo = (ultimoGrupo === grupo.chave ? '\n' : '\n\n' + grupo.cabecalho + '\n') + item;
      if (atual.length + acrescimo.length > 2500 && quantidadeAtual) {
        fechar(); atual = unidade; quantidadeAtual = 1;
      } else {
        atual += acrescimo; quantidadeAtual++;
      }
      ultimoGrupo = grupo.chave;
      quantidadeCompactada++;
    });
  });
  if (atual.length + 2 + notas.length > 2500) {
    fechar(); atual = titulo + '\n\n' + notas; quantidadeAtual = 0;
  } else atual += '\n\n' + notas;
  maiorUnidade = Math.max(maiorUnidade, titulo.length + 2 + notas.length);
  fechar();
  if (quantidadeCompactada !== quantidadeEsperada || itensPorBloco.reduce(function(total, n) { return total + n; }, 0) !== quantidadeEsperada) {
    throw new Error('A compactacao nao preservou a contagem de itens do report. Nenhum teste foi enviado ao Slack.');
  }
  resumo = pgAMSlackDividirDetalhes_(detalhes, limiteResumo).blocos[0];
  itensResumo = (resumo.match(/^(?:📅 Agendado hoje · pendente|🚚 Coletado hoje)$/gm) || []).length;
  resumo += '\n\nResumo dos detalhes: ' + itensResumo + ' de ' + quantidadeEsperada + ' itens.';
  return { resumo: resumo, itensResumo: itensResumo, blocos: blocos, itensPorBloco: itensPorBloco, quantidadeItens: quantidadeCompactada,
    maiorItem: maiorItem, maiorUnidade: maiorUnidade, itensAcimaDoLimite: itensAcimaDoLimite,
    rawCaracteres: detalhes.length, rawBlocos: pgAMSlackDividirDetalhes_(detalhes).blocos.map(function(bloco) { return bloco.length; }),
    maiorItemRaw: maiorItemRaw };
}

function pgAMSlackAnalisarAlerta_(report) {
  var linhas = String(report.body || '').replace(/\r\n/g, '\n').split('\n');
  var resumoInicio = linhas.indexOf('RESUMO RÁPIDO');
  var graficasInicio = linhas.indexOf('TODAS AS GRÁFICAS DO DIA');
  var conferenciaInicio = linhas.indexOf('CONFERÊNCIA DA TIRAGEM DE HOJE');
  var detalhesInicio = -1, rodapeInicio = -1, conferidoEm = '';
  linhas.forEach(function(linha, i) {
    if (/^DETALHES DOS MAPAS DO DIA \(/.test(linha)) detalhesInicio = i;
    var rodape = /^Dados conferidos em (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\.$/.exec(linha);
    if (rodape) { rodapeInicio = i; conferidoEm = rodape[1]; }
  });
  if (!(resumoInicio >= 0 && graficasInicio > resumoInicio && conferenciaInicio > graficasInicio &&
      detalhesInicio > conferenciaInicio && rodapeInicio > detalhesInicio)) {
    throw new Error('O texto do report mudou ou esta incompleto. Confira as secoes antes do teste no Slack.');
  }
  var secao = function(inicio, fim) { return linhas.slice(inicio, fim).join('\n').trim(); };
  var cabecalhoGraficas = 'Gráfica | Mapas | Tiragem agendada hoje | Tiragem coletada hoje | Itens fora do PCP | Itens para conferir | Tiragem a mais | Tiragem a menos';
  if (linhas[graficasInicio + 1] !== cabecalhoGraficas) {
    throw new Error('Os campos das graficas no report mudaram. Confira o formato antes do teste no Slack.');
  }
  var graficas = linhas.slice(graficasInicio + 2, conferenciaInicio).filter(function(linha) {
    return linha.trim() !== '';
  }).map(function(linha) {
    if (linha === 'Nenhum agendamento pendente ou coleta realizada hoje.') return linha;
    var partes = linha.split(' | ');
    // As sete colunas numericas ficam no final, preservando qualquer separador no nome.
    if (partes.length < 8) throw new Error('Uma grafica do report esta incompleta. Nenhum teste foi enviado ao Slack.');
    var valores = partes.slice(-7), nome = partes.slice(0, -7).join(' | ');
    if (!nome || valores.some(function(v) { return !/^\d[\d.]*$/.test(v); })) {
      throw new Error('Uma grafica do report tem campos inesperados. Nenhum teste foi enviado ao Slack.');
    }
    return [
      'Gráfica: ' + nome + ' · Mapas: ' + valores[0],
      'Tiragem agendada hoje: ' + valores[1] + ' · Tiragem coletada hoje: ' + valores[2],
      'Itens fora do PCP: ' + valores[3] + ' · Itens para conferir: ' + valores[4] +
        ' · Tiragem a mais: ' + valores[5] + ' · Tiragem a menos: ' + valores[6]
    ].join('\n');
  }).join('\n\n');
  var conferencia = secao(conferenciaInicio + 1, detalhesInicio);
  if (conferencia.split('\n').length !== 4) {
    throw new Error('A conferencia do report precisa conter as quatro situacoes. Nenhum teste foi enviado ao Slack.');
  }
  var fmt = function(n) { return Math.ceil(Number(n || 0)).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  var indicador = function(movimento) {
    return fmt(movimento.volume) + ' de tiragem · ' + fmt(movimento.mapas) + ' mapas';
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report.dia) || !report.resumo || !report.resumo.agenda || !report.resumo.coleta) {
    throw new Error('Os indicadores do report estao incompletos. Nenhum teste foi enviado ao Slack.');
  }
  if (!Array.isArray(report.detalhes)) throw new Error('A lista de itens do report esta indisponivel para conferir a compactacao.');
  return { detalhes: pgAMSlackCompactarDetalhes_(secao(detalhesInicio, rodapeInicio), report.detalhes.length), campos: {
    data: report.dia.slice(8) + '/' + report.dia.slice(5, 7) + '/' + report.dia.slice(0, 4),
    agendado_hoje: indicador(report.resumo.agenda),
    coletado_hoje: indicador(report.resumo.coleta),
    resumo: secao(resumoInicio + 1, graficasInicio),
    conferencia: conferencia,
    graficas: graficas,
    conferido_em: conferidoEm
  } };
}

function prepararAlertaMapaSlackHoje() {
  var analise = pgAMSlackAnalisarAlerta_(prepararAlertaMapaHoje()), divisao = analise.detalhes;
  // Uma unica resposta curta; o fim e cortado entre itens completos, com aviso visivel.
  // Os demais campos ficam vazios somente por compatibilidade com o Workflow.
  var payload = analise.campos;
  payload.detalhes = divisao.resumo;
  for (var i = 1; i < 13; i++) payload['detalhes_' + ('0' + (i + 1)).slice(-2)] = '';
  return payload;
}

function enviarAlertaMapaSlackTeste() {
  var url = String(PropertiesService.getScriptProperties().getProperty('PG_MAPA_SLACK_WORKFLOW_TESTE_URL') || '').trim();
  if (!/^https:\/\/hooks\.slack\.com\/triggers\/[^\s?#]+$/.test(url)) {
    throw new Error('Configure PG_MAPA_SLACK_WORKFLOW_TESTE_URL com o webhook do Workflow de teste no script DEV.');
  }
  var payload = prepararAlertaMapaSlackHoje();
  // Resumo principal e uma unica resposta curta com os primeiros itens completos.
  Object.keys(payload).forEach(function(campo) {
    if (typeof payload[campo] !== 'string' || payload[campo].length > 2500) {
      throw new Error('O campo ' + campo + ' precisa ser texto com ate 2.500 caracteres. Nenhum texto foi truncado ou enviado ao Slack.');
    }
  });
  // Reserva 2.000 caracteres por mensagem para os titulos fixos do Workflow.
  // O limite geral de uma mensagem no Slack e 40.000 caracteres.
  var camposResumo = ['data', 'agendado_hoje', 'coletado_hoje', 'resumo', 'conferencia', 'graficas', 'conferido_em'];
  var tamanhoResumo = camposResumo.reduce(function(total, campo) {
    return total + payload[campo].length;
  }, 0);
  if (tamanhoResumo > 38000) {
    throw new Error('O resumo excede o orcamento de 38.000 caracteres da mensagem principal. Ajuste o Workflow antes de enviar; nenhum texto foi truncado.');
  }
  var resposta;
  try {
    resposta = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json; charset=utf-8', payload: JSON.stringify(payload),
      muteHttpExceptions: true, followRedirects: false
    });
  } catch (erro) {
    // A excecao original pode conter a URL; nunca a propague ou registre.
    throw new Error('Falha de conexao ao chamar o Workflow de teste no Slack. Confira a configuracao do script DEV.');
  }
  var status = resposta.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('O webhook do Workflow de teste no Slack retornou HTTP ' + status + '.');
  }
  var confirmacao;
  try { confirmacao = JSON.parse(resposta.getContentText()); } catch (erroResposta) { confirmacao = null; }
  if (!confirmacao || confirmacao.ok !== true) {
    throw new Error('O Workflow de teste no Slack nao confirmou o recebimento (HTTP ' + status + ').');
  }
  return { aceito: true, data: payload.data, statusHTTP: status };
}

// Entrada manual combinada para o DEV; nao substitui nem agenda o envio atual.
function enviarAlertaMapaEmailESlackTeste() {
  var email = enviarAlertaMapaHoje();
  var slack;
  try {
    slack = enviarAlertaMapaSlackTeste();
  } catch (erroSlack) {
    throw new Error('O email ja foi enviado, mas o teste no Slack falhou. Nao repita o envio combinado; ' +
      'execute somente enviarAlertaMapaSlackTeste() para tentar o Slack novamente. Motivo: ' +
      String(erroSlack && erroSlack.message || 'Falha no teste do Slack.'));
  }
  return { email: email, slack: slack };
}

// Diagnostico manual: prepara uma vez e registra somente comprimentos, sem enviar.
function diagnosticarTamanhoAlertaMapaSlack() {
  // Analisa antes dos limites de envio: excesso de capacidade tambem precisa ser medido.
  var analise = pgAMSlackAnalisarAlerta_(prepararAlertaMapaHoje()), divisao = analise.detalhes, tamanhosPorCampo = {};
  Object.keys(analise.campos).forEach(function(campo) { tamanhosPorCampo[campo] = analise.campos[campo].length; });
  for (var i = 0; i < 13; i++) {
    var campo = i === 0 ? 'detalhes' : 'detalhes_' + ('0' + (i + 1)).slice(-2);
    tamanhosPorCampo[campo] = i === 0 ? divisao.resumo.length : 0;
  }
  var diagnostico = { tamanhosPorCampo: tamanhosPorCampo, detalhesOriginais: {
    caracteres: divisao.rawCaracteres, itens: divisao.quantidadeItens, quantidadeBlocos2500: divisao.rawBlocos.length,
    tamanhosBlocos: divisao.rawBlocos, maiorItem: divisao.maiorItemRaw
  }, blocosDetalhes2500: {
    caracteres: divisao.blocos.reduce(function(total, bloco) { return total + bloco.length; }, 0),
    quantidade: divisao.blocos.length, tamanhos: divisao.blocos.map(function(bloco) { return bloco.length; }),
    itens: divisao.quantidadeItens, itensPorBloco: divisao.itensPorBloco, maiorItem: divisao.maiorItem,
    maiorUnidadeComCabecalho: divisao.maiorUnidade, itensAcimaDoLimite: divisao.itensAcimaDoLimite,
    capacidadeWorkflow: 1, itensNaResposta: divisao.itensResumo, respostaCaracteres: divisao.resumo.length
  } };
  console.log(JSON.stringify(diagnostico));
  return diagnostico;
}
