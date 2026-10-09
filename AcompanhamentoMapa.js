// Acompanhamento geral independente dos filtros do portal. Somente caches publicados.
// O/AN do Mapa e STATUS COLETA/quantidades do PCP continuam sendo dados distintos.

function pgAMTexto_(v) { return String(v == null ? '' : v).trim(); }
function pgAMNormal_(v) { return pgAMTexto_(v).toUpperCase(); }
function pgAMNumero_(v) {
  if (v === '' || v == null || (typeof v !== 'number' && typeof v !== 'string')) return null;
  var s = typeof v === 'string' ? v.trim() : v;
  if (typeof s === 'string') {
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  var n = Number(s);
  return isFinite(n) ? n : null;
}
function pgAMData_(v) {
  var s = pgAMTexto_(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
function pgAMCampo_(l, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    var v = l[nomes[i]];
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  return '';
}
function pgAMIdentidade_(l, fonte) {
  var i = l._PG_MAPA_IDENTIDADE;
  var acab = fonte === 'ACABADORA';
  var linhaFisica = Number(l._PG_TP_LINHA);
  if (!Number.isInteger(linhaFisica) || linhaFisica <= 0) linhaFisica = null;
  if (i) return { marca: pgAMNormal_(i.marca), grafica: pgAMNormal_(i.grafica),
    destino: pgAMNormal_(i.destino), sku: pgAMNormal_(i.sku), envio: pgAMNormal_(i.envio),
    origem: fonte, linha: linhaFisica || Number(i.linha) || null };
  return { origem: fonte, linha: linhaFisica,
    marca: pgAMNormal_(pgAMCampo_(l, ['UNIDADE', 'MARCA_FINAL', acab ? 'AE' : 'BR'])),
    grafica: pgAMNormal_(pgAMCampo_(l, acab ? ['GRÁFICA', 'GRAFICA_FINAL', 'AD'] : ['GRÁFICA_MAPA', 'S'])),
    destino: pgAMNormal_(acab ? pgAMCampo_(l, ['CD DESTINO', 'CD_DESTINO', 'AS', 'CD_FINAL']) : l.CD_MAPA),
    sku: pgAMNormal_(pgAMCampo_(l, acab ? ['SKU', 'AJ'] : ['SKU', 'SKU_REAL', 'BW'])),
    envio: pgAMNormal_(pgAMCampo_(l, ['ENVIO', acab ? 'AG' : 'BT'])) };
}
function pgAMChave_(i, semEnvio) {
  return JSON.stringify([i.marca, i.grafica, i.destino, i.sku].concat(semEnvio ? [] : [i.envio]));
}
function pgAMStatus_(v) {
  return pgAMNormal_(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pgAMComparar_(linhasMapa, linhasPCP) {
  var fontes = Object.create(null), porSKU = Object.create(null), usadas = Object.create(null);
  var fontesFisicas = Object.create(null), fontesRepetidas = 0;
  (linhasPCP || []).forEach(function(l) {
    var fonte = pgAMStatus_(l._SOURCE || l.BASE || l._base).indexOf('ACAB') >= 0 ? 'ACABADORA' : 'PCP';
    var identidade = pgAMIdentidade_(l, fonte);
    if (Number.isInteger(identidade.linha) && identidade.linha > 0) {
      var fisica = fonte + ':' + identidade.linha;
      if (fontesFisicas[fisica]) { fontesRepetidas++; return; }
      fontesFisicas[fisica] = true;
    }
    var chave = fonte + ':' + pgAMChave_(identidade, fonte === 'ACABADORA');
    if (!fontes[chave]) {
      fontes[chave] = { chave: chave, identidade: identidade, origem: fonte, linhas: [], status: [], statusSemVolume: [],
        esperado: 0, coletado: 0, quantidadesConferidas: true, volumeAMais: 0, volumeAMenos: 0,
        volumeOK: 0, basesStatus: [] };
      if (!porSKU[identidade.sku]) porSKU[identidade.sku] = [];
      porSKU[identidade.sku].push(fontes[chave]);
    }
    var f = fontes[chave], c = l._PG_MAPA_COLETA || {};
    var status = pgAMTexto_(c.status !== undefined ? c.status : pgAMCampo_(l, ['STATUS COLETA', 'GIRO_STATUS_AY']));
    var coletado = pgAMNumero_(c.coletado !== undefined ? c.coletado : pgAMCampo_(l, ['GIRO_COLETADA_AZ', 'TIRAGEM COLETADA']));
    var esperado = pgAMNumero_(c.esperado !== undefined ? c.esperado : pgAMCampo_(l, ['GIRO_TOTAL_BA', 'TIRAGEM TOTAL']));
    var vencido = pgAMNumero_(c.vencido !== undefined ? c.vencido : pgAMCampo_(l, ['Tiragem Vencida', 'TIRAGEM VENCIDA']));
    var recebido = pgAMNumero_(c.recebido !== undefined ? c.recebido : l['Tiragem recebida (Total SKU)']);
    f.linhas.push({ origem: fonte, linha: identidade.linha });
    f.esperado += esperado || 0;
    f.coletado += coletado || 0;
    if (esperado === null || coletado === null) f.quantidadesConferidas = false;
    // BA/Z ja deduplicam por CONT.SES. Linhas zeradas nao repetem saldo/status do lote.
    var proprietaria = (esperado || 0) !== 0 || (coletado || 0) !== 0;
    var listaStatus = proprietaria ? f.status : f.statusSemVolume;
    if (status && listaStatus.indexOf(status) < 0) listaStatus.push(status);
    if (!proprietaria) return;
    var normal = pgAMStatus_(status), falta = fonte === 'PCP'
      ? vencido === null || coletado === null ? null : vencido - coletado
      : esperado === null || recebido === null ? null : esperado - recebido;
    if (normal.indexOf('A MENOS') >= 0 && falta === null) f.quantidadesConferidas = false;
    if (normal.indexOf('A MAIS') >= 0 && esperado !== null && coletado !== null) f.volumeAMais += Math.max(0, coletado - esperado);
    if (normal.indexOf('A MENOS') >= 0 && falta !== null) f.volumeAMenos += Math.max(0, falta);
    if (normal === 'COLETA OK') f.volumeOK += coletado || 0;
    f.basesStatus.push({ origem: fonte, linha: identidade.linha, statusColeta: status,
      coletado: coletado, esperado: esperado, vencido: vencido, recebido: recebido,
      diferencaTotal: esperado === null || coletado === null ? null : coletado - esperado,
      faltaSegundoStatus: normal.indexOf('A MENOS') >= 0 ? falta : null });
  });
  Object.keys(fontes).forEach(function(k) {
    if (!fontes[k].status.length) fontes[k].status = fontes[k].statusSemVolume.slice();
  });

  var grupos = Object.create(null), detalhes = [], linhasVistas = Object.create(null), repetidas = 0;
  (linhasMapa || []).forEach(function(e) {
    if (Number.isInteger(e.linhaMapa) && e.linhaMapa > 0) {
      if (linhasVistas[e.linhaMapa]) { repetidas++; return; }
      linhasVistas[e.linhaMapa] = true;
    }
    var i = { marca: pgAMNormal_(e.marca), grafica: pgAMNormal_(e.grafica), destino: pgAMNormal_(e.destino),
      sku: pgAMNormal_(e.sku), envio: pgAMNormal_(e.envio) };
    var candidatas = porSKU[i.sku] || [], exatas = [];
    var pcp = fontes['PCP:' + pgAMChave_(i, false)];
    var acab = fontes['ACABADORA:' + pgAMChave_(i, true)];
    if (pcp) exatas.push(pcp);
    if (acab) exatas.push(acab);
    exatas.forEach(function(f) { usadas[f.chave] = true; });
    var completa = [i.marca, i.grafica, i.destino, i.sku].every(function(v) { return v && v !== '-'; });
    var skuInformado = i.sku && i.sku !== '-';
    var status = exatas.length ? 'OK' : skuInformado && !candidatas.length ? 'SEM_PCP' :
      !completa ? 'SEM_IDENTIDADE' : 'DADOS_DIFERENTES';
    // Uma chave de acabadora pode receber varios envios: sua formula nao usa envio.
    var id = exatas.length === 1 && exatas[0].origem === 'ACABADORA'
      ? 'ACABADORA:' + pgAMChave_(i, true) : 'MAPA:' + pgAMChave_(i, false);
    if (!grupos[id]) {
      // A comparacao principal prefere PCP; fontes alternativas continuam
      // auditaveis separadamente, sem somar a transferencia fisica duas vezes.
      var unica = pcp || acab || null;
      var diferencas = [];
      if (status === 'DADOS_DIFERENTES') {
        [['destino', 'CD destino'], ['grafica', 'Gráfica'], ['marca', 'Marca'], ['envio', 'Envio']].forEach(function(par) {
          if (!candidatas.some(function(f) { return (par[0] === 'envio' && f.origem === 'ACABADORA') || f.identidade[par[0]] === i[par[0]]; })) diferencas.push(par[1]);
        });
        if (!diferencas.length) diferencas.push('Combinação de CD destino, gráfica, marca e envio');
      }
      grupos[id] = { id: id, sku: i.sku, kit: '', grafica: i.grafica, marca: i.marca, destino: i.destino, envio: i.envio,
        envios: [], volumeMapa: 0, volumeColetado: 0,
        volumeEsperadoPCP: unica && unica.quantidadesConferidas ? unica.esperado : null,
        volumeColetadoPCP: unica && unica.quantidadesConferidas ? unica.coletado : null,
        volumeAMais: unica ? unica.volumeAMais : 0, volumeAMenos: unica ? unica.volumeAMenos : 0,
        volumeOK: unica ? unica.volumeOK : 0, statusComparacao: status,
        statusColeta: unica ? unica.status.join(' / ') : '',
        comparacoesPCP: exatas.map(function(f) { return { origem: f.origem,
          volumeEsperadoPCP: f.quantidadesConferidas ? f.esperado : null,
          volumeColetadoPCP: f.quantidadesConferidas ? f.coletado : null,
          volumeAMais: f.volumeAMais, volumeAMenos: f.volumeAMenos,
          statusColeta: f.status.join(' / '), basesStatus: f.basesStatus }; }),
        diferencas: diferencas, origemPCP: exatas.map(function(f) { return f.origem; }).join(' / '),
        linhasPCP: [].concat.apply([], exatas.map(function(f) { return f.linhas; })),
        basesStatus: [].concat.apply([], exatas.map(function(f) { return f.basesStatus; })),
        multiplasFontes: exatas.length > 1, notaFonte: exatas.length > 1 ? 'Também no PCP Acabadora; comparação principal pelo PCP.' : '',
        quantidadesPCPConferidas: unica ? unica.quantidadesConferidas : null, linhasQuantidadeMapaAusente: [],
        linhasMapa: [], codigosMapa: [], kits: [],
        candidatosPCP: candidatas.map(function(f) { return Object.assign({}, f.identidade, {
          linha: f.identidade.linha, linhas: f.linhas.map(function(r) { return r.linha; }) }); }) };
    }
    var g = grupos[id], vol = pgAMNumero_(e.volumeSolicitado), coletado = pgAMNumero_(e.volumeColetado);
    if (vol === null || coletado === null) g.linhasQuantidadeMapaAusente.push(e.linhaMapa);
    g.volumeMapa += vol || 0;
    g.volumeColetado += coletado || 0;
    g.linhasMapa.push(e.linhaMapa);
    if (e.codigoMapa && g.codigosMapa.indexOf(e.codigoMapa) < 0) g.codigosMapa.push(e.codigoMapa);
    if (e.kit && g.kits.indexOf(e.kit) < 0) g.kits.push(e.kit);
    if (i.envio && g.envios.indexOf(i.envio) < 0) g.envios.push(i.envio);
    detalhes.push({ id: 'linha:' + e.linhaMapa, grupoId: id, codigoMapa: e.codigoMapa || '', linhaMapa: e.linhaMapa,
      sku: i.sku, kit: e.kit || '', grafica: i.grafica, marca: i.marca, destino: i.destino, envio: i.envio,
      descricao: e.descricao || '', volumeMapa: vol, volumeColetado: coletado,
      dataAgendada: e.dataAgendada || null, coletaTP: e.coletaTP || null, entregaTP: e.entregaTP || null,
      statusTP: e.statusTP || '', statusNaoGrafico: e.naoGraficos || '', statusComparacao: status,
      atualizadoOrigem: e.atualizadoOrigem || '', marcaOriginal: e.marcaOriginal || '',
      graficaOriginal: e.graficaOriginal || '', destinoOriginal: e.destinoOriginal || '',
      inclusao: 'base-atual', primeiroVistoEm: null, semChaveAP: !e.chaveMapa });
  });
  // PCP e principal quando a mesma identidade tambem existe na Acabadora.
  // Como a Acabadora nao distingue envio, vincula sua comparacao uma unica vez.
  Object.keys(fontes).sort(function(a, b) {
    return Number(fontes[a].origem === 'ACABADORA') - Number(fontes[b].origem === 'ACABADORA');
  }).forEach(function(k) {
    if (usadas[k]) return;
    var f = fontes[k], i = f.identidade;
    var comparacoes = [f];
    if (f.origem === 'PCP') {
      var alternativa = fontes['ACABADORA:' + pgAMChave_(i, true)];
      if (alternativa && !usadas[alternativa.chave]) comparacoes.push(alternativa);
    }
    comparacoes.forEach(function(c) { usadas[c.chave] = true; });
    var id = 'BASE:' + k;
    grupos[id] = { id: id, sku: i.sku, kit: '', grafica: i.grafica, marca: i.marca, destino: i.destino,
      envio: i.envio, envios: i.envio ? [i.envio] : [], volumeMapa: 0, volumeColetado: 0,
      volumeEsperadoPCP: f.quantidadesConferidas ? f.esperado : null,
      volumeColetadoPCP: f.quantidadesConferidas ? f.coletado : null,
      volumeAMais: f.volumeAMais, volumeAMenos: f.volumeAMenos, volumeOK: f.volumeOK,
      statusComparacao: 'SEM_MAPA', statusColeta: f.status.join(' / '), diferencas: [],
      origemPCP: comparacoes.map(function(c) { return c.origem; }).join(' / '),
      linhasPCP: [].concat.apply([], comparacoes.map(function(c) { return c.linhas; })),
      basesStatus: [].concat.apply([], comparacoes.map(function(c) { return c.basesStatus; })),
      multiplasFontes: comparacoes.length > 1,
      notaFonte: comparacoes.length > 1 ? 'Também no PCP Acabadora; comparação principal pelo PCP. A Acabadora não distingue envio e aparece uma única vez.' : '',
      comparacoesPCP: comparacoes.map(function(c) { return { origem: c.origem,
        volumeEsperadoPCP: c.quantidadesConferidas ? c.esperado : null,
        volumeColetadoPCP: c.quantidadesConferidas ? c.coletado : null,
        volumeAMais: c.volumeAMais, volumeAMenos: c.volumeAMenos,
        statusColeta: c.status.join(' / '), basesStatus: c.basesStatus }; }),
      quantidadesPCPConferidas: f.quantidadesConferidas,
      linhasQuantidadeMapaAusente: [], linhasMapa: [], codigosMapa: [], kits: [],
      candidatosPCP: [Object.assign({}, i, { linhas: f.linhas.map(function(r) { return r.linha; }) })] };
  });
  var lista = Object.keys(grupos).map(function(k) {
    var g = grupos[k]; g.kit = g.kits.join(' / '); g.envio = g.envios.join(' / ');
    g.diferencaTotalPCP = g.volumeColetadoPCP === null || g.volumeEsperadoPCP === null ? null : g.volumeColetadoPCP - g.volumeEsperadoPCP;
    return g;
  });
  var alertas = [], quantidadeAusente = detalhes.filter(function(d) { return d.volumeMapa === null || d.volumeColetado === null; }).length;
  var fontesSemQuantidade = lista.filter(function(g) { return g.quantidadesPCPConferidas === false; }).length;
  if (repetidas) alertas.push({ tipo: 'LINHAS_FISICAS_REPETIDAS', quantidade: repetidas,
    mensagem: 'Linhas fisicas repetidas do Mapa foram consideradas uma unica vez.' });
  if (fontesRepetidas) alertas.push({ tipo: 'LINHAS_PCP_REPETIDAS', quantidade: fontesRepetidas,
    mensagem: 'Linhas fisicas repetidas do PCP foram consideradas uma unica vez.' });
  if (quantidadeAusente) alertas.push({ tipo: 'QUANTIDADE_MAPA_AUSENTE', quantidade: quantidadeAusente,
    mensagem: 'Ha tiragem ausente ou invalida no mapa; os totais incluem somente quantidades informadas.' });
  if (fontesSemQuantidade) alertas.push({ tipo: 'QUANTIDADE_PCP_AUSENTE', quantidade: fontesSemQuantidade,
    mensagem: 'Comparacao de quantidade indisponivel em grupos sem os valores da formula do PCP.' });
  return { grupos: lista, detalhes: detalhes, resumo: pgAMResumo_(lista, detalhes), filtros: pgAMFiltros_(lista),
    alertas: alertas };
}

function pgAMResumo_(grupos, detalhes) {
  var r = { mapas: 0, linhasMapa: detalhes.length, grupos: grupos.length,
    ausentesPCP: 0, identidadeDivergente: 0, semIdentidade: 0, semMapa: 0, gruposMais: 0, gruposMenos: 0, coletaOK: 0,
    volumeMapa: 0, volumeColetado: 0, volumeComPCP: 0, volumeSemPCP: 0, volumeDivergente: 0,
    volumeAMais: 0, volumeAMenos: 0, volumeOK: 0, volumeSemMapa: 0 };
  var mapas = Object.create(null);
  detalhes.forEach(function(d) { if (d.codigoMapa) mapas[d.codigoMapa] = true; });
  r.mapas = Object.keys(mapas).length;
  grupos.forEach(function(g) {
    r.volumeMapa += g.volumeMapa; r.volumeColetado += g.volumeColetado;
    if (g.statusComparacao === 'OK') r.volumeComPCP += g.volumeMapa;
    if (g.statusComparacao === 'SEM_PCP') { r.ausentesPCP++; r.volumeSemPCP += g.volumeMapa; }
    if (g.statusComparacao === 'DADOS_DIFERENTES') { r.identidadeDivergente++; r.volumeDivergente += g.volumeMapa; }
    if (g.statusComparacao === 'SEM_IDENTIDADE') r.semIdentidade++;
    if (g.statusComparacao === 'SEM_MAPA') { r.semMapa++; r.volumeSemMapa += g.volumeEsperadoPCP || 0; }
    if (g.volumeAMais > 0) r.gruposMais++;
    if (g.volumeAMenos > 0) r.gruposMenos++;
    if (pgAMStatus_(g.statusColeta).indexOf('COLETA OK') >= 0) r.coletaOK++;
    r.volumeAMais += g.volumeAMais; r.volumeAMenos += g.volumeAMenos; r.volumeOK += g.volumeOK;
  });
  return r;
}
function pgAMFiltros_(grupos) {
  var out = { marcas: [], graficas: [], destinos: [], status: [] };
  [['marcas', 'marca'], ['graficas', 'grafica'], ['destinos', 'destino'], ['status', 'statusComparacao']].forEach(function(p) {
    out[p[0]] = grupos.map(function(g) { return g[p[1]]; }).filter(function(v, i, a) { return v && a.indexOf(v) === i; }).sort();
  });
  return out;
}
function pgAMResumoMovimentos_(detalhes, campoVolume) {
  var r = { linhas: detalhes.length, mapas: 0, volume: 0, linhasComPCP: 0, linhasSemPCP: 0,
    linhasQuantidadeAusente: 0,
    linhasDivergentes: 0, linhasSemIdentidade: 0,
    volumeComPCP: 0, volumeSemPCP: 0, volumeDivergente: 0, volumeSemIdentidade: 0 };
  var codigos = Object.create(null);
  detalhes.forEach(function(d) {
    var v = d[campoVolume] || 0; r.volume += v;
    if (d[campoVolume] === null) r.linhasQuantidadeAusente++;
    if (d.codigoMapa) codigos[d.codigoMapa] = true;
    if (d.statusComparacao === 'OK') { r.linhasComPCP++; r.volumeComPCP += v; }
    if (d.statusComparacao === 'SEM_PCP') { r.linhasSemPCP++; r.volumeSemPCP += v; }
    if (d.statusComparacao === 'DADOS_DIFERENTES') { r.linhasDivergentes++; r.volumeDivergente += v; }
    if (d.statusComparacao === 'SEM_IDENTIDADE') { r.linhasSemIdentidade++; r.volumeSemIdentidade += v; }
  });
  r.mapas = Object.keys(codigos).length;
  return r;
}

// O portal e geral. Apenas o report diario seleciona eventos AR/AT daquele dia.
function pgAMReportDia_(geral, dia) {
  var agenda = [], coleta = [], selecionadas = [], ids = Object.create(null);
  geral.detalhes.forEach(function(d) {
    var coletadoAteDia = pgAMData_(d.coletaTP) && d.coletaTP <= dia;
    var agendado = d.dataAgendada === dia && !coletadoAteDia;
    var coletado = d.coletaTP === dia && ((d.volumeColetado || 0) > 0 || d.volumeColetado === null);
    if (agendado) agenda.push(d);
    if (coletado) coleta.push(d);
    if (agendado || coletado) { selecionadas.push(d); ids[d.grupoId] = true; }
  });
  var grupos = geral.grupos.filter(function(g) { return ids[g.id]; });
  return { dia: dia, criterio: 'Agendamentos pendentes e coletas realizadas na data selecionada. A atualizacao da origem nao e uma inclusao.',
    agenda: pgAMResumoMovimentos_(agenda, 'volumeMapa'),
    coleta: pgAMResumoMovimentos_(coleta, 'volumeColetado'),
    grupos: grupos, detalhes: selecionadas,
    resumoChavesTocadas: pgAMResumo_(grupos, selecionadas),
    observacao: 'Os volumes/status dos grupos tocados sao acumulados da base atual. Agenda e coleta do dia sao metricas separadas.' };
}

function pgAMNamespace_() {
  var id = ScriptApp.getScriptId();
  if (!id) throw new Error('Script sem identidade: acompanhamento nao sera gravado em cache compartilhado.');
  var ambiente = PropertiesService.getScriptProperties().getProperty('PG_AMBIENTE_PORTAL') || 'script';
  return { id: id, ambiente: ambiente, arquivo: 'cache_acompanhamento_mapa_' + id.replace(/[^a-zA-Z0-9_-]/g, '_') +
    '_' + ambiente.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json' };
}
function pgAMLerCache_(nome) {
  var json = typeof pgPreparacaoCache_ !== 'undefined' && pgPreparacaoCache_ && pgPreparacaoCache_[nome];
  if (!json) json = lerJSONDoDrive(nome, true);
  if (!json || json === '[]') return null;
  return JSON.parse(json);
}
function pgAMDashboard_() {
  var indice = pgAMLerCache_(CACHE_DASHBOARD_INDICE), linhas = [];
  if (indice && Array.isArray(indice.meses)) {
    indice.meses.forEach(function(item) {
      var fatia = pgAMLerCache_(item.arquivo || pgArquivoMesDashboard_(item.mes));
      if (!Array.isArray(fatia)) throw new Error('Fatia do dashboard indisponivel: ' + item.mes);
      linhas = linhas.concat(fatia);
    });
    if (typeof indice.registros === 'number' && linhas.length !== indice.registros) {
      throw new Error('Cache do PCP incompleto: quantidade de registros difere do indice publicado.');
    }
  } else {
    linhas = pgAMLerCache_(CACHE_DASHBOARD_ATIVO) || pgAMLerCache_(CACHE_DASHBOARD_TMP);
    if (!Array.isArray(linhas)) throw new Error('Cache do PCP/PCP_ACABADORAS indisponivel.');
  }
  return linhas;
}
function pgAMView_(relatorio, dia) {
  var selecionado = pgAMData_(dia);
  var view = { versao: 1, disponivel: !!relatorio, diaSelecionado: selecionado || 'atual',
    geradoEm: relatorio && relatorio.geradoEm || '', ambiente: relatorio && relatorio.ambiente || '',
    origemMapaGeradoEm: relatorio && relatorio.origemMapaGeradoEm || '',
    origemPCPGeradoEm: relatorio && relatorio.origemPCPGeradoEm || '',
    modo: selecionado ? 'diario' : 'geral', dias: relatorio ? [relatorio.dia] : [], periodos: [],
    resumo: relatorio && relatorio.resumo || pgAMResumo_([], []), grupos: relatorio && relatorio.grupos || [],
    detalhes: relatorio && relatorio.detalhes || [], filtros: relatorio && relatorio.filtros || pgAMFiltros_([]),
    alertas: relatorio && relatorio.alertas || [],
    email: { configurado: typeof PG_ALERTAS_MAPA_DESTINATARIOS !== 'undefined' && PG_ALERTAS_MAPA_DESTINATARIOS.length > 0, automatico: false },
    mensagem: relatorio ? (relatorio.alertas || []).map(function(a) { return a.mensagem; }).join(' ') :
      'Atualize o acompanhamento para iniciar. Sao usados somente os caches publicados.' };
  if (relatorio && selecionado) {
    view.reportDia = pgAMReportDia_(relatorio, selecionado);
    view.grupos = view.reportDia.grupos; view.detalhes = view.reportDia.detalhes;
    view.resumo = view.reportDia.resumoChavesTocadas; view.filtros = pgAMFiltros_(view.grupos);
  }
  return view;
}
function getAcompanhamentoMapa(dia) {
  var n = pgAMNamespace_();
  var r = pgAMLerCache_(n.arquivo);
  if (r && (r.scriptId !== n.id || r.ambiente !== n.ambiente)) throw new Error('Cache do acompanhamento pertence a outro ambiente.');
  return pgAMView_(r, dia);
}
function atualizarAcompanhamentoMapa(dia) {
  var preparando = typeof pgPreparacaoCache_ !== 'undefined' && pgPreparacaoCache_;
  var lock = preparando ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(1000)) throw new Error('Outra atualizacao do acompanhamento esta em andamento.');
  try {
    var n = pgAMNamespace_(), mapa = pgAMLerCache_('cache_mapa.json');
    if (!mapa || mapa.__acompanhamentoMapaVersao !== 1 || !Array.isArray(mapa.__linhasFisicas)) {
      throw new Error('Cache do mapa sem linhas fisicas da auditoria. Execute atualizarCacheMapa ou atualizarTodoOCache.');
    }
    var relatorio = pgAMComparar_(mapa.__linhasFisicas, pgAMDashboard_());
    relatorio.versao = 1; relatorio.scriptId = n.id; relatorio.ambiente = n.ambiente;
    relatorio.geradoEm = new Date().toISOString();
    relatorio.dia = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    relatorio.origemMapaGeradoEm = mapa.__agendaTPGeradoEm || '';
    var indicePCP = pgAMLerCache_(CACHE_DASHBOARD_INDICE);
    relatorio.origemPCPGeradoEm = indicePCP && indicePCP.geradoEm || '';
    if (!salvarJSONNoDrive(n.arquivo, relatorio)) throw new Error('Falha ao gravar acompanhamento do mapa.');
    return pgAMView_(relatorio, dia);
  } finally { if (lock) lock.releaseLock(); }
}
