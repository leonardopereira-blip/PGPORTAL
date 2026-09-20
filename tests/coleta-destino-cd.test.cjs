const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source.slice(source.indexOf('window.pgCampoColeta ='), source.indexOf('window.pgObterResumoColeta =')), context);
vm.runInContext(source.slice(source.indexOf('window.pgCalcularColetaFunil ='), source.indexOf('window.extrairColetaFunilDia =')), context);
const norm = source.slice(source.indexOf('    function pgNorm(v)'), source.indexOf('    function pgCasaGrafica('));
vm.runInContext("const PG_ACABADORAS = ['ANTILHAS', 'FELK', 'HR', 'ATHOS', 'EMBALARTE'];" + norm, context);
const w = context.window;
const plan = 'Coleta/Internalização de estoque final (re) plan';
const row = (destino, extra = {}) => ({ _SOURCE: 'PCP', 'CD DESTINO': destino, TIRAGEM: 100, [plan]: '2026-09-20', ...extra });

test('destinos e característica excluídos, com exceção SAS ADAPT na UNIDADE', () => {
  for (const d of ['ATHOS', 'FELK', 'HR', 'EMBALARTE', 'ANTILHAS', 'Fornecedor Acabamento']) {
    assert.equal(w.pgEhDestinoAcabadora(row(d)), true, d);
  }
  assert.equal(w.pgEhDestinoAcabadora(row('CD', { 'CARACTERÍSTICA DA SOLICITAÇÃO': 'Envio para Acabadora' })), true);
  assert.equal(w.pgEhDestinoAcabadora(row('ATHOS', { UNIDADE: ' sas adapt ', 'CARACTERÍSTICA DA SOLICITAÇÃO': 'Acabadora' })), false);
  assert.equal(w.pgEhDestinoAcabadora(row('ATHOS', { 'DESCRIÇÃO': 'SAS ADAPT' })), true);
  assert.equal(w.pgEhDestinoAcabadora(row('CD')), false);
});

test('curva soma as três rotas com denominador PCP integral e replan da acabadora', () => {
  const direta = row('CD', { TIRAGEM: 9303681 });
  const sas = row('ATHOS', { UNIDADE: 'SAS ADAPT', TIRAGEM: 1124752 });
  const excluida = row('FELK', { TIRAGEM: 14863118 });
  const acab = row('CD', { _SOURCE: 'ACABADORA', TIRAGEM: 1117226, [plan]: '2026-09-25', 'DATA LIMITE DE COLETA': '2026-10-30' });
  const base = [direta, sas, excluida, acab];
  const resumo = w.pgCalcularColetaFunil(base, base, '2026-09-30', { destinoCD: true, denominador: base });
  assert.equal(resumo.total, 25291551);
  assert.equal(resumo.esperadoHoje, 11545659);
  assert.equal(Math.round(resumo.esperadoHoje / resumo.total * 100), 46);
  assert.equal(resumo.registros.length, 3);
  assert.equal(resumo.registros.find(r => r.linha === acab).dtPlan, '2026-09-25');
});

test('acabadora sem replan não recebe data limite como substituta', () => {
  const acab = row('CD', { _SOURCE: 'ACABADORA', [plan]: '', 'DATA LIMITE DE COLETA': '2026-09-01' });
  const resumo = w.pgCalcularColetaFunil([acab], [acab], '2026-09-30', { destinoCD: true, denominador: [row('CD')] });
  assert.equal(resumo.esperadoHoje, 0);
  assert.equal(resumo.semPlano, 100);
});

for (const destinoCD of [false, true]) test('origem separa planejamento e realizado de gráfica e acabadora, destino CD=' + destinoCD, () => {
  const graf = row('CD', { TIRAGEM: 100, 'TIRAGEM COLETADA': 20, Data_Coleta_Mapa: '2026-09-01' });
  const acab = row('CD', { _SOURCE: 'ACABADORA', TIRAGEM: 60, 'TIRAGEM COLETADA': 15, Data_Coleta_Mapa: '2026-09-02' });
  const base = [graf, acab];
  for (const [origem, volume, realizado, linha] of [['GRAFICA', 100, 20, graf], ['ACABADORA', 60, 15, acab]]) {
    const resumo = w.pgCalcularColetaFunil(base, base, '2026-09-30', { origem, destinoCD, denominador: [graf] });
    assert.equal(resumo.esperadoHoje, volume);
    assert.equal(resumo.realizado, realizado);
    assert.equal(resumo.registros.length, 1);
    assert.equal(resumo.registros[0].linha, linha);
    assert.equal(resumo.total, destinoCD ? 100 : volume);
  }
  const todas = w.pgCalcularColetaFunil(base, base, '2026-09-30', { origem: 'TODOS', destinoCD, denominador: [graf] });
  assert.equal(todas.total, 100);
  assert.equal(todas.esperadoHoje, destinoCD ? 160 : 100);
});

test('trocar origem invalida cache do resumo mesmo com as mesmas bases', () => {
  let origem = 'GRAFICA', chamadas = 0;
  const local = vm.createContext({ dtHojeISO: '2026-09-30', document: { getElementById: id => ({ value: id === 'pgFiltroOrigem' ? origem : 'TODOS' }) },
    window: { dadosBaseColetaFunil: [], dadosGlobais: [], dadosDenominadorColeta: [],
      pgCalcularColetaFunil: (base, todas, hoje, opcoes) => ({ origem: opcoes.origem, chamada: ++chamadas }) } });
  vm.runInContext(source.slice(source.indexOf('window.pgObterResumoColeta ='), source.indexOf('window.pgCalcularColetaFunil =')), local);
  assert.equal(local.window.pgObterResumoColeta().origem, 'GRAFICA');
  local.window.pgObterResumoColeta();
  assert.equal(chamadas, 1);
  origem = 'ACABADORA';
  assert.equal(local.window.pgObterResumoColeta().origem, 'ACABADORA');
  assert.equal(chamadas, 2);
});
