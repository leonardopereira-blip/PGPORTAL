// Configure o grupo de email do Slack aqui e agende enviarAlertaMapaHoje no Apps Script.
// Nenhum gatilho e instalado por este arquivo. Destinatarios vazios impedem o envio.
var PG_ALERTAS_MAPA_DESTINATARIOS = ['alerta_mapa_de_saida-aaaawkj436jxekpt6ovbrzmgxe@arco.org.slack.com'];
var PG_ALERTAS_MAPA_ANEXAR_CSV = false;
// Paleta centralizada para a apresentacao do email.
var PG_ALERTAS_MAPA_CORES = { navy: '#0C2340', azul: '#418EDE', laranja: '#FA4616',
  texto: '#0C2340', secundario: '#526477', fundo: '#F3F7FC', linha: '#D9E8F7', zebra: '#F0F6FC', branco: '#FFFFFF' };

function pgAMEscapeAlerta_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pgAMCSVAlerta_(linhas) {
  var cabecalho = ['Codigo mapa', 'Linha Mapa', 'SKU', 'Kit', 'Marca', 'Grafica', 'CD destino', 'Envio',
    'Tiragem no mapa', 'Tiragem coletada', 'Agendamento', 'Coleta realizada', 'Entrega realizada',
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
// O acompanhamento do portal continua geral. O alerta seleciona apenas mapas
// pendentes de hoje em diante e coletas efetivamente realizadas hoje.
function pgAMRecortarAlerta_(geral, dia) {
  var diario = pgAMReportDia_(geral, dia), ids = Object.create(null);
  diario.detalhes = geral.detalhes.filter(function(d) {
    var coleta = pgAMData_(d.coletaTP), agenda = pgAMData_(d.dataAgendada);
    var pendente = agenda && agenda >= dia && !(coleta && coleta <= dia);
    var realizado = coleta === dia && ((d.volumeColetado || 0) > 0 || d.volumeColetado === null);
    if (pendente || realizado) { ids[d.grupoId] = true; return true; }
    return false;
  });
  diario.grupos = geral.grupos.filter(function(g) { return ids[g.id]; });
  diario.resumoChavesTocadas = pgAMResumo_(diario.grupos, diario.detalhes);
  return diario;
}

function pgAMApresentarAlerta_(diario, dataBR, geradoEm) {
  var c = PG_ALERTAS_MAPA_CORES, esc = pgAMEscapeAlerta_;
  var fmt = function(n) { return Math.ceil(Number(n || 0)).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  var texto = function(v) { return String(v == null ? '' : v).trim(); };
  var data = function(v) { var s = texto(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s || '—'; };
  var rotulos = { OK: 'Dados iguais ao PCP', SEM_PCP: 'SKU fora do PCP', DADOS_DIFERENTES: 'Dados diferentes', SEM_IDENTIDADE: 'Dados faltando no mapa', SEM_MAPA: 'PCP sem mapa' };
  var grupos = Object.create(null), parcelas = Object.create(null), graficaGrupo = Object.create(null);
  var graficas = Object.create(null), mapas = Object.create(null), saldosVistos = Object.create(null);
  diario.grupos.forEach(function(g) { grupos[g.id] = g; });
  diario.detalhes.forEach(function(d) {
    if (!parcelas[d.grupoId]) parcelas[d.grupoId] = [];
    parcelas[d.grupoId].push(d);
    if (d.codigoMapa) mapas[d.codigoMapa] = true;
  });
  diario.grupos.forEach(function(g) {
    var nome = texto(g.grafica), originais = [];
    if (!nome) (parcelas[g.id] || []).forEach(function(d) {
      var original = texto(d.grafica || d.graficaOriginal);
      if (original && originais.indexOf(original) < 0) originais.push(original);
    });
    graficaGrupo[g.id] = nome || (originais.length === 1 ? originais[0] : 'Gráfica não informada');
  });
  var obterGrafica = function(nome) {
    if (!graficas[nome]) graficas[nome] = { nome: nome, mapas: Object.create(null), agenda: 0, coleta: 0, foraPCP: 0, conferir: 0, mais: 0, menos: 0 };
    return graficas[nome];
  };
  // Mesmo criterio diario do backend; os dois tipos de movimento permanecem separados.
  var movimento = function(d) {
    var coletadoAteDia = pgAMData_(d.coletaTP) && d.coletaTP <= diario.dia;
    return { agenda: d.dataAgendada === diario.dia && !coletadoAteDia,
      coleta: d.coletaTP === diario.dia && ((d.volumeColetado || 0) > 0 || d.volumeColetado === null) };
  };
  diario.detalhes.forEach(function(d) {
    var nome = graficaGrupo[d.grupoId] || texto(d.grafica || d.graficaOriginal) || 'Gráfica não informada';
    var g = obterGrafica(nome), m = movimento(d);
    if (d.codigoMapa) g.mapas[d.codigoMapa] = true;
    if (m.agenda) g.agenda += Number(d.volumeMapa || 0);
    if (m.coleta) g.coleta += Number(d.volumeColetado || 0);
  });
  // Saldos atuais uma vez por grupo, mesmo quando ha varias parcelas no dia.
  diario.grupos.forEach(function(g) {
    if (saldosVistos[g.id]) return;
    saldosVistos[g.id] = true;
    var r = obterGrafica(graficaGrupo[g.id] || 'Gráfica não informada');
    if (g.statusComparacao === 'SEM_PCP') r.foraPCP++;
    if (g.statusComparacao === 'DADOS_DIFERENTES' || g.statusComparacao === 'SEM_IDENTIDADE') r.conferir++;
    r.mais += Number(g.volumeAMais || 0); r.menos += Number(g.volumeAMenos || 0);
  });
  var lista = Object.keys(graficas).map(function(k) { return graficas[k]; }).sort(function(a,b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  var resumo = diario.resumoChavesTocadas, agenda = diario.agenda, coleta = diario.coleta;
  var conferir = Number(resumo.identidadeDivergente || 0) + Number(resumo.semIdentidade || 0);
  var categorias = [
    ['Com PCP',agenda.volumeComPCP,coleta.volumeComPCP],
    ['SKU fora do PCP',agenda.volumeSemPCP,coleta.volumeSemPCP],
    ['Dados diferentes',agenda.volumeDivergente,coleta.volumeDivergente],
    ['Dados faltando no mapa',agenda.volumeSemIdentidade,coleta.volumeSemIdentidade]
  ];
  var nota = 'Conferência: mapas pendentes agendados de hoje em diante e coletas realizadas hoje. Tiragem a mais e a menos segue o status atual desses itens no PCP.';
  var conferido = Utilities.formatDate(new Date(geradoEm), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  var resumoLinhas = [
    '📅 Agendado para hoje: ' + fmt(agenda.mapas) + ' mapas · Tiragem: ' + fmt(agenda.volume) + '.',
    '🚚 Coletado hoje: ' + fmt(coleta.mapas) + ' mapas · Tiragem: ' + fmt(coleta.volume) + '.',
    '🗺️ Mapas de hoje em diante para conferir: ' + fmt(Object.keys(mapas).length) + ' | Gráficas: ' + fmt(lista.length) + '.',
    '🔎 Itens fora do PCP: ' + fmt(resumo.ausentesPCP) + ' | Itens para conferir dados: ' + fmt(conferir) + '.',
    '➕ Tiragem a mais: ' + fmt(resumo.volumeAMais) + ' (' + fmt(resumo.gruposMais) + ' itens).',
    '➖ Tiragem a menos: ' + fmt(resumo.volumeAMenos) + ' (' + fmt(resumo.gruposMenos) + ' itens).'
  ];
  var plain = ['🗺️ MAPA DE SAÍDA | ' + dataBR, '', '📅 TIRAGEM AGENDADA HOJE: ' + fmt(agenda.volume),
    '🚚 TIRAGEM COLETADA HOJE: ' + fmt(coleta.volume), '', 'RESUMO RÁPIDO'].concat(resumoLinhas, [nota, '', 'TODAS AS GRÁFICAS DO DIA',
    'Gráfica | Mapas | Tiragem agendada hoje | Tiragem coletada hoje | Itens fora do PCP | Itens para conferir | Tiragem a mais | Tiragem a menos']);
  lista.forEach(function(g) { plain.push([g.nome, fmt(Object.keys(g.mapas).length), fmt(g.agenda), fmt(g.coleta), fmt(g.foraPCP), fmt(g.conferir), fmt(g.mais), fmt(g.menos)].join(' | ')); });
  if (!lista.length) plain.push('Nenhum agendamento pendente ou coleta realizada hoje.');
  plain.push('', 'CONFERÊNCIA DA TIRAGEM DE HOJE');
  categorias.forEach(function(row) { plain.push(row[0] + ': tiragem agendada ' + fmt(row[1]) + ' | tiragem coletada ' + fmt(row[2])); });
  plain.push('', 'DETALHES DOS MAPAS PARA CONFERIR (' + fmt(Object.keys(mapas).length) + ' mapas)');
  var ordenadas = diario.detalhes.slice().sort(function(a,b) {
    return (graficaGrupo[a.grupoId] || '').localeCompare(graficaGrupo[b.grupoId] || '', 'pt-BR') || texto(a.sku).localeCompare(texto(b.sku), 'pt-BR') || Number(a.linhaMapa || 0) - Number(b.linhaMapa || 0);
  });
  var fonte = "font-family:'Poppins',Arial,sans-serif;";
  var celula = function(v, direita) { return '<td style="padding:9px 8px;border-bottom:1px solid ' + c.linha + ';vertical-align:top;word-break:break-word;' + (direita ? 'text-align:right;' : '') + '">' + esc(v) + '</td>'; };
  var tabela = function(cabecalho, linhas) { return '<table role="table" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;' + fonte + 'font-size:11px;line-height:1.5;"><thead><tr>' + cabecalho.map(function(t) {
    return '<th scope="col" style="padding:10px 8px;text-align:left;vertical-align:top;background:' + c.navy + ';color:' + c.branco + ';font-size:11px;font-weight:600;">' + esc(t) + '</th>';
  }).join('') + '</tr></thead><tbody>' + linhas + '</tbody></table>'; };
  var linhasGraficas = lista.map(function(g,i) { return '<tr style="background:' + (i % 2 ? c.zebra : c.branco) + ';">' + celula(g.nome) +
    [Object.keys(g.mapas).length, g.agenda, g.coleta, g.foraPCP, g.conferir, g.mais, g.menos].map(function(n) { return celula(fmt(n), true); }).join('') + '</tr>'; }).join('');
  var htmlDetalhes = [];
  ordenadas.forEach(function(d,i) {
    var g = grupos[d.grupoId] || {}, m = movimento(d), nome = texto(d.grafica || d.graficaOriginal) || graficaGrupo[d.grupoId] || 'Gráfica não informada';
    var evento = m.coleta ? '🚚 Coletado hoje' : d.dataAgendada === diario.dia ? '📅 Agendado hoje · pendente' : '📅 Agendado a partir de hoje · pendente';
    var classificacao = rotulos[d.statusComparacao || g.statusComparacao] || d.statusComparacao || g.statusComparacao || 'Não informado';
    var agendada = !m.coleta ? Number(d.volumeMapa || 0) : 0, coletada = m.coleta ? Number(d.volumeColetado || 0) : 0;
    plain.push('', evento,
      'Gráfica: ' + nome + ' | Marca: ' + (d.marca || 'Não informada') + ' | CD destino: ' + (d.destino || 'Não informado'),
      'SKU: ' + (d.sku || 'Não informado') + ' | Kit: ' + (d.kit || 'Não informado') + ' | Envio: ' + (d.envio || 'Não informado'),
      'Código mapa: ' + (d.codigoMapa || 'Não informado'),
      'Agendamento: ' + data(d.dataAgendada) + ' | Coleta: ' + data(d.coletaTP) + ' | Entrega: ' + data(d.entregaTP),
      'Tiragem agendada: ' + fmt(agendada) + ' | Tiragem coletada hoje: ' + fmt(coletada),
      'Conferência: ' + classificacao + ' | Status coleta PCP: ' + (g.statusColeta || 'Não informado'));
    if (d.statusNaoGrafico) plain.push('Classificação no mapa: ' + d.statusNaoGrafico);
    if (g.diferencas && g.diferencas.length) plain.push('Conferir: ' + g.diferencas.join(', '));
    htmlDetalhes.push('<tr style="background:' + (i % 2 ? c.zebra : c.branco) + ';border-bottom:1px solid ' + c.linha + ';">' +
      [nome,d.marca || 'Não informada',d.destino || 'Não informado',d.sku || 'Não informado',d.kit || 'Não informado',
        d.envio || 'Não informado',d.codigoMapa || 'Não informado',data(d.dataAgendada),data(d.coletaTP),data(d.entregaTP),
        fmt(agendada),fmt(coletada),classificacao,g.statusColeta || 'Não informado',
        [d.statusNaoGrafico,(g.diferencas || []).join(', ')].filter(Boolean).join(' · ') || '—']
        .map(function(v,n) { return '<td style="padding:8px 6px;vertical-align:top;' + (n === 10 || n === 11 ? 'text-align:right;' : '') + '">' + esc(v) + '</td>'; }).join('') + '</tr>');
  });
  if (!ordenadas.length) plain.push('Nenhum item com movimento hoje.');
  plain.push('', 'Agendado hoje considera somente agendamentos ainda pendentes. Coletado hoje segue a data da coleta realizada.',
    'Mapas são contados por gráfica; um código pode aparecer em mais de uma gráfica. O total geral considera cada código uma vez.', 'Dados conferidos em ' + conferido + '.');
  var indicador = function(icone,titulo,valor,cor) { return '<td width="50%" style="padding:16px 14px;background:' + c.zebra + ';vertical-align:top;"><div style="font-size:12px;font-weight:600;color:' + c.secundario + ';">' + esc(icone + ' ' + titulo) + '</div><div style="font-size:32px;line-height:1.3;font-weight:700;color:' + cor + ';">' + esc(fmt(valor)) + '</div></td>'; };
  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:' + c.fundo + ';' + fonte + 'color:' + c.texto + ';">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr><td align="center" style="padding:20px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:1000px;border-collapse:collapse;background:' + c.branco + ';' + fonte + '">' +
    '<tr><td style="padding:22px 20px;background:' + c.navy + ';color:' + c.branco + ';"><div style="font-size:23px;font-weight:700;">🗺️ Mapa de saída</div><div style="margin-top:5px;font-size:14px;font-weight:400;">Movimentos de hoje · ' + esc(dataBR) + '</div></td></tr>' +
    '<tr><td style="padding:18px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>' + indicador('📅','Tiragem agendada hoje',agenda.volume,c.navy) + indicador('🚚','Tiragem coletada hoje',coleta.volume,c.azul) + '</tr></table><p style="margin:10px 0 0;font-size:11px;color:' + c.secundario + ';">Agendamentos ainda pendentes e coletas realizadas hoje.</p></td></tr>' +
    '<tr><td style="padding:0 20px 18px;font-size:13px;line-height:1.8;"><h2 style="font-size:16px;font-weight:600;margin:0 0 8px;">Resumo rápido</h2>' + resumoLinhas.map(esc).join('<br>') + '<p style="margin:8px 0 0;color:' + c.secundario + ';font-size:11px;">' + esc(nota) + '</p></td></tr>' +
    '<tr><td style="padding:0 20px 20px;"><h2 style="font-size:16px;font-weight:600;margin:0 0 10px;">Conferência da tiragem de hoje</h2>' +
    tabela(['Situação','Tiragem agendada hoje','Tiragem coletada hoje'],categorias.map(function(row,i) { return '<tr style="background:' + (i % 2 ? c.zebra : c.branco) + ';">' + celula(row[0]) + celula(fmt(row[1]),true) + celula(fmt(row[2]),true) + '</tr>'; }).join('')) + '</td></tr>' +
    '<tr><td style="padding:0 20px 20px;"><h2 style="font-size:16px;font-weight:600;margin:0 0 10px;">Todas as gráficas do dia</h2>' +
    (lista.length ? tabela(['Gráfica','Mapas','Tiragem agendada hoje','Tiragem coletada hoje','Itens fora do PCP','Itens para conferir','Tiragem a mais','Tiragem a menos'],linhasGraficas) : '<p style="font-size:13px;">Nenhum agendamento pendente ou coleta realizada hoje.</p>') +
    '<p style="font-size:10px;line-height:1.6;color:' + c.secundario + ';">' + esc(nota) + ' Mapas são contados por gráfica; o total geral considera cada código uma vez.</p></td></tr>' +
    '<tr><td style="padding:0 20px 20px;"><h2 style="font-size:16px;font-weight:600;margin:0 0 10px;">Mapas para conferir · hoje em diante · ' + esc(fmt(Object.keys(mapas).length)) + ' mapas</h2>' +
    (htmlDetalhes.length ? tabela(['Gráfica','Marca','CD destino','SKU','Kit','Envio','Código mapa','Agendamento','Coleta','Entrega','Tiragem agendada','Tiragem coletada hoje','Conferência','Status coleta PCP','Conferir no mapa'],htmlDetalhes.join('')) : '<p style="font-size:13px;">Nenhum item com movimento hoje.</p>') + '</td></tr>' +
    '<tr><td style="padding:14px 20px;background:' + c.zebra + ';font-size:11px;color:' + c.secundario + ';">Dados conferidos em ' + esc(conferido) + '.</td></tr></table></td></tr></table></body></html>';
  return { body: plain.join('\n'), htmlBody: html };
}
function prepararAlertaMapaHoje() {
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var view = getAcompanhamentoMapa();
  var diaCache = function(v) {
    var d = new Date(v);
    return !v || isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd');
  };
  if (!view.disponivel || diaCache(view.geradoEm) !== hoje) view = atualizarAcompanhamentoMapa();
  if (!view.disponivel || !Array.isArray(view.detalhes)) throw new Error('Acompanhamento indisponivel. Atualize os caches e o acompanhamento antes do report.');
  if (diaCache(view.origemMapaGeradoEm) !== hoje || diaCache(view.origemPCPGeradoEm) !== hoje) {
    throw new Error('Os caches do Mapa e do PCP precisam ser atualizados hoje antes do envio. Nenhum email foi enviado.');
  }
  var diario = pgAMRecortarAlerta_(view, hoje), resumo = diario.resumoChavesTocadas;
  if (diario.agenda.linhasQuantidadeAusente || diario.coleta.linhasQuantidadeAusente ||
      diario.detalhes.some(function(d) { return d.volumeMapa === null; }) ||
      diario.grupos.some(function(g) { return g.quantidadesPCPConferidas === false; })) {
    throw new Error('Ha movimentos do dia sem quantidades validas para o report. Atualize ou confira os caches. Nenhum email foi enviado.');
  }
  var dataBR = hoje.slice(8) + '/' + hoje.slice(5, 7) + '/' + hoje.slice(0, 4);
  var apresentacao = pgAMApresentarAlerta_(diario, dataBR, view.geradoEm);
  return { dia: hoje, subject: '[Portal PG] Mapa de Saida - ' + dataBR,
    body: apresentacao.body, htmlBody: apresentacao.htmlBody,
    detalhes: diario.detalhes, resumo: { agenda: diario.agenda, coleta: diario.coleta, chavesTocadas: resumo } };
}
function enviarAlertaMapaHoje() {
  var destinatarios = PG_ALERTAS_MAPA_DESTINATARIOS.map(pgAMTexto_).filter(Boolean);
  if (!destinatarios.length) throw new Error('Configure PG_ALERTAS_MAPA_DESTINATARIOS em AlertasMapa.gs com o email real do grupo. Nenhum email foi enviado.');
  if (destinatarios.some(function(e) { return !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e); })) {
    throw new Error('Destinatario invalido em PG_ALERTAS_MAPA_DESTINATARIOS. Nenhum email foi enviado.');
  }
  return pgAMEnviarEmailPreparado_(prepararAlertaMapaHoje(), destinatarios);
}
function pgAMEnviarEmailPreparado_(report, destinatarios) {
  var mensagem = { to: destinatarios.join(','), subject: report.subject, body: report.body, htmlBody: report.htmlBody };
  if (PG_ALERTAS_MAPA_ANEXAR_CSV) mensagem.attachments = [Utilities.newBlob(pgAMCSVAlerta_(report.detalhes),
    'text/csv', 'Mapa_eventos_' + report.dia + '.csv')];
  MailApp.sendEmail(mensagem);
  return { enviado: true, dia: report.dia, destinatarios: destinatarios.length,
    agenda: report.resumo.agenda, coleta: report.resumo.coleta };
}
