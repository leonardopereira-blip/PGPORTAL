const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hoje = '2026-11-11';
const dataMapa = '2026-11-01';
const dataManual = '2026-11-05';
const plan = 'Coleta/Internalização de estoque final (re) plan';
const linha = (n, extra = {}) => ({
  _SOURCE: 'PCP', _PG_TP_LINHA: n, _ROW_ID: 'PCP:' + n, Chave: 'OP:' + n,
  MARCA_FINAL: 'SAS BRADESCO', UNIDADE: 'SAS BRADESCO', GRAFICA_FINAL: 'LOGPRINT',
  'GRÁFICA': 'LOGPRINT', 'GRÁFICA_MAPA': 'LOGPRINT', SKU_REAL: 'SKU-' + n, SKU: 'SKU-' + n,
  ENVIO: 'V1', 'SÉRIE': '1 ANO', CD_MAPA: 'CD JDI', CD_FINAL: 'CD JDI', 'CD DESTINO': 'CD JDI',
  TIRAGEM: 100, 'TIRAGEM A ENTREGAR (total por CD)': 100,
  'TIRAGEM COLETADA': 100, 'TIRAGEM AGENDADA': 0, Coleta_TP: dataManual, Entrega_TP: dataManual,
  'TIRAGEM VENCIDA': 100, DT_Vencido: '2026-10-30', [plan]: '2026-10-30', ...extra
});
const movimento = (r, n, volume, extra = {}) => ({
  eventoTPVersao: 1, linhaMapa: n, codigoMapa: 'MP-' + n,
  marca: r.MARCA_FINAL, grafica: r.GRAFICA_FINAL, sku: r.SKU_REAL,
  destino: r._SOURCE === 'ACABADORA' ? r['CD DESTINO'] : r.CD_MAPA, envio: r.ENVIO,
  volumeColetado: volume, coletaTP: dataMapa, entregaTP: dataMapa, ...extra
});

// Executa os motores completos. Apenas DOM, pintura e chamadas externas são simulados.
function portal(rows, events = []) {
  const marcas = [...new Set(rows.map(r => r.UNIDADE))].map(value => ({value, checked: true}));
  const controls = {filtroReferencia: {value: 'replan'}, pgFiltroOrigem: {value: 'TODOS'},
    pgFiltroDestino: {value: 'CD', disabled: false}};
  const element = () => ({style: {}, classList: {add() {}, remove() {}}, appendChild() {}, addEventListener() {}});
  const w = {dadosGlobais: rows,
    MAPA_SAIDA_CACHE: {__agendaTPCompleta: true, __forecastTP: {conferido: true}, key: events},
    PG_MAPA_TP_CARGA_CONCLUIDA: true, console: {info() {}, warn() {}, error() {}},
    arredondar: v => Math.round(Number(v) || 0), formatarBR: String,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    performance: {now: () => 0}, addEventListener() {}, dispatchEvent() {}, Event: class {},
    document: {getElementById: id => controls[id] || null, querySelector: () => null,
      querySelectorAll: selector => selector === '.chk-geral-Marca:checked' ? marcas.filter(c => c.checked)
        : selector === '.chk-geral-Marca' ? marcas : [],
      addEventListener() {}, createElement: element, body: element(), head: element()}};
  w.window = w;
  vm.createContext(w);
  for (const name of ['Scripts_Eventos_TP.html', 'Scripts_Conclusao_SKU.html', 'Scripts_Globais_2.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script, w, {filename: name});
  }
  vm.runInContext(`dtHojeISO='${hoje}';dtHoje=new Date('${hoje}T12:00:00');`, w);
  w.pgAtualizarAbaProducao = () => {};
  w.listasMultiProducao = {Marca: new Set(marcas.map(c => c.value))};
  w.filtrosGeraisIniciados = true;
  w.aplicarFiltros();
  return {w, controls, selecionar(origem, destino = 'CD') {
    controls.pgFiltroOrigem.value = origem;
    controls.pgFiltroDestino.value = destino;
    w.aplicarFiltros();
  }};
}
const parcelas = eventos => Array.from(eventos, e => [e.data, e.volume]);

test('SAS Bradesco preserva mapa e completa coleta manual no Funil, fases e cortes históricos', () => {
  const r = linha(2);
  const {w} = portal([r], [movimento(r, 20, 70)]);
  const antes = JSON.stringify(r);
  const v = w.pgVolumesColetaUnificadosV37(r);
  assert.deepEqual(parcelas(v.eventosColetaTP), [[dataMapa, 70], [dataManual, 30]]);
  assert.equal(v.eventosColetaTP.conciliacao.modo, 'mesclado');
  assert.equal(v.eventosColetaTP.conciliacao.volumeComplementarPCP, 30);
  assert.equal(v.coleta, 100);
  assert.equal(w.pgVolumesColetaUnificadosV37(r, '2026-11-03').coleta, 70);
  assert.equal(w.getVolFase(r, {id: 'col_tp'}, 100), 100);
  const resumo = w.pgObterResumoColeta();
  assert.equal(resumo.realizado, 100);
  assert.equal(resumo.total, 100);
  assert.equal(resumo.backlogAtual, 0);
  assert.equal(resumo.marcas['SAS BRADESCO'].realizado, 100);
  assert.equal(resumo.dias.get(dataMapa).real, 70);
  assert.equal(resumo.dias.get(dataManual).real, 30);
  assert.equal(w.pgConclusaoSKUColeta(r, '2026-11-03').concluido, false);
  assert.equal(w.pgConclusaoSKUColeta(r, hoje).concluido, true);
  assert.equal(w.pgConclusaoSKUColeta(r, hoje).dataConfirmacaoColeta, dataManual);
  assert.equal(JSON.stringify(r), antes, 'o complemento não grava valores nas fontes');
});

test('PC e acabadora de outra marca conciliam origem, marca e total sem inflar CD', () => {
  const sas = linha(2);
  const pc = linha(3, {MARCA_FINAL: 'PC', UNIDADE: 'PC', TIRAGEM: 120,
    'TIRAGEM COLETADA': 120, 'TIRAGEM VENCIDA': 120});
  const transferencia = linha(4, {MARCA_FINAL: 'COC', UNIDADE: 'COC', CD_MAPA: 'HR',
    CD_FINAL: 'HR', 'CD DESTINO': 'HR', TIRAGEM: 90, 'TIRAGEM COLETADA': 90});
  const acab = linha(5, {_SOURCE: 'ACABADORA', _ROW_ID: 'ACABADORA:5',
    MARCA_FINAL: 'COC', UNIDADE: 'COC', GRAFICA_FINAL: 'HR', 'GRÁFICA': 'HR',
    'GRÁFICA_MAPA': 'HR', 'GRÁFICA DE ORIGEM': 'LOGPRINT', TIRAGEM: 90,
    'TIRAGEM A ENTREGAR (total por CD)': 90, 'TIRAGEM COLETADA': 90, 'TIRAGEM VENCIDA': 90});
  const rows = [sas, pc, transferencia, acab];
  const app = portal(rows, rows.map((r, i) => movimento(r, 20 + i, 20)));
  const {w} = app;
  assert.deepEqual(Array.from(w.dadosBaseTPPortal), [sas, pc, acab]);
  assert.deepEqual(Array.from(w.dadosTotalCanonico), [sas, pc, acab]);
  assert.deepEqual(Array.from(w.pgREBaseEtapasCD(rows)), [sas, pc, acab]);
  const resumo = w.pgObterResumoColeta();
  assert.equal(resumo.total, 310);
  assert.equal(resumo.realizado, 310);
  assert.equal(resumo.marcas.PC.realizado, 120);
  assert.equal(resumo.marcas.COC.realizado, 90, 'CD não soma a transferência para a acabadora');
  assert.equal(Object.values(resumo.marcas).reduce((s, r) => s + r.realizado, 0), resumo.realizado);
  w.checkOnlyGeral('Marca', 'PC');
  assert.equal(w.pgObterResumoColeta().realizado, 120);
  assert.deepEqual(Array.from(w.dadosTotalCanonico), [pc]);
  w.checkAllGeral('Marca', true);
  app.selecionar('ACABADORA');
  assert.deepEqual(Array.from(w.dadosBaseTPPortal), [acab]);
  assert.equal(w.pgObterResumoColeta().realizado, 90);
  app.selecionar('GRAFICA');
  assert.deepEqual(Array.from(w.dadosBaseTPPortal), [sas, pc]);
  assert.equal(w.pgObterResumoColeta().realizado, 220);
});

test('auditorias por ponto, planilha e XLSX exportam o mesmo complemento sem duplicar parcelas', () => {
  const r = linha(2);
  const {w} = portal([r], [movimento(r, 20, 70)]);
  const resumo = w.pgObterResumoColeta();
  const visao = {resumo, pontos: ['2026-11-03'], inicio: '2026-11-01', fim: '2026-11-03', acumulado: true};
  assert.equal(w.pgMontarAuditoriaPontoColetaV56(visao, 0, 'real').totais.real, 70);
  const atual = {...visao, pontos: [hoje], fim: hoje};
  assert.equal(w.pgMontarAuditoriaPontoColetaV56(atual, 0, 'real').totais.real, 100);
  let pacote;
  w.reCriarSheets = (nome, abas) => { pacote = abas[0]; };
  w.pgExportarVisaoCompletaV37('2026-11-03', 'Coleta manual', null, resumo);
  const coluna = pacote.cabecalho.indexOf('Realizado');
  assert.equal(pacote.linhas[0][coluna], 70);
  assert.equal(pacote.linhas.at(-1)[coluna], 70);
  assert.equal(pacote.linhas.length, 2, 'uma linha física mais o rodapé');
  const xlsx = w.pgMontarAuditoriaCompletaXlsxV57(atual);
  const real = xlsx.abas[1].linhas.find(r => r[1] === 'Coletado acumulado até corte');
  assert.equal(real[2], 100);
});

test('quantidade manual menor prevalece na data PCP sem alterar entrega ou agenda', () => {
  const r = linha(2, {'TIRAGEM COLETADA': 80});
  const {w} = portal([r], [movimento(r, 20, 120)]);
  const v = w.pgVolumesColetaUnificadosV37(r);
  assert.deepEqual(parcelas(v.eventosColetaTP), [[dataManual, 80]]);
  assert.equal(v.eventosColetaTP.conciliacao.motivo, 'coleta-manual-pcp');
  assert.equal(w.pgVolumesColetaUnificadosV37(r, '2026-11-03').coleta, 0);
  assert.equal(v.entrega, 0, 'a divergência não autoriza alterar a regra de entrega');
  assert.equal(v.agendado, 0);
  assert.equal(v.mapa, 80);
});

test('complemento usa AN total e não antecipa parcelas futuras ou sem data', () => {
  const r = linha(2, {TIRAGEM: 150, 'TIRAGEM COLETADA': 150});
  const events = [movimento(r, 20, 70), movimento(r, 21, 30, {coletaTP: '2026-11-20'}),
    movimento(r, 22, 20, {coletaTP: null})];
  const {w} = portal([r], events);
  const v = w.pgVolumesColetaUnificadosV37(r);
  assert.deepEqual(parcelas(v.eventosColetaTP), [[dataMapa, 70], [dataManual, 30]]);
  assert.equal(v.coleta, 100, 'os 50 já presentes no mapa continuam pendentes');
  assert.equal(v.eventosColetaTP.conciliacao.volumeComplementarPCP, 30);
  assert.equal(w.pgConclusaoSKUColeta(r, hoje).concluido, false);
});

test('falta de data válida, data futura e volume zero não geram complemento', () => {
  for (const extra of [{Coleta_TP: ''}, {Coleta_TP: '2026-02-30'},
    {Coleta_TP: '2026-11-20'}, {'TIRAGEM COLETADA': 0}]) {
    const r = linha(2, extra);
    const {w} = portal([r], [movimento(r, 20, 70)]);
    assert.equal(w.pgVolumesColetaUnificadosV37(r).coleta, 0, JSON.stringify(extra));
  }
});
