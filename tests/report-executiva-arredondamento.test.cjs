const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const helper = fonte.match(/window\.pgREPercentualExibido = function\(valor\) \{[\s\S]*?\n\};/);
assert.ok(helper, 'Função única de arredondamento da Report Executiva');

const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(helper[0], ctx);
const exibir = ctx.window.pgREPercentualExibido;

test('percentual usa arredondamento matemático comum, sem ultrapassar 100%', () => {
  for (const [bruto, exibido] of [
    [0, 0], [0.01, 0], [0.49, 0], [0.5, 1],
    [86, 86], [86.0001, 86], [86.49, 86], [86.5, 87],
    [86.99, 87], [99.01, 99], [99.5, 100],
    [100, 100], [100.01, 100], [-1, 0], [NaN, 0]
  ]) {
    assert.equal(exibir(bruto), exibido, String(bruto));
  }
  assert.match(fonte, /Math\.round\(Math\.max\(0, Math\.min\(100, n\)\)\)/);
});

test('tabela, curva e tooltip usam o mesmo percentual exibido', () => {
  assert.match(fonte, /const pctTxt = v => \x60\$\{window\.pgREPercentualExibido\(v\)\}%\x60;/);
  assert.match(fonte, /const txt = \x60\$\{window\.pgREPercentualExibido\(valor\)\}%\x60;/);
  assert.match(fonte, /window\.pgREPercentualExibido\(context\.raw\)/);
  assert.equal(exibir(86.5), 87);
});

test('bolinhas de status seguem os percentuais exibidos', () => {
  assert.match(fonte, /const realExibido = window\.pgREPercentualExibido\(real\);/);
  assert.match(fonte, /const planExibido = window\.pgREPercentualExibido\(plan\);/);
});

test('cálculos e dados brutos da curva continuam sem arredondamento', () => {
  assert.match(fonte, /metaPct\.push\(total > 0 \? Math\.min\(100, \(meta \/ total\) \* 100\) : 0\);/);
  assert.match(fonte, /const pct = \(n, d\) => \{/);
  assert.match(fonte, /return Math\.max\(0, Math\.min\(100, \(Number\(n \|\| 0\) \/ d\) \* 100\)\);/);
});

test('Report Executiva usa D-1 apenas para planejados, mantendo títulos e realizados', () => {
  assert.match(fonte, /const cortePlanejadoRE = diaAnteriorReV57;/);
  assert.match(fonte, /tRef, hojeIso, chaveLinha, cortePlanejadoRE/);
  assert.match(fonte, /const dias = dtPlan \? calcDiffDiasISO\(dtPlan, cortePlanejadoRE\) : null;\s*linhasKitReportAuditoriaPortal/);
  assert.match(fonte, /const dias = dtPlan \? calcDiffDiasISO\(dtPlan, cortePlanejadoRE\) : null;\s*const volumePlan/);
  assert.match(fonte, /pgVolumesColetaUnificadosV37\(l, hojeIso\)/);
  assert.match(fonte, /thEntCD\.textContent = \x60Coleta \(Plan\. \$\{fmtData\(hojeIso\)\}\)\x60/);
});

test('acabamento preserva realizado de hoje, mas calcula plano pelo corte opcional D-1', () => {
  const trecho = fonte.match(/window\.pgMetricasAcabamentoRealV46 = function\([\s\S]*?\n\};/);
  assert.ok(trecho);
  const rows = [{TIRAGEM: 100, ACAB_REAL: '2026-10-23', PLAN: '2026-10-20'}];
  const app = {window: {
    dadosAcabamentoOrigem: rows,
    arredondar: v => v,
    pgEhFonteAcabadora: () => false,
    pgDataPlanoFaseFunil: l => l.PLAN
  }, FASES: [{id: 'acab', colReal: 'ACAB_REAL'}],
    getKey: () => 'A', belongsToPhase: () => true,
    extrairDataISO: v => v, dataFoiPreenchida: () => true,
    calcDiffDiasISO: (dt, hoje) =>
      (Date.parse(hoje + 'T12:00:00Z') - Date.parse(dt + 'T12:00:00Z')) / 86400000};
  vm.runInNewContext(trecho[0], app);
  const atual = app.window.pgMetricasAcabamentoRealV46('replan', '2026-10-23', () => 'A');
  const d1 = app.window.pgMetricasAcabamentoRealV46('replan', '2026-10-23', () => 'A', '2026-10-22');
  assert.equal(atual.total.plan, 100);
  assert.equal(d1.total.plan, 0);
  assert.equal(d1.total.real, 100);
});
