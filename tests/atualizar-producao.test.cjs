const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

function trecho(inicio, fim) {
  const a = source.indexOf(inicio);
  const b = source.indexOf(fim, a);
  assert.ok(a >= 0 && b > a, `Funcao real indisponivel: ${inicio}`);
  return source.slice(a, b);
}

function portal() {
  const chamadas = [];
  const loading = [];
  const status = { innerText: '' };
  let recargas = 0;
  let sucesso;
  let falha;
  const run = new Proxy({}, {
    get(_, nome) {
      if (nome === 'withSuccessHandler') return fn => { sucesso = fn; return run; };
      if (nome === 'withFailureHandler') return fn => { falha = fn; return run; };
      return (...args) => chamadas.push({ nome, args, sucesso, falha });
    }
  });
  const context = vm.createContext({
    window: {
      setLoading: (ativo, mensagem) => loading.push({ ativo, mensagem }),
      location: { reload: () => recargas++ }
    },
    google: { script: { run } },
    document: { getElementById: id => id === 'statusCarregamento' ? status : null }
  });
  vm.runInContext(trecho('    function atualizarDadosGeral()', '    window.pgSolicitacaoCancelada ='), context);
  vm.runInContext(trecho('    function erroAoCarregar(', '    let divergenciasExport ='), context);
  return { context, chamadas, loading, status, get recargas() { return recargas; } };
}

test('Atualizar regenera a Producao publicada e recarrega somente depois do sucesso', () => {
  const p = portal();
  p.context.atualizarDadosGeral();
  assert.equal(p.loading.length, 1);
  assert.equal(p.loading[0].ativo, true);
  assert.equal(p.chamadas.length, 1);
  assert.equal(p.chamadas[0].nome, 'atualizarCacheDashboard');
  assert.equal(p.chamadas[0].args.length, 0);
  assert.equal(p.recargas, 0, 'A pagina deve aguardar a publicacao do cache');

  p.chamadas[0].sucesso({ registros: 9000, meses: [{ mes: '2026-10' }] });
  assert.equal(p.recargas, 1);
  assert.equal(p.chamadas.length, 1, 'A recarga deve seguir o carregamento mensal normal');
});

test('Falha na atualizacao preserva a pagina, apresenta erro e encerra loading', () => {
  const p = portal();
  p.context.atualizarDadosGeral();
  assert.equal(p.chamadas[0].falha, p.context.erroAoCarregar);
  const erro = new Error('A fonte de Producao esta indisponivel');
  p.chamadas[0].falha(erro);

  assert.equal(p.recargas, 0);
  assert.equal(p.status.innerText, 'Erro: ' + erro.message);
  assert.deepEqual(p.loading.map(item => item.ativo), [true, false]);

  // Uma falha nao impede que o usuario tente atualizar outra vez.
  p.context.atualizarDadosGeral();
  assert.equal(p.chamadas.length, 2);
  assert.equal(p.chamadas[1].nome, 'atualizarCacheDashboard');
  p.chamadas[1].sucesso({ registros: 9000, meses: [] });
  assert.equal(p.recargas, 1);
});
