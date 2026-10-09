// Teste manual no DEV. O Workflow deve publicar somente em #mapa_diario.
// Configure PG_MAPA_SLACK_WORKFLOW_TESTE_URL nas propriedades do script DEV.
// Nenhum gatilho e criado; o envio de email existente permanece independente.

function prepararAlertaMapaSlackHoje() {
  var report = prepararAlertaMapaHoje();
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
  var camposGrafica = cabecalhoGraficas.split(' | ').slice(1);
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
    return ['Gráfica: ' + nome].concat(camposGrafica.map(function(campo, i) {
      return campo + ': ' + valores[i];
    })).join('\n');
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
  // Contrato plano: somente estes oito campos de texto, sem HTML ou recorte de detalhes.
  return {
    data: report.dia.slice(8) + '/' + report.dia.slice(5, 7) + '/' + report.dia.slice(0, 4),
    agendado_hoje: indicador(report.resumo.agenda),
    coletado_hoje: indicador(report.resumo.coleta),
    resumo: secao(resumoInicio + 1, graficasInicio),
    conferencia: conferencia,
    graficas: graficas,
    detalhes: secao(detalhesInicio, rodapeInicio),
    conferido_em: conferidoEm
  };
}

function enviarAlertaMapaSlackTeste() {
  var url = String(PropertiesService.getScriptProperties().getProperty('PG_MAPA_SLACK_WORKFLOW_TESTE_URL') || '').trim();
  if (!/^https:\/\/hooks\.slack\.com\/triggers\/[^\s?#]+$/.test(url)) {
    throw new Error('Configure PG_MAPA_SLACK_WORKFLOW_TESTE_URL com o webhook do Workflow de teste no script DEV.');
  }
  var payload = prepararAlertaMapaSlackHoje();
  // Duas etapas: resumo principal e detalhes em resposta na conversa.
  // Reserva 2.000 caracteres por mensagem para os titulos fixos do Workflow.
  // O limite geral de uma mensagem no Slack e 40.000 caracteres.
  var tamanhoResumo = Object.keys(payload).filter(function(campo) { return campo !== 'detalhes'; }).reduce(function(total, campo) {
    return total + payload[campo].length;
  }, 0);
  if (tamanhoResumo > 38000 || payload.detalhes.length > 38000) {
    throw new Error('O report completo excede o orcamento de 38.000 caracteres de uma etapa do Workflow. Ajuste o Workflow antes de enviar; nenhum texto foi truncado.');
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
