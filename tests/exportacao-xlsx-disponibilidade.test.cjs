const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inflateRawSync } = require('node:zlib');

const hoje = '2026-10-15';
const linhaPCP = () => ({
  _SOURCE: 'PCP', _PG_TP_LINHA: 2, MARCA_FINAL: 'COC', GRAFICA_FINAL: 'FORMA CERTA',
  SKU_REAL: 'SKU-1', ENVIO: 'V1', CD_MAPA: 'CD JDI', TIRAGEM: 200,
  'TIRAGEM COLETADA': 80, 'TIRAGEM AGENDADA': 50,
  Coleta_TP: '2026-10-10', Entrega_TP: '2026-10-13'
});
const evento = extra => ({
  eventoTPVersao: 2, marca: 'COC', grafica: 'FORMA CERTA', sku: 'SKU-1',
  destino: 'CD JDI', envio: 'V1', linhaMapa: 2, codigoMapa: 'MP-1', chaveMapa: 'MAPA-1',
  volumeSolicitado: 80, volumeColetado: 80,
  coletaTP: '2026-10-10', entregaTP: '2026-10-13', dataAgendada: '2026-10-10', ...extra
});
const mapaValido = () => ({
  __agendaTPCompleta: true,
  __forecastTP: { conferido: true, coleta: [], entrega: [] },
  __eventosTPAtuais: [evento(), evento({
    linhaMapa: 3, codigoMapa: 'MP-2', volumeSolicitado: 60, volumeColetado: 0,
    coletaTP: null, entregaTP: null, dataAgendada: '2026-10-20'
  })]
});

// Executa os scripts reais; apenas o alerta e o transporte do Apps Script são simulados.
function portal({ mapa, carga, linhas = [] } = {}) {
  const alertas = [], requisicoes = [];
  const contexto = {
    Blob, TextEncoder, console: { info() {}, warn() {}, error() {}, table() {} },
    dtHojeISO: hoje, MAPA_SAIDA_CACHE: mapa, dadosGlobais: linhas,
    alert: mensagem => alertas.push(mensagem),
    pgNumeroPrazoV35: valor => Number(valor) || 0,
    pgCampoPrazoV35: (linha, nome) => linha[nome] ?? ''
  };
  if (carga !== undefined) contexto.PG_MAPA_TP_CARGA_CONCLUIDA = carga;
  contexto.google = { script: { run: {
    withSuccessHandler(sucesso) {
      return {
        withFailureHandler(falha) {
          return { getDadosMapaSaida_Cache() { requisicoes.push({ sucesso, falha }); } };
        }
      };
    }
  } } };
  contexto.window = contexto;
  vm.createContext(contexto);
  for (const arquivo of ['Scripts_Eventos_TP.html', 'ExportadorExcel.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script, contexto, { filename: arquivo });
  }
  return { w: contexto, alertas, requisicoes };
}

function portalArmazem(linha, mapa) {
  const app = portal({ mapa, carga: true, linhas: [linha] }), w = app.w;
  const downloads = [], blobs = new Map();
  const controles = { filtroReferencia: { value: 'replan' }, pgFiltroOrigem: { value: 'TODOS' },
    pgFiltroDestino: { value: 'TODOS' } };
  const elemento = () => ({ value: '', innerHTML: '', textContent: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {},
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    click() { downloads.push({ nome: this.download, blob: blobs.get(this.href) }); }
  });
  Object.assign(w, {
    PG_MATRIZ_SLA: [['FORNECEDOR', 'CD JDI'], ['FORMA CERTA', 0]],
    arredondar: valor => Math.round(Number(valor) || 0), formatarBR: String,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    performance: { now: () => 0 }, addEventListener() {}, dispatchEvent() {}, Event: class {},
    localStorage: { getItem() { return null; }, setItem() {} },
    URL: { createObjectURL(blob) {
      const url = 'blob:teste-' + blobs.size; blobs.set(url, blob); return url;
    }, revokeObjectURL() {} }
  });
  w.document = {
    getElementById(id) { return controles[id] || (id.startsWith('ma') ? (controles[id] = elemento()) : null); },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    createElement: elemento, body: elemento(), head: elemento()
  };
  for (const arquivo of ['Scripts_Globais_2.html', 'Scripts_Meta_Armazem_Realizado.html', 'abaMetaArmazem.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script, w, { filename: arquivo });
  }
  vm.runInContext(`dtHojeISO='${hoje}';dtHoje=new Date('${hoje}T12:00:00');`, w);
  w.dadosBaseForecastColeta = [linha];
  w.processarMetaArmazem();
  w.setTimeout = (callback, delay) => { if (delay === 0) callback(); };
  return { ...app, downloads };
}

const proximoTurno = () => new Promise(resolve => setImmediate(resolve));
const congelarMapa = mapa => {
  Object.freeze(mapa.__forecastTP.coleta);
  Object.freeze(mapa.__forecastTP.entrega);
  Object.freeze(mapa.__forecastTP);
  mapa.__eventosTPAtuais.forEach(Object.freeze);
  Object.freeze(mapa.__eventosTPAtuais);
  return Object.freeze(mapa);
};

async function arquivosXlsx(blob) {
  const bytes = Buffer.from(await blob.arrayBuffer()), arquivos = new Map();
  assert.equal(bytes.readUInt32LE(0), 0x04034b50, 'arquivo começa com cabeçalho ZIP');
  let offset = 0;
  while (offset + 30 < bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const metodo = bytes.readUInt16LE(offset + 8), tamanho = bytes.readUInt32LE(offset + 18);
    const nomeTamanho = bytes.readUInt16LE(offset + 26), extraTamanho = bytes.readUInt16LE(offset + 28);
    const nome = bytes.subarray(offset + 30, offset + 30 + nomeTamanho).toString();
    const inicio = offset + 30 + nomeTamanho + extraTamanho;
    const conteudo = bytes.subarray(inicio, inicio + tamanho);
    arquivos.set(nome, (metodo === 8 ? inflateRawSync(conteudo) : conteudo).toString());
    offset = inicio + tamanho;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'ZIP contém diretório central');
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50, 'ZIP contém fechamento');
  return arquivos;
}

test('divergência de agenda não bloqueia XLSX de realizado, mas bloqueia exportação que inclui agenda', async () => {
  const linha = linhaPCP(), mapa = mapaValido();
  const { w, alertas } = portal({ mapa, carga: true, linhas: [linha] });
  const agenda = w.pgEventosAgendaMapaLinha(linha, hoje, 50, '2026-10-20');
  assert.equal(agenda.conciliacao.motivo, 'quantidade-nao-concilia-tiragem-agendada');
  assert.equal(w.pgStatusMapaTP().disponivel, true);
  assert.equal(w.pgStatusAgendaTP().disponivel, false);
  assert.equal(w.pgTPExportacaoPronta(), true);
  assert.deepEqual(alertas, [], 'exportação sem agenda não exibe falha genérica de carregamento');

  const coletado = w.pgSomaEventosTP(w.pgEventosTPLinha(linha, 'coleta', hoje, 80, linha.Coleta_TP), hoje);
  const entregue = w.pgSomaEventosTP(w.pgEventosTPLinha(linha, 'entrega', hoje, 80, linha.Entrega_TP), hoje);
  assert.equal(coletado, 80);
  assert.equal(entregue, 80);
  const blob = w.pgGerarExcelAuditoria({ cabecalho: ['SKU', 'Tiragem total', 'Coletado TP', 'Entregue Geral'],
    linhas: [[linha.SKU_REAL, linha.TIRAGEM, coletado, entregue]] });
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const arquivos = await arquivosXlsx(blob), xml = arquivos.get('xl/worksheets/sheet1.xml');
  assert.ok(arquivos.has('[Content_Types].xml'));
  assert.ok(arquivos.has('xl/workbook.xml'));
  assert.match(xml, /<c r="A2"[^>]*>.*?<t[^>]*>SKU-1<\/t>/);
  assert.match(xml, /<c r="B2"[^>]*><v>200<\/v><\/c>/);
  assert.match(xml, /<c r="C2"[^>]*><v>80<\/v><\/c>/);
  assert.match(xml, /<c r="D2"[^>]*><v>80<\/v><\/c>/);

  assert.equal(w.pgTPExportacaoPronta({ agenda: true }), false);
  assert.equal(alertas.length, 1);
  assert.match(alertas[0], /quantidades.*PCP.*mapa.*conciliam/i);
  assert.doesNotMatch(alertas[0], /nao puderam ser carregados/i);
});

test('os três botões XLSX do Armazém baixam bases completas com o gate real apesar da divergência de agenda', async () => {
  const linha = { ...linhaPCP(), _ROW_ID: 'PCP:2', ID: 2, UNIDADE: 'COC',
    'GRÁFICA': 'FORMA CERTA', SKU: 'SKU-1', CD_FINAL: 'CD JDI', 'CD DESTINO': 'CD JDI',
    serie_corrigida: '1º ANO', 'SÉRIE': '1º ANO', TIPO: 'ALUNO',
    'Coleta/Internalização de estoque final (re) plan': '2026-10-14' };
  const { w, downloads, alertas } = portalArmazem(linha, mapaValido());
  const divergente = w.pgEventosAgendaMapaLinha(linha, hoje, 50, '2026-10-20');
  assert.equal(divergente.conciliacao.motivo, 'quantidade-nao-concilia-tiragem-agendada');
  assert.equal(w.pgStatusAgendaTP().disponivel, false);
  const casos = [
    ['pgMAExportarAuditoria', 'pgMAObterAuditoria', /Meta_Armazem_Base_Auditavel.*\.xlsx$/],
    ['pgMAExportarAuditoriaRealizado', 'pgMAObterAuditoriaRealizado', /Meta_Armazem_Realizado_Auditavel.*\.xlsx$/],
    ['pgMAExportarAuditoriaColetas', 'pgMAObterAuditoriaColetas', /Meta_Armazem_Coletas_Auditavel.*\.xlsx$/]
  ];
  const letraColuna = numero => {
    let letra = '';
    for (numero++; numero; numero = Math.floor((numero - 1) / 26))
      letra = String.fromCharCode(65 + (numero - 1) % 26) + letra;
    return letra;
  };
  for (const [exportar, obterBase, nomeEsperado] of casos) {
    const botao = { textContent: 'Baixar Excel (.xlsx)', disabled: false }, base = w[obterBase]();
    assert.equal(base.linhas.length, 1, 'mantém uma linha auditável do item');
    await w[exportar](botao);
    const download = downloads.at(-1);
    assert.ok(download, 'botão gerou download de XLSX');
    assert.match(download.nome, nomeEsperado);
    assert.equal(botao.disabled, false);
    assert.equal(botao.textContent, 'Baixar Excel (.xlsx)');
    const arquivos = await arquivosXlsx(download.blob), xml = arquivos.get('xl/worksheets/sheet1.xml');
    assert.ok(arquivos.has('xl/styles.xml'));
    for (const [coluna, esperado] of [['Tiragem total', 200], ['Entregue Geral', 80],
      ['Entregue armazém', 80], ...(exportar === 'pgMAExportarAuditoriaRealizado' ? [] : [['Coletado TP', 80]])]) {
      const indice = base.cabecalho.indexOf(coluna);
      assert.ok(indice >= 0, coluna + ' consta na base exportada');
      assert.equal(base.linhas[0][indice], esperado);
      assert.match(xml, new RegExp('<c r="' + letraColuna(indice) + '2"[^>]*><v>' + esperado + '<\\/v><\\/c>'));
    }
    assert.match(xml, /SKU-1/);
    assert.match(xml, /1º ANO/);
  }
  assert.equal(downloads.length, 3);
  assert.deepEqual(alertas, []);
  assert.equal(w.pgStatusAgendaTP().disponivel, false, 'a exportação não mascara a divergência da agenda');
});

test('carga não iniciada ou em andamento bloqueia exportação até confirmação de mapa válido', () => {
  for (const carga of [undefined, false]) {
    const { w, alertas } = portal({ mapa: mapaValido(), carga });
    assert.equal(w.pgStatusMapaTP().disponivel, false);
    assert.equal(w.pgTPExportacaoPronta(), false);
    assert.equal(w.pgTPExportacaoPronta({ agenda: true }), false);
    assert.equal(alertas.length, 2);
    assert.match(alertas[0], /carreg|conclu/i);
    w.PG_MAPA_TP_CARGA_CONCLUIDA = true;
    assert.equal(w.pgTPExportacaoPronta(), true);
    assert.equal(alertas.length, 2);
  }
});

test('payload inválido, erro de leitura e Forecast não conferido exibem o motivo real', () => {
  const casos = [
    { mapa: null, motivo: /mapa|dados/i },
    { mapa: [], motivo: /mapa|dados/i },
    { mapa: 'invalido', motivo: /mapa|dados/i },
    { mapa: {}, motivo: /mapa|parcelas|dados/i },
    { mapa: { ...mapaValido(), __erroAgendaTP: 'Falha ao ler o cache do mapa' }, motivo: /Falha ao ler o cache do mapa/i },
    { mapa: { ...mapaValido(), _ERRO_CRITICO: 'Cache do mapa indisponível' }, motivo: /Cache do mapa indisponível/i },
    { mapa: { ...mapaValido(), __forecastTP: { conferido: false, erro: 'Forecast sem permissão' } }, motivo: /Forecast/i }
  ];
  for (const { mapa, motivo } of casos) {
    const { w, alertas } = portal({ mapa, carga: true });
    assert.equal(w.pgStatusMapaTP().disponivel, false);
    assert.equal(w.pgTPExportacaoPronta(), false);
    assert.equal(alertas.length, 1);
    assert.match(alertas[0], motivo);
  }
  const { w, alertas } = portal({ mapa: mapaValido(), carga: true });
  w.PG_MAPA_TP_ERRO = 'Serviço do mapa temporariamente indisponível';
  assert.equal(w.pgTPExportacaoPronta(), false);
  assert.match(alertas[0], /Serviço do mapa temporariamente indisponível/i);
});

test('loader compartilha chamada concorrente, rejeita payload de erro e recupera na segunda tentativa', async () => {
  const anterior = congelarMapa(mapaValido());
  const { w, requisicoes } = portal({ mapa: anterior, carga: true });
  const primeira = w.pgCarregarMapaTPCache(), concorrente = w.pgCarregarMapaTPCache();
  assert.equal(primeira, concorrente);
  assert.equal(requisicoes.length, 1, 'uma única leitura enquanto a resposta está pendente');
  assert.equal(w.PG_MAPA_TP_CARGA_CONCLUIDA, false);
  assert.equal(w.pgTPExportacaoPronta(), false);
  requisicoes[0].sucesso({ _ERRO_CRITICO: 'Cache em reconstrução' });
  await proximoTurno();
  assert.equal(requisicoes.length, 2);
  assert.equal(w.MAPA_SAIDA_CACHE, anterior, 'resposta inválida não substitui nem modifica a evidência anterior');
  const atual = mapaValido();
  requisicoes[1].sucesso(atual);
  assert.equal(await primeira, atual);
  assert.equal(await concorrente, atual);
  assert.equal(w.MAPA_SAIDA_CACHE, atual);
  assert.equal(w.PG_MAPA_TP_CARGA_CONCLUIDA, true);
  assert.ok(!w.PG_MAPA_TP_ERRO);
  assert.equal(w.pgTPExportacaoPronta(), true);
  assert.equal(await w.pgCarregarMapaTPCache(), atual);
  assert.equal(requisicoes.length, 2, 'reutiliza resultado válido já carregado');
});

test('duas falhas de transporte preservam o mapa anterior, bloqueiam exports e permitem nova tentativa', async () => {
  const anterior = congelarMapa(mapaValido());
  const { w, requisicoes, alertas } = portal({ mapa: anterior, carga: true });
  const primeira = w.pgCarregarMapaTPCache();
  const rejeitada = assert.rejects(primeira, /Falha temporária 2/);
  assert.equal(w.pgCarregarMapaTPCache(), primeira);
  requisicoes[0].falha(new Error('Falha temporária 1'));
  await proximoTurno();
  assert.equal(requisicoes.length, 2);
  requisicoes[1].falha(new Error('Falha temporária 2'));
  await rejeitada;
  await proximoTurno();
  assert.equal(requisicoes.length, 2, 'cada invocação encerra após duas tentativas');
  assert.equal(w.MAPA_SAIDA_CACHE, anterior);
  assert.equal(anterior.__erroAgendaTP, undefined);
  assert.equal(w.pgStatusMapaTP().disponivel, false);
  assert.equal(w.pgTPExportacaoPronta(), false, 'mapa antigo não libera exportação após falha de atualização');
  assert.match(alertas.at(-1), /Falha temporária 2/);

  const nova = w.pgCarregarMapaTPCache();
  assert.notEqual(nova, primeira, 'falha não deixa uma promise rejeitada permanente');
  assert.equal(requisicoes.length, 3);
  const atual = mapaValido();
  requisicoes[2].sucesso(atual);
  assert.equal(await nova, atual);
  assert.equal(w.MAPA_SAIDA_CACHE, atual);
  assert.ok(!w.PG_MAPA_TP_ERRO);
  assert.equal(w.pgTPExportacaoPronta(), true);
});

test('retornos de sucesso sem contrato válido também encerram com erro e permitem recarregar', async () => {
  for (const invalido of [null, {}, { ...mapaValido(), __erroAgendaTP: 'Erro lógico do cache' },
    { ...mapaValido(), __forecastTP: { conferido: false, erro: 'Forecast indisponível' } }]) {
    const anterior = congelarMapa(mapaValido());
    const { w, requisicoes } = portal({ mapa: anterior, carga: true });
    const tentativa = w.pgCarregarMapaTPCache();
    const rejeitada = assert.rejects(tentativa);
    requisicoes[0].sucesso(invalido);
    await proximoTurno();
    assert.equal(requisicoes.length, 2);
    requisicoes[1].sucesso(invalido);
    await rejeitada;
    assert.equal(w.MAPA_SAIDA_CACHE, anterior);
    assert.equal(w.pgTPExportacaoPronta(), false);
    const nova = w.pgCarregarMapaTPCache();
    assert.equal(requisicoes.length, 3);
    const atual = mapaValido();
    requisicoes[2].sucesso(atual);
    assert.equal(await nova, atual);
    assert.equal(w.pgTPExportacaoPronta(), true);
  }
});

test('primeira carga malsucedida sem mapa anterior mantém o diagnóstico e a agenda disponíveis para inspeção', async () => {
  const { w, requisicoes } = portal();
  const tentativa = w.pgCarregarMapaTPCache(), rejeitada = assert.rejects(tentativa, /Mapa sem permissão/);
  requisicoes[0].falha(new Error('Mapa sem permissão'));
  await proximoTurno();
  requisicoes[1].falha(new Error('Mapa sem permissão'));
  await rejeitada;
  assert.equal(w.MAPA_SAIDA_CACHE, undefined);
  const diagnostico = await w.pgDiagnosticoTP();
  assert.equal(diagnostico.parcelasDisponiveis, false);
  assert.equal(diagnostico.erroCargaParcelas, 'Mapa sem permissão');
  assert.match(diagnostico.avisoAgendado, /Mapa sem permissão/);
  const linha = linhaPCP();
  w.dadosGlobais = [linha];
  const agenda = w.pgEventosAgendaMapaLinha(linha, hoje, 50, '2026-10-20');
  assert.equal(agenda.conciliacao.modo, 'indisponivel');
  assert.equal(agenda.conciliacao.motivo, 'parcelas-indisponiveis');
  assert.equal(w.pgTPExportacaoPronta(), false);
});

test('erro de atualização da tela não mascara a falha de transporte nem impede a próxima leitura', async () => {
  const { w, requisicoes } = portal({ mapa: mapaValido(), carga: true });
  w.pgAtualizarDatasTPDoMapa = () => { throw new Error('Falha da interface'); };
  const original = new Error('Falha original do mapa');
  const tentativa = w.pgCarregarMapaTPCache();
  const rejeitada = assert.rejects(tentativa, erro => erro === original);
  requisicoes[0].falha(original);
  await proximoTurno();
  requisicoes[1].falha(original);
  await rejeitada;
  assert.equal(w.PG_MAPA_TP_ERRO, original.message);
  const nova = w.pgCarregarMapaTPCache();
  assert.notEqual(nova, tentativa);
  assert.equal(requisicoes.length, 3);
  const atual = mapaValido();
  requisicoes[2].sucesso(atual);
  assert.equal(await nova, atual);
  assert.equal(w.pgTPExportacaoPronta(), true);
});

test('gate de agenda confere a base antes do primeiro cálculo e revalida quantidade corrigida sem falha antiga', () => {
  const linha = linhaPCP(), { w, alertas } = portal({ mapa: mapaValido(), carga: true, linhas: [linha] });
  assert.equal(w.pgTPExportacaoPronta({ agenda: true }), false, 'primeira exportação descobre a divergência sem depender da curva');
  assert.match(alertas.at(-1), /quantidades.*PCP.*mapa.*conciliam/i);
  linha['TIRAGEM AGENDADA'] = 60;
  assert.equal(w.pgTPExportacaoPronta({ agenda: true }), true, 'quantidade corrigida na mesma referência não conserva a falha antiga');
  assert.equal(w.pgStatusAgendaTP().disponivel, true);
  w.dadosGlobais = [{ ...linha, 'TIRAGEM AGENDADA': 55 }];
  assert.equal(w.pgTPExportacaoPronta({ agenda: true }), false, 'troca da base exige conferir os novos valores');
  w.dadosGlobais = [{ ...linha }];
  assert.equal(w.pgTPExportacaoPronta({ agenda: true }), true, 'nova base conciliada libera exportação');
  assert.equal(w.pgStatusAgendaTP().disponivel, true);
});
