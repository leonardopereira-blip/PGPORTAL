const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'abaMetaArmazem.html'), 'utf8');
const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];

const item = (marca, total, previsto, coletadoTP, realCD, extra = {}) => ({
  marca, grafica: 'GRÁFICA A', serie: '1º ANO', total, previsto, coletadoTP, realCD,
  pos: total - previsto, semData: 0, real: realCD, ...extra
});
function portal(items) {
  const controls = {}, labels = [{}, {}, {}], draws = [], downloads = [], alerts = [];
  const element = () => ({value: '', textContent: '', innerHTML: '', scrollLeft: 0,
    classList: {toggle() {}, add() {}, remove() {}}, setAttribute() {}, querySelectorAll: () => []});
  const w = {pgMAUltimosItens: items, pgMAVisaoAtual: {itens: items, marcador: 'base completa',
    auditoria: {nome: 'Base completa', cenario: 'com', cabecalho: ['Marca'], linhas: items.map(i => [i.marca])}},
    devicePixelRatio: 1, localStorage: {getItem: () => null, setItem() {}}, alert: m => alerts.push(m)};
  const document = {getElementById(id) {return controls[id] || (controls[id] = element());},
    querySelectorAll: s => s === '[data-ma-percent-label]' ? labels : [],
    createElement(tag) {
      if (tag === 'a') return {click() {downloads.push(this.download);}};
      assert.equal(tag, 'canvas');
      return {getContext: () => ({scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        fillText(text) {draws.push(text);}}), toDataURL: () => 'data:image/png;base64,dGVzdA=='};
    }};
  vm.runInNewContext(script, {window: w, document, console, dtHojeISO: '2026-10-23'});
  const render = modo => w.pgMAMatrizModo(modo || 'marcaSerie');
  const faixa = (tipo, min, max) => {
    const sufixo = {previsao: 'Previsao', coletas: 'Coletas', realizado: 'Realizado'}[tipo];
    document.getElementById('maPercentualMin' + sufixo).value = min == null ? '' : String(min);
    document.getElementById('maPercentualMax' + sufixo).value = max == null ? '' : String(max);
    w.pgMAFiltrarPercentual(tipo);
  };
  const nomes = tipo => Array.from(w.pgMAMatrizesSnapshot[tipo].linhas, l => l.nome);
  return {w, controls, labels, draws, downloads, alerts, render, faixa, nomes};
}

test('limites são estritos como no Funil; placeholders vazios incluem 0% e 100%', () => {
  const p = portal([item('ZERO', 100, 0, 0, 0), item('MEIO', 100, 50, 50, 50), item('TOTAL', 100, 100, 100, 100)]);
  p.render();
  assert.deepEqual(p.nomes('previsao').sort(), ['MEIO', 'TOTAL', 'ZERO']);
  p.faixa('previsao', 0, 100);
  assert.deepEqual(p.nomes('previsao'), ['MEIO']);
  p.faixa('previsao', 50, null);
  assert.deepEqual(p.nomes('previsao'), ['TOTAL']);
  p.faixa('previsao', null, 50);
  assert.deepEqual(p.nomes('previsao'), ['ZERO']);
  p.faixa('previsao', 80, 20);
  assert.deepEqual(p.nomes('previsao'), []);
  assert.match(p.controls.maMatriz.innerHTML, /Nenhuma linha na faixa/);
  assert.doesNotMatch(p.controls.maMatriz.innerHTML, /TOTAL GERAL/);
});

test('três quadros usam percentuais próprios sem alterar base, KPIs ou outras matrizes', () => {
  const items = [item('PREV', 100, 80, 20, 10), item('COL', 100, 20, 90, 30), item('ENT', 100, 50, 50, 90)];
  const p = portal(items), original = JSON.stringify(items), base = p.w.pgMAVisaoAtual;
  const auditoria = JSON.stringify(p.w.pgMAObterAuditoria());
  p.controls.maKPIs = {innerHTML: 'KPIs completos'};
  p.render();
  for (const tipo of ['previsao', 'coletas', 'realizado']) p.faixa(tipo, 60, null);
  assert.deepEqual(p.nomes('previsao'), ['PREV']);
  assert.deepEqual(p.nomes('coletas'), ['COL']);
  assert.deepEqual(p.nomes('realizado'), ['ENT']);
  assert.equal(p.w.pgMAMatrizesSnapshot.previsao.total[0].previsto, 80);
  assert.equal(p.w.pgMAMatrizesSnapshot.coletas.total[0].coletadoTP, 90);
  assert.equal(p.w.pgMAMatrizesSnapshot.realizado.total[0].realCD, 90);
  assert.equal(p.w.pgMAVisaoAtual, base);
  assert.equal(p.w.pgMAUltimosItens, items);
  assert.equal(JSON.stringify(p.w.pgMAObterAuditoria()), auditoria);
  assert.equal(JSON.stringify(items), original);
  assert.equal(p.controls.maKPIs.innerHTML, 'KPIs completos');
});

test('TOTAL GERAL pondera apenas as séries dentro da faixa e oculta as demais células', () => {
  const p = portal([item('A', 100, 100, 30, 10), item('A', 100, 0, 30, 10, {serie: '2º ANO'}),
    item('B', 300, 240, 150, 90), item('C', 100, 10, 0, 0)]);
  p.render(); p.faixa('previsao', 40, null);
  const m = p.w.pgMAMatrizesSnapshot.previsao;
  assert.deepEqual(p.nomes('previsao').sort(), ['A', 'B']);
  assert.equal(m.total[0].total, 400);
  assert.equal(m.total[0].previsto, 340);
  assert.equal(100 * m.total[0].previsto / m.total[0].total, 85);
  const a = m.linhas.find(l => l.nome === 'A');
  assert.equal(a.celulas[1].previsto / a.celulas[1].total, 1);
  assert.equal(a.celulas[2].total, 0, 'não mantém a série fora da faixa');
  assert.equal(a.total.total, 100, 'recalcula o total da marca pela série aceita');
  assert.equal(p.w.pgMAMatrizSnapshot, m, 'compatibilidade do snapshot da previsão');
});

test('0% traz marca com serie zerada mesmo que seu total original seja maior', () => {
  const p = portal([item('A', 100, 100, 80, 70),
    item('A', 200, 0, 0, 0, {serie: '2º ANO'}),
    item('B', 300, 150, 0, 0)]);
  p.render(); p.faixa('previsao', null, 0);
  const m = p.w.pgMAMatrizesSnapshot.previsao;
  assert.deepEqual(p.nomes('previsao'), ['A']);
  assert.equal(m.linhas[0].celulas[1].total, 0, 'a serie 100% some');
  assert.equal(m.linhas[0].celulas[2].total, 200, 'a serie 0% permanece');
  assert.equal(m.linhas[0].total.previsto, 0);
  assert.equal(m.total[0].total, 200);
  assert.equal(m.total[0].previsto, 0);
  assert.match(p.controls.maMatriz.innerHTML, /0%/);
});

test('OUTROS filtra cada serie escondida antes de recompor o total ponderado', () => {
  const p = portal([item('A', 100, 100, 0, 0, {serie: '1º ANO'}),
    item('A', 100, 0, 0, 0, {serie: 'EXTENSIVO'}),
    item('A', 300, 240, 30, 20, {serie: 'SEMI'}),
    item('B', 200, 200, 0, 0)]);
  p.render(); p.faixa('previsao', null, 0);
  let m = p.w.pgMAMatrizesSnapshot.previsao;
  assert.deepEqual(p.nomes('previsao'), ['A']);
  const outros = m.colunas.findIndex(c => c.nome === 'OUTROS');
  assert.ok(outros >= 0, 'serie secundaria agrupada');
  assert.equal(m.linhas[0].celulas[outros].total, 100);
  assert.equal(m.total[0].total, 100);
  p.w.pgMAAlternarOutros();
  m = p.w.pgMAMatrizesSnapshot.previsao;
  const extensivo = m.colunas.findIndex(c => c.nome === 'EXTENSIVO');
  const semi = m.colunas.findIndex(c => c.nome === 'SEMI');
  assert.equal(m.linhas[0].celulas[extensivo].total, 100);
  assert.equal(m.linhas[0].celulas[semi].total, 0);
  assert.equal(m.total[0].total, 100, 'expandir nao duplica tiragem');
});

test('faixa exata aceita extremos e quadros continuam independentes', () => {
  const p = portal([item('A', 100, 0, 100, 0),
    item('A', 100, 100, 0, 100, {serie: '2º ANO'})]);
  p.render();
  p.faixa('previsao', 0, 0);
  p.faixa('coletas', 100, 100);
  p.faixa('realizado', 100, 100);
  assert.equal(p.w.pgMAMatrizesSnapshot.previsao.total[0].total, 100);
  assert.equal(p.w.pgMAMatrizesSnapshot.previsao.total[0].previsto, 0);
  assert.equal(p.w.pgMAMatrizesSnapshot.coletas.total[0].total, 100);
  assert.equal(p.w.pgMAMatrizesSnapshot.coletas.total[0].coletadoTP, 100);
  assert.equal(p.w.pgMAMatrizesSnapshot.realizado.total[0].total, 100);
  assert.equal(p.w.pgMAMatrizesSnapshot.realizado.total[0].realCD, 100);
});

test('limites aceitam decimais e vírgula, ignoram entradas inválidas e não arredondam antes do filtro', () => {
  const p = portal([item('DECIMAL', 10000, 9999, 0, 0), item('INTEIRO', 100, 100, 0, 0), item('FRACAO', 1000, 504, 0, 0)]);
  p.render(); p.faixa('previsao', '50,3', 100);
  assert.deepEqual(p.nomes('previsao').sort(), ['DECIMAL', 'FRACAO']);
  p.faixa('previsao', 99.95, 100);
  assert.deepEqual(p.nomes('previsao'), ['DECIMAL']);
  for (const invalido of [-1, 101, 'abc']) {
    p.faixa('previsao', invalido, invalido);
    assert.equal(p.nomes('previsao').length, 3);
  }
});

test('troca de modo mantém faixa e filtra total da gráfica; expansão mantém as séries sem duplicar total', () => {
  const p = portal([item('A', 100, 100, 10, 10), item('B', 100, 0, 90, 90, {grafica: 'GRÁFICA B', serie: 'VARIOS'}),
    item('A', 100, 50, 50, 50, {serie: 'EXTENSIVO'})]);
  p.render(); p.faixa('previsao', 40, null);
  p.render('graficaMarca');
  assert.deepEqual(p.nomes('previsao'), ['GRÁFICA A']);
  assert.ok(p.labels.every(l => l.textContent === '% TOTAL DA GRÁFICA'));
  assert.equal(p.w.pgMAMatrizesSnapshot.previsao.total[0].total, 200);
  p.render('marcaSerie'); p.w.pgMAAlternarOutros();
  assert.deepEqual(p.nomes('previsao'), ['A']);
  assert.equal(p.w.pgMAMatrizesSnapshot.previsao.total[0].total, 200);
  assert.ok(p.labels.every(l => l.textContent === '% TOTAL DA MARCA'));
  assert.ok(Array.from(p.w.pgMAMatrizesSnapshot.previsao.colunas, c => c.nome).includes('EXTENSIVO'));
});

test('Limpar restaura apenas o controle do quadro escolhido', () => {
  const p = portal([item('A', 100, 80, 10, 10), item('B', 100, 10, 80, 80)]);
  p.render(); p.faixa('previsao', 60, 100); p.faixa('coletas', 60, 100);
  p.w.pgMAFiltrarPercentual('previsao', true);
  assert.equal(p.controls.maPercentualMinPrevisao.value, '');
  assert.equal(p.controls.maPercentualMaxPrevisao.value, '');
  assert.equal(p.controls.maPercentualMinColetas.value, '60');
  assert.equal(p.nomes('previsao').length, 2);
  assert.deepEqual(p.nomes('coletas'), ['B']);
});

test('PNG de cada quadro captura seu recorte e não captura linhas escondidas', () => {
  const p = portal([item('PREV', 100, 80, 20, 10), item('COL', 100, 20, 90, 30), item('ENT', 100, 50, 50, 90)]);
  p.render();
  for (const tipo of ['previsao', 'coletas', 'realizado']) p.faixa(tipo, 60, null);
  for (const [tipo, nome, outros] of [['previsao', 'PREV', ['COL', 'ENT']], ['coletas', 'COL', ['PREV', 'ENT']], ['realizado', 'ENT', ['PREV', 'COL']]]) {
    p.draws.length = 0;
    p.w.pgMACapturarMatriz(tipo);
    assert.ok(p.draws.includes(nome), tipo);
    assert.ok(p.draws.includes('TOTAL GERAL'));
    for (const outro of outros) assert.ok(!p.draws.includes(outro), tipo + ' não inclui ' + outro);
  }
  assert.equal(p.downloads.length, 3);
  p.faixa('realizado', 100, null); p.w.pgMACapturarMatriz('realizado');
  assert.equal(p.downloads.length, 3);
  assert.match(p.alerts.at(-1), /não tem dados/);
});

test('falha de conciliação limpa os três snapshots e impede captura anterior', () => {
  const p = portal([item('A', 100, 50, 50, 50)]);
  p.render(); assert.equal(p.nomes('previsao').length, 1);
  p.w.dadosGlobais = [];
  p.w.pgUnirTotalSemDuplicidade = () => {throw new Error('Dados indisponíveis');};
  p.w.processarMetaArmazem();
  assert.equal(p.w.pgMAMatrizesSnapshot, null);
  assert.equal(p.w.pgMAMatrizSnapshot, null);
  assert.equal(p.w.pgMAVisaoAtual, null);
  assert.equal(p.w.pgMAUltimosItens.length, 0);
  p.w.pgMAFiltrarPercentual('coletas');
  p.w.pgMAMatrizModo('marca');
  for (const tipo of ['previsao', 'coletas', 'realizado']) assert.equal(p.nomes(tipo).length, 0);
  p.w.pgMACapturarMatriz('coletas');
  assert.equal(p.downloads.length, 0);
  assert.match(p.controls.maAviso.textContent, /Dados indisponíveis/);
});
