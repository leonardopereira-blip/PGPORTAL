// Configure o grupo de email do Slack aqui e agende enviarAlertaMapaHoje no Apps Script.
// Nenhum gatilho e instalado por este arquivo. Destinatarios vazios impedem o envio.
var PG_ALERTAS_MAPA_DESTINATARIOS = ['alerta_mapa_de_saida-aaaawkj436jxekpt6ovbrzmgxe@arco.org.slack.com'];
var PG_ALERTAS_MAPA_ANEXAR_CSV = false;
var PG_ALERTAS_MAPA_MAX_GRUPOS_EMAIL = 100;

function pgAMEscapeAlerta_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pgAMCSVAlerta_(linhas) {
  var cabecalho = ['Codigo mapa', 'Linha Mapa', 'SKU', 'Kit', 'Marca', 'Grafica', 'CD destino', 'Envio',
    'Volume no mapa', 'Volume coletado', 'Agendamento', 'Coleta realizada', 'Entrega realizada',
    'Comparacao com PCP', 'Status nao graficos', 'Atualizacao da origem'];
  var valores = linhas.map(function(d) { return [d.codigoMapa, d.linhaMapa, d.sku, d.kit, d.marca, d.grafica,
    d.destino, d.envio, d.volumeMapa, d.volumeColetado, d.dataAgendada, d.coletaTP, d.entregaTP,
    d.statusComparacao, d.statusNaoGrafico, d.atualizadoOrigem]; });
  return '\uFEFF' + [cabecalho].concat(valores).map(function(row) {
    return row.map(function(v) {
      var t = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v);
      if (/^[=+@-]/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    }).join(';');
  }).join('\r\n');
}
function prepararAlertaMapaHoje() {
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var view = getAcompanhamentoMapa(hoje);
  var diaCache = function(v) {
    var d = new Date(v);
    return !v || isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd');
  };
  if (!view.disponivel || diaCache(view.geradoEm) !== hoje) view = atualizarAcompanhamentoMapa(hoje);
  if (!view.disponivel || !view.reportDia) throw new Error('Acompanhamento indisponivel. Atualize os caches e o acompanhamento antes do report.');
  if (diaCache(view.origemMapaGeradoEm) !== hoje || diaCache(view.origemPCPGeradoEm) !== hoje) {
    throw new Error('Os caches do Mapa e do PCP precisam ser atualizados hoje antes do envio. Nenhum email foi enviado.');
  }
  var diario = view.reportDia, resumo = diario.resumoChavesTocadas;
  if (diario.agenda.linhasQuantidadeAusente || diario.coleta.linhasQuantidadeAusente ||
      diario.grupos.some(function(g) { return g.quantidadesPCPConferidas === false; })) {
    throw new Error('Ha movimentos do dia sem quantidades validas para o report. Atualize ou confira os caches. Nenhum email foi enviado.');
  }
  var dataBR = hoje.slice(8) + '/' + hoje.slice(5, 7) + '/' + hoje.slice(0, 4);
  var fmt = function(n) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); };
  var mapas = Object.create(null);
  diario.detalhes.forEach(function(d) { if (d.codigoMapa) mapas[d.codigoMapa] = true; });
  var linhas = [
    'Acompanhamento do Mapa de Saida - ' + dataBR,
    'Agendado para hoje e ainda pendente: ' + fmt(diario.agenda.volume) + ' em ' + diario.agenda.linhas + ' parcelas.',
    'Agenda de hoje: ' + fmt(diario.agenda.volumeComPCP) + ' com PCP; ' + fmt(diario.agenda.volumeSemPCP) +
      ' fora do PCP; ' + fmt(diario.agenda.volumeDivergente) + ' com dados diferentes; ' + fmt(diario.agenda.volumeSemIdentidade) + ' com dados incompletos.',
    'Coletado hoje: ' + fmt(diario.coleta.volume) + ' em ' + diario.coleta.linhas + ' parcelas.',
    'Coleta de hoje: ' + fmt(diario.coleta.volumeComPCP) + ' com PCP; ' + fmt(diario.coleta.volumeSemPCP) +
      ' fora do PCP; ' + fmt(diario.coleta.volumeDivergente) + ' com dados diferentes; ' + fmt(diario.coleta.volumeSemIdentidade) + ' com dados incompletos.',
    'Mapas com eventos no dia: ' + Object.keys(mapas).length + '.',
    'Agenda e coleta sao metricas separadas; seus volumes nao sao somados.',
    '',
    'Nos itens com movimento hoje, situacao acumulada da base atual:',
    'SKU fora do PCP/PCP Acabadora: ' + resumo.ausentesPCP + ' itens.',
    'Marca, grafica, CD ou envio diferentes: ' + resumo.identidadeDivergente + ' itens.',
    'Dados faltando no mapa: ' + resumo.semIdentidade + ' itens.',
    'Coletado a mais: ' + fmt(resumo.volumeAMais) + ' (' + resumo.gruposMais + ' itens).',
    'Coletado a menos: ' + fmt(resumo.volumeAMenos) + ' (' + resumo.gruposMenos + ' itens).',
    '',
    'Itens para conferir (saldo atual dos itens com movimento hoje):'
  ];
  var limite = Math.max(1, Number(PG_ALERTAS_MAPA_MAX_GRUPOS_EMAIL) || 100);
  var problemas = diario.grupos.filter(function(g) {
    return g.statusComparacao !== 'OK' || g.volumeAMais > 0 || g.volumeAMenos > 0;
  });
  var rotulos = { OK: 'Dados iguais ao PCP', SEM_PCP: 'SKU fora do PCP', DADOS_DIFERENTES: 'Dados diferentes',
    SEM_IDENTIDADE: 'Dados faltando no mapa', SEM_MAPA: 'PCP sem mapa' };
  problemas.slice(0, limite).forEach(function(g) {
    linhas.push([g.sku, g.marca, g.grafica, g.destino, g.envio,
      'No mapa=' + fmt(g.volumeMapa), 'Coletado=' + fmt(g.volumeColetado),
      rotulos[g.statusComparacao] || g.statusComparacao, g.statusColeta || 'Sem status no PCP',
      g.diferencas.join(', ')].filter(Boolean).join(' | '));
  });
  if (!diario.grupos.length) linhas.push('Nenhum agendamento pendente ou coleta realizada nas datas do dia.');
  else if (!problemas.length) linhas.push('Nenhuma diferenca encontrada nos itens de hoje.');
  if (problemas.length > limite) linhas.push('Mostrados ' + limite + ' de ' + problemas.length + ' itens. A base completa esta no portal.');
  linhas.push('', 'Dados conferidos em ' + Utilities.formatDate(new Date(view.geradoEm), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + '.');
  var texto = linhas.join('\n');
  return { dia: hoje, subject: '[Portal PG] Mapa de Saida - ' + dataBR,
    body: texto, htmlBody: '<div style="font-family:Arial,sans-serif;white-space:pre-wrap">' + pgAMEscapeAlerta_(texto) + '</div>',
    detalhes: diario.detalhes, resumo: { agenda: diario.agenda, coleta: diario.coleta, chavesTocadas: resumo } };
}
function enviarAlertaMapaHoje() {
  var destinatarios = PG_ALERTAS_MAPA_DESTINATARIOS.map(pgAMTexto_).filter(Boolean);
  if (!destinatarios.length) throw new Error('Configure PG_ALERTAS_MAPA_DESTINATARIOS em AlertasMapa.gs com o email real do grupo. Nenhum email foi enviado.');
  if (destinatarios.some(function(e) { return !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e); })) {
    throw new Error('Destinatario invalido em PG_ALERTAS_MAPA_DESTINATARIOS. Nenhum email foi enviado.');
  }
  var report = prepararAlertaMapaHoje();
  var mensagem = { to: destinatarios.join(','), subject: report.subject, body: report.body, htmlBody: report.htmlBody };
  if (PG_ALERTAS_MAPA_ANEXAR_CSV) mensagem.attachments = [Utilities.newBlob(pgAMCSVAlerta_(report.detalhes),
    'text/csv', 'Mapa_eventos_' + report.dia + '.csv')];
  MailApp.sendEmail(mensagem);
  return { enviado: true, dia: report.dia, destinatarios: destinatarios.length,
    agenda: report.resumo.agenda, coleta: report.resumo.coleta };
}
