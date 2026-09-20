const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const code = source.slice(source.indexOf('window.pgFaixaPlan ='), source.indexOf('function processarFalhasPlan()'));

function context(mode = 'fase') {
  const elements = {};
  const rows = [-1, 0, 1, -4, null].map((df, i) => ({
    df, TIRAGEM: (i + 1) * 10, 'TIRAGEM VENCIDA': [7, 0, 0, 25, 0][i],
    Data_Coleta_Mapa: df === null ? '' : '2026-09-' + String(14 + df).padStart(2, '0'),
    plan: df === null ? '' : '2026-09-' + String(14 + df).padStart(2, '0')
  }));
  const c = vm.createContext({ window: { arredondar: Number, formatarBR: String,
    dadosGlobais: rows,
    pgCompilarFiltrosExtras: () => (l, opcoes = {}) => opcoes.ignorarOrigem || l.origem !== 'ACABADORA' },
    document: { getElementById: id => elements[id] ||= { value: id === 'selFasePlan' ? mode : 'ref', innerHTML: '' } },
    dtHoje: new Date(2026, 8, 14), dtHojeISO: '2026-09-14', dadosGlobais: rows, dadosFiltrados: rows.slice(0, 2),
    FASES: [{ id: mode }], belongsToPhase: () => true, dataFoiPreenchida: () => false,
    getCols: () => ({ plan: 'plan' }), calcAtraso: r => r.df === null ? null : Math.max(0, -r.df),
    extrairDataISO: value => value
  });
  vm.runInContext(code, c);
  return { c, elements };
}

test('janelas se sobrepoem as semanas e respeitam seus limites', () => {
  const { c } = context();
  const hoje = new Date(2026, 8, 17);
  for (const [df, semana, janela] of [[-11,'bRet',null],[-10,'bPas',null],[-4,'bPas',null],
    [-3,'bAtu','bRec'],[-1,'bAtu','bRec'],[0,'pAtu','pRec'],[2,'pAtu','pRec'],
    [3,'pAtu','pRec'],[4,'pPrx',null],[9,'pPrx',null],[10,'pPrx',null],[11,'pLon',null]]) {
    assert.deepEqual(JSON.parse(JSON.stringify(c.window.pgFaixaPlan(df, hoje))), { semana, janela });
  }
});

test('domingo pertence a semana da segunda anterior, inclusive quando hoje e domingo', () => {
  const { c } = context();
  assert.equal(c.window.pgFaixaPlan(-1, new Date(2026, 8, 14)).semana, 'bPas');
  assert.equal(c.window.pgFaixaPlan(0, new Date(2026, 8, 20)).semana, 'pAtu');
  assert.equal(c.window.pgFaixaPlan(1, new Date(2026, 8, 20)).semana, 'pPrx');
});

for (const mode of ['fase', 'col']) test('contagem por semana e janela em linhas e totais: ' + mode, () => {
  const { c, elements } = context(mode);
  c.renderTabelaPlan();
  for (const id of ['tabelaPlanGrafica', 'tabelaPlanMarca', 'tabelaPlan', 'tfootPlanGrafica', 'tfootPlanMarca', 'tfootPlan']) {
    const cells = [...elements[id].innerHTML.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    const buckets = cells.slice(-9).map(match => {
      const volume = match[1].match(/<div class="font-black[^>]*>(\d+)<\/div>/);
      const count = match[1].match(/>(\d+) skus<\/div>/);
      return volume ? [Number(volume[1]), Number(count[1])] : [0, 0];
    });
    assert.deepEqual(buckets, [[50,1],[0,0],[50,2],[0,0],[10,1],[50,2],[50,2],[0,0],[0,0]], id);
  }
});

test('visao backlog respeita filtro de origem', () => {
  const { c, elements } = context('fase');
  c.renderTabelaPlan();
  assert.doesNotMatch(elements.tfootPlan.innerHTML, /50 skus/);
});

for (const mode of ['col_mapa']) test('backlog coleta usa vencida menos AZ e data mapa, mesmo com fase preenchida: ' + mode, () => {
  const { c, elements } = context(mode);
  c.window.dadosGlobais = [
    { TIRAGEM: 1000, 'TIRAGEM VENCIDA': 100, GIRO_COLETADA_AZ: 80, Data_Coleta_Mapa: '2026-09-13', plan: '2026-10-01' },
    { TIRAGEM: 1000, 'TIRAGEM VENCIDA': 100, GIRO_COLETADA_AZ: 120, Data_Coleta_Mapa: '2026-09-13' },
    { TIRAGEM: 1000, 'TIRAGEM VENCIDA': 100, GIRO_COLETADA_AZ: 100, Data_Coleta_Mapa: '2026-09-13' }
  ];
  c.dataFoiPreenchida = () => true;
  c.renderTabelaPlan();
  for (const id of ['tabelaPlanGrafica', 'tabelaPlanMarca', 'tabelaPlan', 'tfootPlanGrafica', 'tfootPlanMarca', 'tfootPlan']) {
    const html = elements[id].innerHTML;
    assert.equal((html.match(/>20<\/div>/g) || []).length, 2, id);
    assert.equal((html.match(/>1 skus<\/div>/g) || []).length, 2, id);
    assert.doesNotMatch(html, />1000<\/div>/);
  }
});

function buckets(html) {
  return [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].slice(-9).map(m => {
    const v = m[1].match(/<div class="font-black[^>]*>(\d+)<\/div>/);
    const n = m[1].match(/>(\d+) skus<\/div>/);
    return v ? [Number(v[1]), Number(n[1])] : [0, 0];
  });
}

test('Coleta Mapa separa backlog por data mapa e pipeline por replan, inclusive sem data mapa', () => {
  const { c, elements } = context('col_mapa');
  const replan = 'Coleta/Internalização de estoque final (re) plan';
  c.window.dadosGlobais = [
    { TIRAGEM: 1000, 'TIRAGEM VENCIDA': 100, GIRO_COLETADA_AZ: 80, Data_Coleta_Mapa: '2026-09-13', [replan]: '2026-09-15', plan: '2026-10-01' },
    { TIRAGEM: 500, 'TIRAGEM VENCIDA': 0, GIRO_COLETADA_AZ: 0, [replan]: '2026-09-22', plan: '2026-09-01' },
    { TIRAGEM: 300, 'TIRAGEM VENCIDA': 50, GIRO_COLETADA_AZ: 10, Data_Coleta_Mapa: '2026-09-01', [replan]: '2026-09-10' }
  ];
  c.renderTabelaPlan();
  for (const id of ['tabelaPlanGrafica', 'tabelaPlanMarca', 'tabelaPlan', 'tfootPlanGrafica', 'tfootPlanMarca', 'tfootPlan']) {
    assert.deepEqual(buckets(elements[id].innerHTML), [[0,0],[40,1],[20,1],[0,0],[20,1],[1000,1],[1000,1],[500,1],[0,0]], id);
  }
});

test('saldo zero não cria linhas vazias em Coleta Mapa', () => {
  const { c, elements } = context('col_mapa');
  c.window.dadosGlobais = [{ TIRAGEM: 100, 'TIRAGEM VENCIDA': 50, GIRO_COLETADA_AZ: 50, Data_Coleta_Mapa: '2026-09-01' }];
  c.renderTabelaPlan();
  assert.match(elements.tabelaPlanGrafica.innerHTML, /Nenhum registro/);
  assert.equal(elements.tfootPlanGrafica.innerHTML, '');
});

test('Coleta PCP mantém exclusão de fase concluída, sem regra de saldo do mapa', () => {
  const { c, elements } = context('col');
  c.dataFoiPreenchida = () => true;
  c.renderTabelaPlan();
  assert.match(elements.tabelaPlanGrafica.innerHTML, /Nenhum registro/);
});

test('cabeçalhos abreviados, # e aliases vazios preservam os saldos dos exemplos', () => {
  const { c, elements } = context('col_mapa');
  c.window.dadosGlobais = [
    { TIRAGEM: 18240, 'Tiragem Venc.': 18240, GIRO_COLETADA_AZ: '', '# TIRAGEM COLETADA': 18150, Data_Coleta_Mapa: '2026-07-25' },
    { TIRAGEM: 28850, 'Tiragem Vencido': 28850, '# TIRAGEM COLETADA': 18150, Data_Coleta_Mapa: '2026-07-25' },
    { TIRAGEM: 1280, 'Tiragem Vencida': 1280, '# TIRAGEM COLETADA': 1403, Data_Coleta_Mapa: '2026-09-04' }
  ];
  c.renderTabelaPlan();
  for (const id of ['tabelaPlanGrafica', 'tabelaPlanMarca', 'tabelaPlan', 'tfootPlanGrafica', 'tfootPlanMarca', 'tfootPlan']) {
    assert.deepEqual(buckets(elements[id].innerHTML), [[0,0],[10790,2],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]], id);
  }
});

test('cabeçalhos reais Triagem Vencida e TIRAGEM COLETADA calculam backlog dos prints', () => {
  const { c, elements } = context('col_mapa');
  c.window.dadosGlobais = [
    { 'GRÁFICA': 'A', TIRAGEM: 18240, 'Triagem Vencida': 18240, 'TIRAGEM COLETADA': 18150, Data_Coleta_Mapa: '2026-07-25' },
    { 'GRÁFICA': 'B', TIRAGEM: 28850, 'Triagem Vencida': 28850, 'TIRAGEM COLETADA': 18150, Data_Coleta_Mapa: '2026-07-25' },
    { 'GRÁFICA': 'C', TIRAGEM: 1280, 'Triagem Vencida': 1280, 'TIRAGEM COLETADA': 1403, Data_Coleta_Mapa: '2026-09-04' }
  ];
  c.renderTabelaPlan();
  assert.match(elements.tabelaPlanGrafica.innerHTML, />90<\/div>/);
  assert.match(elements.tabelaPlanGrafica.innerHTML, />10700<\/div>/);
  assert.equal(buckets(elements.tfootPlanGrafica.innerHTML)[1][0], 10790);
  assert.equal(buckets(elements.tfootPlanMarca.innerHTML)[1][0], 10790);
  assert.doesNotMatch(elements.tabelaPlanGrafica.innerHTML, />C<\/td>/);
});
