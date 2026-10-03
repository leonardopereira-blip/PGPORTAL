// Base de auditoria da Meta Armazém: exporta as mesmas linhas calculadas na visão.
function gerarPlanilhaMetaArmazemAuditavel(payload) {
  var colunas = [
    'Kit','SKU','Descrição','Marca','Série','Gráfica','CD destino','Envio','OP',
    'Tiragem total','Dentro da meta','Fora da meta','Sem previsão','% dentro da meta',
    'Coleta início (re)plan','Coleta fim (re)plan','Coleta fim baseline','Coleta fim usada',
    'Origem da data de coleta','SLA (dias corridos)','Entrega início usada','Entrega fim prevista',
    'Meta original','Prazo combinado Posi','Meta aplicada','DU totais','DU dentro da meta',
    'DU fora da meta','Tiragem por DU','Regra aplicada','Situação','Motivo / observação',
    'Fonte','ID da linha','Chave','Cenário'
  ];
  var datas = [
    'Coleta início (re)plan','Coleta fim (re)plan','Coleta fim baseline','Coleta fim usada',
    'Entrega início usada','Entrega fim prevista','Meta original','Prazo combinado Posi','Meta aplicada'
  ];
  var quantidades = ['Tiragem total','Dentro da meta','Fora da meta','Sem previsão','Tiragem por DU'];
  var inteiros = ['SLA (dias corridos)','DU totais','DU dentro da meta','DU fora da meta'];
  var percentuais = ['% dentro da meta'];
  var avisos = [];
  var resultado;

  function textoSeguro_(valor) {
    var texto = String(valor == null ? '' : valor);
    // O conteúdo da origem permanece texto, inclusive quando começa como fórmula.
    return /^[\s]*[=+@]/.test(texto) ? "'" + texto : texto;
  }
  function dataNativa_(valor) {
    if (valor === '' || valor == null) return '';
    var iso = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      try {
        var dia = Utilities.parseDate(iso + ' 12:00:00', 'GMT-3', 'yyyy-MM-dd HH:mm:ss');
        if (Utilities.formatDate(dia, 'GMT-3', 'yyyy-MM-dd') === iso) return dia;
      } catch (eData) {}
    }
    if (avisos.indexOf('Algumas datas inválidas foram preservadas como texto.') < 0) {
      avisos.push('Algumas datas inválidas foram preservadas como texto.');
    }
    return textoSeguro_(valor);
  }
  function indice_(nome) { return colunas.indexOf(nome) + 1; }
  function formato_(sheet, nomes, formato, linhas) {
    nomes.forEach(function(nome) {
      sheet.getRange(2, indice_(nome), linhas, 1).setNumberFormat(formato);
    });
  }

  try {
    payload = payload || {};
    var recebido = payload.cabecalho;
    var linhas = payload.linhas;
    if (!Array.isArray(recebido) || recebido.length !== colunas.length ||
        recebido.some(function(nome, i) { return nome !== colunas[i]; })) {
      throw new Error('O cabeçalho da base auditável não corresponde às colunas da visão.');
    }
    if (!Array.isArray(linhas) || !linhas.length) {
      throw new Error('Não há itens nesta seleção para gerar a base auditável.');
    }
    if (linhas.length > 50000) {
      throw new Error('A seleção excede 50.000 linhas. Reduza os filtros para extrair a base.');
    }
    var normalizadas = linhas.map(function(linha, i) {
      if (!Array.isArray(linha) || linha.length !== colunas.length) {
        throw new Error('A linha ' + (i + 1) + ' da base auditável possui colunas incompletas.');
      }
      var normalizada = linha.map(function(valor, j) {
        var nome = colunas[j];
        if (datas.indexOf(nome) >= 0) return dataNativa_(valor);
        if (quantidades.indexOf(nome) >= 0 || inteiros.indexOf(nome) >= 0 || percentuais.indexOf(nome) >= 0) {
          if (valor === '' || valor == null) return '';
          var numero = Number(valor);
          if (!isFinite(numero)) throw new Error('Número inválido na linha ' + (i + 1) + ', coluna ' + nome + '.');
          return quantidades.indexOf(nome) >= 0 ? Math.round(numero) : numero;
        }
        return textoSeguro_(valor);
      });
      normalizada[indice_('Fora da meta') - 1] = normalizada[indice_('Tiragem total') - 1] -
        normalizada[indice_('Dentro da meta') - 1] - normalizada[indice_('Sem previsão') - 1];
      var total = normalizada[indice_('Tiragem total') - 1];
      normalizada[indice_('% dentro da meta') - 1] = total ?
        Math.round(100 * normalizada[indice_('Dentro da meta') - 1] / total) / 100 : 0;
      return normalizada;
    });
    resultado = gerarPlanilhaReportExecutiva({
      nome: payload.nome || 'Meta_Armazem_Base_Auditavel',
      usuarioEmail: payload.usuarioEmail || '',
      abas: [{nome: 'Base auditável', cabecalho: colunas, linhas: normalizadas}]
    });
    if (!resultado || !resultado.success) return resultado || {success:false,error:'Não foi possível criar a base auditável.'};
  } catch (erro) {
    return {success:false,error:erro && erro.message ? erro.message : String(erro)};
  }

  // A planilha já criada continua disponível mesmo se um ajuste visual falhar.
  try {
    var ss = SpreadsheetApp.openById(resultado.id);
    ss.setSpreadsheetLocale('pt_BR');
    ss.setSpreadsheetTimeZone('America/Sao_Paulo');
    var sheet = ss.getSheets()[0];
    var n = normalizadas.length;
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    var area = sheet.getRange(1, 1, n + 1, colunas.length);
    area.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
    if (!sheet.getFilter()) area.createFilter();
    sheet.getRange(2, 1, n, colunas.length)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#ffffff').setSecondRowColor('#f2f6fb');
    var header = sheet.getRange(1, 1, 1, colunas.length);
    header.setBackground('#0c2340').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
    sheet.getRange(1, 10, 1, 5).setBackground('#c54c18');
    sheet.getRange(1, 15, 1, 11).setBackground('#284081');
    sheet.getRange(1, 26, 1, 4).setBackground('#c54c18');
    sheet.setRowHeight(1, 48);
    sheet.setColumnWidths(1, colunas.length, 140);
    var larguras = {
      'Kit':160,'SKU':160,'Descrição':340,'Marca':130,'Série':110,'Gráfica':160,
      'CD destino':130,'Envio':90,'OP':110,'Origem da data de coleta':190,
      'Regra aplicada':220,'Situação':150,'Motivo / observação':340,
      'Fonte':140,'ID da linha':150,'Chave':250,'Cenário':240
    };
    Object.keys(larguras).forEach(function(nome) { sheet.setColumnWidth(indice_(nome), larguras[nome]); });
    ['Descrição','Regra aplicada','Motivo / observação','Cenário'].forEach(function(nome) {
      sheet.getRange(2, indice_(nome), n, 1).setWrap(true);
    });
    formato_(sheet, datas, 'dd/MM/yyyy', n);
    formato_(sheet, quantidades, '#,##0', n);
    formato_(sheet, inteiros, '#,##0', n);
    formato_(sheet, percentuais, '0%', n);
    // Identificadores são texto: preservar zeros iniciais de kit, SKU, OP e chave.
    sheet.getRange(2, 1, n, 9).setNumberFormat('@');
    sheet.getRange(2, 19, n, 1).setNumberFormat('@');
    sheet.getRange(2, 30, n, 7).setNumberFormat('@');
    sheet.getRange(2, 1, n, colunas.length).setValues(normalizadas);
    sheet.getRange(1, indice_('Tiragem total')).setNote('Volumes arredondados para unidades inteiras. Fora da meta é o saldo de total menos dentro e sem previsão; o percentual usa os volumes exportados.');
    sheet.getRange(1, indice_('Entrega fim prevista')).setNote('Data de coleta final usada + SLA em dias corridos. A coleta usa o replanejado; quando vazio, usa a baseline.');
    sheet.getRange(1, indice_('DU totais')).setNote('Rateio para todas as gráficas e acabadoras entre início e fim, inclusive; exclui fins de semana e os feriados nacionais usados na visão. Sem início, usa a data final.');
    SpreadsheetApp.flush();
  } catch (erroFormato) {
    avisos.push('A base foi criada; alguns ajustes de apresentação não foram aplicados: ' +
      (erroFormato && erroFormato.message ? erroFormato.message : String(erroFormato)));
  }
  resultado.linhas = normalizadas.length;
  if (avisos.length) resultado.warning = avisos.join(' ');
  return resultado;
}
