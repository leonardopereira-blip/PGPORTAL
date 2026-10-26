const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');
const filtros = source.slice(source.indexOf('<!-- PG_ONEPAGE_FILTROS_V1 -->'));
function trecho(inicio, fim) {
  const start = filtros.indexOf(inicio);
  const end = filtros.indexOf(fim, start);
  assert.ok(start >= 0 && end > start, `trecho de produção encontrado: ${inicio}`);
  return filtros.slice(start, end);
}
const w = {};
const api = new Function('window', [
  trecho('    const PG_PESSOAS =', '    const PG_GESTORES ='),
  trecho('    function pgNorm(v)', '    function pgEsc(v)'),
  trecho('    function pgCasaGrafica(', '    function pgEmailAtual()'),
  'return {pessoas: PG_PESSOAS, normalizar: pgNorm, casar: pgCasaGrafica,',
  '  graficasDoTime: pgGraficasDoTime, pessoasDoTime: pgPessoasDoTime};'
].join('\n'))(w);

test('Star7 e suas variantes pertencem a Matheus do time Jaqueline', () => {
  for (const nome of ['STAR7', 'STAR 7', ' star7 ', 'Star   7', 'STAR-7', 'STAR_7', 'STAR.7']) {
    assert.deepEqual(w.pgResponsavelGraficaGiro(nome), {analista: 'Matheus', time: 'JAQUELINE'}, nome);
  }
});

test('IPSIS pertence a Klayton do time Camila, inclusive com caixa e espaços diferentes', () => {
  for (const nome of ['IPSIS', 'Ipsis', '  ipsis  ']) {
    assert.deepEqual(w.pgResponsavelGraficaGiro(nome), {analista: 'Klayton', time: 'CAMILA'}, nome);
  }
});

test('MARGRAF pertence a Klayton do time Camila, inclusive com caixa e espaços diferentes', () => {
  for (const nome of ['MARGRAF', 'Margraf', '  margraf  ']) {
    assert.deepEqual(w.pgResponsavelGraficaGiro(nome), {analista: 'Klayton', time: 'CAMILA'}, nome);
  }
});

test('cadastro compartilhado pelos filtros de analista e time cobre Star7, IPSIS e MARGRAF', () => {
  const matheus = api.pessoas['matheus.vasconcelos@arcoeducacao.com.br'];
  const klayton = api.pessoas['klaytonmatos@arcoeducacao.com.br'];
  assert.ok(api.casar('STAR7', matheus.graficas));
  assert.ok(api.casar('STAR7', api.graficasDoTime('JAQUELINE')));
  assert.equal(api.casar('STAR7', api.graficasDoTime('CAMILA')), false);
  assert.ok(api.casar('IPSIS', klayton.graficas));
  assert.ok(api.casar('IPSIS', api.graficasDoTime('CAMILA')));
  assert.equal(api.casar('IPSIS', api.graficasDoTime('JAQUELINE')), false);
  assert.ok(api.casar('MARGRAF', klayton.graficas));
  assert.ok(api.casar('MARGRAF', api.graficasDoTime('CAMILA')));
  assert.equal(api.casar('MARGRAF', api.graficasDoTime('JAQUELINE')), false);
  assert.ok(api.pessoasDoTime('CAMILA').some(p => p.email === 'klaytonmatos@arcoeducacao.com.br'));
});

test('as 28 gráficas auditadas nas bases PCP e PCP_ACABADORAS têm os responsáveis corretos', () => {
  const esperados = [
    ['ANTILHAS', 'Elis', 'JAQUELINE'], ['ATHOS', 'Matheus', 'JAQUELINE'],
    ['BERCROM', 'Amanda Costa', 'CAMILA'], ['COAN', 'Klayton', 'CAMILA'],
    ['EMBALARTE', 'Elis', 'JAQUELINE'], ['FELK', 'Elis', 'JAQUELINE'],
    ['FORMA CERTA', 'Elis', 'JAQUELINE'], ['HR', 'Elis', 'JAQUELINE'],
    ['IMOS', 'Klayton', 'CAMILA'], ['IPSIS', 'Klayton', 'CAMILA'],
    ['KN', 'Elis', 'JAQUELINE'], ['LEOGRAF', 'João Alberti', 'CAMILA'],
    ['LOGPRINT', 'Amanda Costa', 'CAMILA'], ['MARGRAF', 'Klayton', 'CAMILA'],
    ['MAXI', 'Klayton', 'CAMILA'], ['META', 'Amanda Costa', 'CAMILA'],
    ['MIDIOGRAF', 'Klayton', 'CAMILA'], ['OCEANO', 'Matheus', 'JAQUELINE'],
    ['PIFFER', 'Elis', 'JAQUELINE'],
    ['POSIGRAF', 'João Alberti', 'CAMILA'], ['RAÍZES', 'Elis', 'JAQUELINE'],
    ['REPROSET', 'Klayton', 'CAMILA'], ['RICARGRAF', 'Matheus', 'JAQUELINE'],
    ['RONA', 'Matheus', 'JAQUELINE'], ['SÃO FRANCISCO', 'Elis', 'JAQUELINE'],
    ['STAR7', 'Matheus', 'JAQUELINE'], ['WALPRINT', 'João Alberti', 'CAMILA'],
    ['ZIT', 'Klayton', 'CAMILA']
  ];
  assert.equal(esperados.length, 28);
  for (const [grafica, analista, time] of esperados) {
    assert.deepEqual(w.pgResponsavelGraficaGiro(grafica), {analista, time}, grafica);
  }
});

test('todas as gráficas cadastradas têm um único responsável e time preenchido', () => {
  const donos = new Map();
  for (const [email, pessoa] of Object.entries(api.pessoas)) {
    assert.ok(pessoa.nome && pessoa.time, email);
    for (const grafica of pessoa.graficas) {
      const chave = api.normalizar(grafica);
      assert.ok(chave, `${email}: gráfica preenchida`);
      assert.ok(!donos.has(chave) || donos.get(chave) === email, `${grafica}: sem donos concorrentes`);
      donos.set(chave, email);
      assert.deepEqual(w.pgResponsavelGraficaGiro(grafica), {analista: pessoa.nome, time: pessoa.time}, grafica);
    }
  }
});

test('gráfica vazia não entra no filtro de nenhuma pessoa ou time', () => {
  for (const grafica of ['', '   ', null, undefined]) {
    for (const pessoa of Object.values(api.pessoas)) assert.equal(api.casar(grafica, pessoa.graficas), false);
    assert.deepEqual(w.pgResponsavelGraficaGiro(grafica), {analista: '', time: ''});
  }
});

test('nome desconhecido não recebe responsável inventado', () => {
  assert.deepEqual(w.pgResponsavelGraficaGiro('FORNECEDOR SEM CADASTRO'), {analista: '', time: ''});
  assert.equal(api.casar('FORNECEDOR SEM CADASTRO', api.graficasDoTime('CAMILA')), false);
  assert.equal(api.casar('FORNECEDOR SEM CADASTRO', api.graficasDoTime('JAQUELINE')), false);
});
