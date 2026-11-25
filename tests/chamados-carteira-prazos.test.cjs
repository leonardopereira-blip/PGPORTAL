const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'abaCentralChamados.html'), 'utf8');
const pure = html.split('// CH_OKR_PURE_BEGIN')[1].split('// CH_OKR_PURE_END')[0];
const ctx = vm.createContext({ Intl, Date });
vm.runInContext(pure + ';this.rules={chDeadlineBucket,chDeadlineCounts,chDeadlineLabel,chDeliveryDate,chFinalForecast,chTodaySP,chFilteredTotals,chDestinationRows,chDeadlineSummary,chOwnerForPrinter,chResponsible};', ctx);
const rules = ctx.rules;
const stages = (p = '', r = '') => Array.from({ length: 12 }, () => ({ p, r, a: '', f: 'PCP' }));
const target = deadline => ({ deadline, dates: Array(12).fill(deadline), next: deadline, nextStage: 3 });
const group = (cd, deadline, qty = 10) => ({ printer: 'Gráfica A', cd, qty, mapped: 0, picked: 0,
  delivered: 0, balance: qty, coverage: Array(12).fill(0), target: target(deadline), stages: stages(),
  eta: '2026-11-27', partial: false, production: [{ label: 'Em produção', qty }] });
const ticket = (id, deadline, overrides = {}) => ({ id, n: id, status: 'ALOCADO', cat: 'REENTRADA',
  shipment: 'V1', brand: 'SAS', owner: 'Analista', created: '2026-10-28', target: target(deadline),
  groups: [group('CD JDI', deadline)], totals: { qty: 10, mapped: 0, picked: 0, delivered: 0,
    balance: 10, coverage: Array(12).fill(0) }, production: [{ label: 'Em produção', qty: 10 }],
  stages: stages(), eta: '2026-11-27', partial: false, ...overrides });

test('faixas de prazo usam entrega final, hoje SP e semanas de segunda a domingo', () => {
  const today = '2026-11-24';
  for (const [deadline, expected] of [['2026-11-23', 'backlog'], ['2026-11-24', 'today'],
    ['2026-11-25', 'week'], ['2026-11-29', 'week'], ['2026-11-30', 'next'],
    ['2026-12-06', 'next'], ['2026-12-07', '']]) {
    const t = ticket('A', deadline, { eta: '2030-01-01', target: { ...target(deadline), next: '2026-11-01' } });
    assert.equal(rules.chDeadlineBucket(t, today), expected);
  }
  assert.equal(rules.chDeadlineBucket(ticket('A', '2026-11-30'), '2026-11-29'), 'next');
  assert.equal(rules.chDeadlineBucket(ticket('A', '2026-11-30'), '2026-11-30'), 'today');
  assert.equal(rules.chDeadlineBucket(ticket('A', '2026-12-06'), '2026-11-30'), 'week');
  assert.equal(rules.chDeadlineBucket(ticket('A', '2027-01-03'), '2026-12-28'), 'week');
  assert.equal(rules.chDeadlineBucket(ticket('A', '2027-01-04'), '2026-12-28'), 'next');
  assert.equal(rules.chTodaySP(Date.parse('2026-11-24T01:30:00Z')), '2026-11-23');
  assert.equal(rules.chTodaySP(Date.parse('2026-11-24T03:00:00Z')), '2026-11-24');
});

test('somente cancelamento ou entrega integral comprovada retiram o chamado das faixas', () => {
  const base = ticket('A', '2026-11-20');
  assert.equal(rules.chDeadlineBucket({ ...base, status: 'CONCLUÍDO', closed: '2026-11-21' }, '2026-11-24'), 'backlog');
  assert.equal(rules.chDeadlineBucket({ ...base, status: 'CANCELADO' }, '2026-11-24'), '');
  assert.equal(rules.chDeadlineBucket({ ...base, canceled: '2026-11-23' }, '2026-11-24'), '');
  assert.equal(rules.chDeadlineBucket({ ...base, delivered: '2026-11-23', totals: { ...base.totals, delivered: 5 } }, '2026-11-24'), 'backlog');
  assert.equal(rules.chDeadlineBucket({ ...base, delivered: '2026-11-23', totals: { ...base.totals, delivered: 10 } }, '2026-11-24'), '');
  const routes = [{ qty: 5, delivery: '2026-11-21' }, { qty: 5, delivery: '' }];
  assert.equal(rules.chDeadlineBucket({ ...base, okrRoutes: routes }, '2026-11-24'), 'backlog');
  assert.equal(rules.chDeadlineBucket({ ...base, okrRoutes: [routes[0], { qty: 5, delivery: '2026-11-23' }] }, '2026-11-24'), '');
  assert.equal(rules.chDeliveryDate({ ...base, okrRoutes: [{ qty: 10, delivery: '2026-11-25' }] }, '2026-11-24'), '');
  assert.equal(rules.chDeliveryDate({ ...base, okrRoutes: [{ qty: 10, delivery: '2026-10-01' }] }, '2026-11-24'), '');
  assert.equal(rules.chDeadlineBucket({ ...base, target: null }, '2026-11-24'), '');
  assert.equal(rules.chDeadlineLabel({ ...base, target: null }, '2026-11-24'), 'Sem prazo');
});

test('conta cada chamado uma vez, preserva metas por etapa e não fabrica datas reais ao filtrar', () => {
  const g1 = group('CD JDI', '2026-11-24'), g2 = group('CD FOR', '2026-11-24');
  g1.stages = stages('2026-11-20', '2026-11-19');
  g2.stages = stages('2026-11-22', '');
  const t = ticket('A', '2026-11-24', { groups: [g1, g2], totals: { qty: 20, coverage: Array(12).fill(0) } });
  assert.deepEqual(JSON.parse(JSON.stringify(rules.chDeadlineCounts([t, t, ticket('B', '2026-11-23')], '2026-11-24'))),
    { backlog: 1, today: 1, week: 0, next: 0 });
  const scoped = rules.chFilteredTotals(t, { cd: ['CD JDI', 'CD FOR'] });
  assert.equal(scoped.target.dates[3], '2026-11-24');
  assert.equal(scoped.stages[3].p, '2026-11-22');
  assert.equal(scoped.stages[3].r, '', 'uma rota real não comprova a etapa inteira de outra rota');
  const jdi = rules.chFilteredTotals(t, { cd: 'CD JDI' });
  assert.equal(jdi.stages[3].r, '2026-11-19');
  const legacy = rules.chFilteredTotals({ ...t, groups: [Object.fromEntries(Object.entries(g1).filter(([k]) => k !== 'stages'))] }, { cd: 'CD JDI' });
  assert.equal(legacy.stages[3].p, '');
  assert.equal(legacy.stages[3].r, '');
});

function viewHarness(rows) {
  const fixed = Date.parse('2026-11-24T17:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }
  const elements = new Map();
  const events = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', innerHTML: '', textContent: '', tagName: 'SELECT',
      selectedOptions: [{ text: 'Categoria' }], options: [], hidden: false,
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, fn) { if (id === 'ch-central') events.push({ type, fn }); },
      querySelectorAll() { return []; }, setAttribute() {} });
    return elements.get(id);
  }
  element('ch-scope').value = 'ativos'; element('ch-by').value = 'cat'; element('ch-query').tagName = 'INPUT';
  const sandbox = vm.createContext({ Date: Clock, Intl, console, window: {},
    document: { getElementById: element }, google: { script: { run: {} } } });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\}\)\(\);\s*$/, 'window.testUI={state,render,renderDetail,renderItems,itemHtml};})();');
  vm.runInContext(script, sandbox);
  const ui = sandbox.window.testUI;
  ui.state.data = { rows, now: '2026-01-01T00:00:00Z', phases: Array.from({ length: 12 }, (_, i) => 'Etapa ' + i),
    manual: {}, links: {}, states: [], gen: 'G' };
  return { ui, elements, click(button) { events.filter(e => e.type === 'click').forEach(e => e.fn({ target: { closest: name => name === 'button' ? button : null } })); } };
}

test('renderiza prazos sem Saldo/Tratativa, previsão final ao lado da entrega e filtra cards sem duplicar destinos', () => {
  const a = ticket('101', '2026-11-24', { groups: [group('CD JDI', '2026-11-24'), group('CD FOR', '2026-11-24')],
    totals: { qty: 20, mapped: 0, picked: 0, delivered: 0, balance: 20, coverage: Array(12).fill(0) }, partial: true });
  const b = ticket('102', '2026-11-23');
  const h = viewHarness([a, b]); h.ui.render();
  const cards = h.elements.get('ch-deadline-cards').innerHTML;
  assert.match(cards, /Backlog<\/small><b>1<\/b>/);
  assert.match(cards, /Vence hoje<\/small><b>1<\/b>/);
  assert.match(h.elements.get('ch-deadline-selection').textContent, /24\/11\/2026/, 'usa o relógio atual, não a data do JSON');
  assert.match(h.elements.get('ch-count').textContent, /2 chamados · 3 destinos/);
  const table = h.elements.get('ch-table').innerHTML;
  assert.match(table, /Data de entrega<\/th><th rowspan="2">Previsão final de entrega<\/th><th rowspan="2">Prazo final \(25 dias\)/);
  assert.equal((table.match(/colspan="4"/g)||[]).length,12);
  assert.equal((table.match(/>Data acordada \/ formalizada<\/th>/g)||[]).length,12);
  assert.match(table, /Próxima etapa<\/th><th class="ch-date-head" colspan="4" scope="colgroup">Etapa 0/);
  assert.equal((table.match(/class="ch-date-cell/g)||[]).length,3*48);
  assert.match(h.elements.get('ch-deadline-summary').innerHTML,/Backlog<\/td><td>1<\/td><td>50,0%<\/td><td>10<\/td><td>33,3%/);
  assert.doesNotMatch(table, /<th>Saldo<\/th>|<th>Tratativa<\/th>/);
  assert.doesNotMatch(h.elements.get('ch-kpis').innerHTML + h.elements.get('ch-dist').innerHTML, /Saldo/i);
  assert.match(table, /27\/11\/2026/, 'previsão final operacional continua visível');
  const button = { dataset: { deadline: 'today' }, hasAttribute: key => key === 'data-deadline' };
  h.click(button);
  assert.equal(h.ui.state.deadline, 'today');
  assert.match(h.elements.get('ch-count').textContent, /1 chamados · 2 destinos/);
  assert.doesNotMatch(h.elements.get('ch-table').innerHTML, /#102/);
  assert.equal((h.elements.get('ch-table').innerHTML.match(/>Vence hoje<\/span>/g) || []).length, 2);
  assert.match(h.elements.get('ch-kpis').innerHTML, /Chamados<\/small><b>1<\/b>/);
  h.click(button);
  assert.equal(h.ui.state.deadline, '');
  assert.match(h.elements.get('ch-count').textContent, /2 chamados · 3 destinos/);
});

test('detalhe do SKU distingue metas, previsão e real sem inventar data nem exibir Saldo', () => {
  const h = viewHarness([]), it = { sku: 'SKU', printer: 'Gráfica A', cd: 'CD JDI', qty: 10,
    mapped: 5, picked: 0, delivered: 0, desc: 'Livro', target: target('2026-11-24'),
    eta: '', etaPartial: true, stages: stages('2026-11-22', ''), spg: [], cal: [], pcp: [], maps: [] };
  const detail = h.ui.itemHtml(it);
  assert.match(detail, /Data segura \(calculada\)<\/th><th>Data acordada \/ formalizada<\/th><th>Previsão da etapa<\/th><th>Real da etapa/);
  assert.match(detail, /24\/11\/2026<\/td><td><span title="Estimativa: sem acordo identificado">22\/11\/2026<\/span><\/td><td>22\/11\/2026<\/td><td>Sem registro real<\/td>/);
  assert.match(detail, /Previsão final de entrega<\/dt><dd>—<\/dd>/);
  assert.match(detail, /previsão e real vêm das fontes/);
  assert.doesNotMatch(detail, /Saldo/i);
  h.ui.state.detail = { items: [it] }; h.ui.renderItems();
  assert.doesNotMatch(h.elements.get('ch-items').innerHTML, /saldo/i);
});

test('detalhe do chamado deriva previsão dos itens pendentes e entrega real apenas quando todos comprovam', () => {
  const h = viewHarness([]);
  const item = (delivered, eta, real) => ({ qty: 10, delivered, eta, stages: stages('', real) });
  const model = { ...ticket('103', '2026-11-24'), items: [item(10, '2030-01-01', '2026-11-21'),
    item(0, '2026-11-27', ''), item(0, '', '')], steps: {}, panel: [], costs: [], orders: [] };
  delete model.eta; delete model.partial; delete model.delivered; delete model.okrRoutes;
  assert.deepEqual(JSON.parse(JSON.stringify(rules.chFinalForecast(model))), { date: '2026-11-27', partial: true });
  assert.equal(rules.chDeliveryDate(model, '2026-11-24'), '');
  h.ui.state.detail = model; h.ui.renderDetail();
  assert.match(h.elements.get('ch-detail').innerHTML, /Data de entrega<\/dt><dd>—<\/dd>/);
  assert.match(h.elements.get('ch-detail').innerHTML, /Previsão final de entrega<\/dt><dd>27\/11\/2026 · parcial<\/dd>/);
  model.items = [item(10, '', '2026-11-21'), item(10, '', '2026-11-24')];
  h.ui.renderDetail();
  assert.match(h.elements.get('ch-detail').innerHTML, /Data de entrega<\/dt><dd>24\/11\/2026<\/dd>/);
  assert.match(h.elements.get('ch-detail').innerHTML, /Previsão final de entrega<\/dt><dd>—<\/dd>/);
  model.items[1].stages[11].r = '';
  assert.equal(rules.chDeliveryDate(model, '2026-11-24'), '', 'volume sem data real não inventa entrega');
});

test('resumo soma tiragem sem repetir chamado e preserva denominadores e ordenação',()=>{
 const a=ticket('A','2026-11-23'),b=ticket('B','2026-11-24',{totals:{qty:30}}),c=ticket('C','2026-12-10');
 const r=rules.chDeadlineSummary([a,a,b,c],'2026-11-24');
 assert.equal(r[0].tickets,1);assert.equal(r[0].qty,10);assert.equal(r[0].qtyPct,0.2);
 assert.equal(r.at(-1).tickets,3);assert.equal(r.at(-1).qty,50);
 assert.ok(html.indexOf('id="ch-funnel"')<html.indexOf('id="ch-dist"'));
 assert.ok(html.indexOf('id="ch-dist"')<html.indexOf('id="ch-deadline-cards"'));
 assert.ok(html.indexOf('id="ch-deadline-cards"')<html.indexOf('id="ch-deadline-summary"'));
 assert.ok(html.indexOf('id="ch-deadline-summary"')<html.indexOf('id="ch-table"'));
});
test('acordo não substitui previsão, meta nem real e só consolida rotas com compromisso',()=>{
 const a=group('CD JDI','2026-11-24'),b=group('CD FOR','2026-11-24');
 a.stages[0].agreed='2026-11-20';b.stages[0].agreed='2026-11-21';
 const t=ticket('A','2026-11-24',{groups:[a,b]});
 assert.equal(rules.chFilteredTotals(t,{cd:['CD JDI','CD FOR']}).stages[0].agreed,'2026-11-21');
 delete b.stages[0].agreed;
 assert.equal(rules.chFilteredTotals(t,{cd:['CD JDI','CD FOR']}).stages[0].agreed,'');
 const h=viewHarness([t]);h.ui.render();assert.match(h.elements.get('ch-table').innerHTML,/20\/11\/2026/);
});

test('responsável PG usa o cadastro histórico inclusive em 09/11 e V2 a partir de 10/11',()=>{
 const cases=[
 ['WALPRINT','João Alberti','Klayton'],['REPROSET','Klayton','Amanda Costa'],
 ['LEOGRAF','João Alberti','Matheus Jesus'],['MARGRAF','Klayton','Matheus Jesus'],
 ['BERCROM','Amanda Costa','Amanda EZ'],['FORMA CERTA','Elis','Amanda EZ'],
 ['OCEANO','Matheus','Amanda EZ'],['ATHOS','Matheus','Amanda EZ'],
 ['FELK','Elis','Amanda EZ'],['STAR-7','Matheus','Matheus Jesus'],
 ['FTD','João Alberti','Amanda Costa'],['SÃO FRANCISCO','Elis','Elis'],
 ['EMBALART','Elis','Elis'],['PITFER','Elis','Elis']
 ];
 for(const [printer,oldOwner,newOwner] of cases){
  assert.equal(rules.chOwnerForPrinter(printer,'2026-11-09','REENTRADA'),oldOwner,printer);
  assert.equal(rules.chOwnerForPrinter(printer,'2026-11-10','REENTRADA'),newOwner,printer);
 }
 assert.equal(rules.chOwnerForPrinter('IPSIS','2026-11-09','REENTRADA'),'Klayton');
 assert.equal(rules.chOwnerForPrinter('IPSIS','2026-11-10','REENTRADA'),'João Alberti');
 for(const date of ['2026-11-09','2026-11-10','']){
  assert.equal(rules.chOwnerForPrinter('',''+date,'INCLUSIVOS'),'Klayton');
  assert.equal(rules.chOwnerForPrinter('DESCONHECIDA',date,'REENTRADA'),'João Alberti');
 }
});
test('responsável PG da carteira é por gráfica/destino, sem utilizar responsável SPG',()=>{
 const a=group('CD JDI','2026-11-24'),b=group('CD FOR','2026-11-24');
 a.printer='WALPRINT';b.printer='REPROSET';
 const t=ticket('105','2026-11-24',{created:'2026-11-10',owner:'Não usar SPG',groups:[a,b]});
 assert.equal(rules.chResponsible(t),'Klayton | Amanda Costa');
 const rows=rules.chDestinationRows(t);
 assert.equal(rules.chResponsible(rows.find(r=>r.cd==='CD JDI')),'Klayton');
 assert.equal(rules.chResponsible(rows.find(r=>r.cd==='CD FOR')),'Amanda Costa');
 const h=viewHarness([t]);h.ui.render();
 const html=h.elements.get('ch-table').innerHTML;
 assert.match(html,/>Klayton<\/td>/);assert.match(html,/>Amanda Costa<\/td>/);
 assert.doesNotMatch(html,/Não usar SPG/);
});
