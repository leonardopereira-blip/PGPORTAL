const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

function trecho(inicio, fim) {
  const a = source.indexOf(inicio);
  const b = source.indexOf(fim, a);
  assert.ok(a >= 0 && b > a, `Trecho real indisponivel: ${inicio}`);
  return source.slice(a, b);
}

// Apenas o DOM e os motores de renderizacao sao simulados. As opcoes, os
// checkboxes, o roteamento e a aplicacao dos filtros executam o codigo do portal.
function portal(linhas, origem = 'TODOS', destino = 'TODOS') {
  const checks = new Map();
  const controles = new Map([
    ['filtroReferencia', { value: 'replan' }],
    ['pgFiltroOrigem', { value: origem }],
    ['pgFiltroDestino', { value: destino, disabled: false }]
  ]);
  let markup = '';
  controles.set('containerFiltrosMultiProducao', {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      checks.clear();
      for (const [, input] of value.matchAll(/<input\b([^>]*)>/g)) {
        const classe = input.match(/class="([^"]*)"/)?.[1];
        const categoria = classe?.match(/\bchk-geral-([^\s]+)/)?.[1];
        if (!categoria) continue;
        const checkbox = {
          value: input.match(/value="([^"]*)"/)?.[1] || '',
          checked: /\schecked(?:\s|$)/.test(input)
        };
        if (!checks.has(categoria)) checks.set(categoria, []);
        checks.get(categoria).push(checkbox);
      }
    }
  });
  const document = {
    getElementById(id) {
      if (id.startsWith('btn-filtro-geral-')) {
        return { classList: { add() {}, remove() {} } };
      }
      return controles.get(id) || null;
    },
    querySelectorAll(selector) {
      const filtro = selector.match(/^\.chk-geral-([^:]+)(:checked|:not\(:checked\))?$/);
      if (filtro) {
        const list = checks.get(filtro[1]) || [];
        if (filtro[2] === ':checked') return list.filter(cb => cb.checked);
        if (filtro[2] === ':not(:checked)') return list.filter(cb => !cb.checked);
        return list;
      }
      if (selector === 'input[class*="chk-geral-"]') return [...checks.values()].flat();
      return [];
    },
    addEventListener() {}
  };
  const context = vm.createContext({
    window: { dadosGlobais: linhas, pgAtualizarAbaProducao() {} },
    document,
    console: { info() {} },
    performance: { now: () => 0 },
    FASES: [],
    injetarDatasMapa() {}
  });
  const executar = codigo => vm.runInContext(codigo, context);
  executar(trecho('    const pgChavesLinhas =', '    // As visões por fase'));
  executar(trecho('window.pgCampoColeta =', 'window.pgBaseForecastFiltrada ='));
  executar(trecho('    window.pgSolicitacaoCancelada =', '    function iniciarDashboard('));
  executar(trecho("    const PG_ACABADORAS = ['HR'", '    function pgFmtCompacto('));
  executar(trecho('    window.listasMultiProducao =', '    function injetarDatasMapa()'));
  executar(trecho('function aplicarFiltros() {', '    function atualizarOpcoesFiltroMatriz()'));
  executar(trecho('    function iniciarDashboard(', '    // MOTOR DE FILTROS GLOBAIS'));
  context.window.aplicarFiltros = context.aplicarFiltros;
  // Os seletores de Origem/Destino ja estao representados pelos controles acima.
  context.window.pgMontarFiltrosExtras = () => {};
  context.iniciarDashboard(linhas);
  return {
    w: context.window,
    get linhas() { return Array.from(context.dadosFiltrados); },
    checks,
    anexar(fatia) { return context.window.pgAnexarDadosDashboard(fatia); },
    selecionar(o, d) {
      controles.get('pgFiltroOrigem').value = o;
      controles.get('pgFiltroDestino').value = d;
      context.aplicarFiltros();
    }
  };
}

function pcp(id, grafica = 'LOGPRINT', cdMapa = 'CD JDI') {
  return {
    _SOURCE: 'PCP', _ROW_ID: id, Chave: id,
    'GRÁFICA': grafica, GRAFICA_FINAL: grafica,
    UNIDADE: 'SAS', MARCA_FINAL: 'SAS',
    CD_MAPA: cdMapa, 'CD DESTINO': 'CD ORIGINAL',
    CICLO: '2026', ENVIO: 'V1', Congelado: 'Sim', TIRAGEM: 100
  };
}

function acabadora(id, grafica) {
  const linha = pcp(id, grafica);
  delete linha.CD_MAPA;
  return { ...linha, _SOURCE: 'ACABADORA', 'CD DESTINO': 'CD JDI', CD_FINAL: 'CD JDI' };
}

test('CD_MAPA vazio aparece marcado, sobrevive Marcar Todos e segue para Acabadora', () => {
  const vazio = pcp('vazio', 'LOGPRINT', '');
  const direto = pcp('direto');
  const p = portal([vazio, direto], 'TODOS', 'ACAB');
  assert.deepEqual(p.checks.get('CDDestino').map(cb => [cb.value, cb.checked]), [
    ['(Vazio)', true], ['CD JDI', true]
  ]);
  p.w.checkAllGeral('CDDestino', true);
  assert.deepEqual(p.linhas, [vazio]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [vazio]);
  assert.equal(p.w.pgEhDestinoAcabadora(vazio), true);
  assert.equal(p.w.pgEhDestinoCD(vazio), false);
  p.selecionar('TODOS', 'TODOS');
  assert.deepEqual(p.linhas, [vazio, direto]);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [direto]);
});

test('CD especifico exclui vazio desmarcado; Marcar Todos o restaura', () => {
  const vazio = pcp('vazio', 'LOGPRINT', '');
  const jdi = pcp('jdi');
  const forCD = pcp('for', 'LEOGRAF', 'CD FOR');
  const p = portal([vazio, jdi, forCD]);
  p.w.checkOnlyGeral('CDDestino', 'CD JDI');
  assert.deepEqual(p.linhas, [jdi]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [jdi]);
  assert.equal(p.checks.get('CDDestino').find(cb => cb.value === '(Vazio)').checked, false);
  p.w.checkAllGeral('CDDestino', true);
  assert.deepEqual(p.linhas, [vazio, jdi, forCD]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [vazio, jdi, forCD]);
});

test('WALPRINT e REPROSET seguem para Acabadora mesmo com CD_MAPA preenchido', () => {
  const walprint = pcp('walprint', 'WALPRINT');
  const reproset = pcp('reproset', 'REPROSET', 'CD FOR');
  const direto = pcp('direto');
  const p = portal([walprint, reproset, direto], 'TODOS', 'ACAB');
  assert.deepEqual(p.linhas, [walprint, reproset]);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [direto]);
});

test('Origem Todas exclui KN Raizes e Athos da PCP_ACABADORAS em qualquer destino', () => {
  const excluidas = ['KN', ' Raízes ', 'ATHOS'].map((nome, i) => acabadora(`excluir-${i}`, nome));
  const oficial = acabadora('hr', 'HR');
  const graficaKN = pcp('pcp-kn', 'KN');
  const graficaAthos = pcp('pcp-athos', 'ATHOS');
  const p = portal([...excluidas, oficial, graficaKN, graficaAthos]);
  for (const destino of ['TODOS', 'CD', 'ACAB']) {
    p.selecionar('TODOS', destino);
    for (const l of excluidas) {
      assert.equal(p.linhas.includes(l), false, `${l.GRAFICA_FINAL} em ${destino}`);
      assert.equal(p.w.dadosTotalCanonico.includes(l), false, `Total ${l.GRAFICA_FINAL} em ${destino}`);
      assert.equal(p.w.dadosBaseTPPortal.includes(l), false, `TP ${l.GRAFICA_FINAL} em ${destino}`);
      assert.equal(p.w.pgLinhaDaOrigem(l, 'TODOS'), false);
      assert.equal(p.w.pgLinhaDoDestino(l, destino, 'TODOS'), false);
    }
  }
  p.selecionar('TODOS', 'TODOS');
  assert.deepEqual(p.linhas, [oficial, graficaKN, graficaAthos]);
  p.selecionar('TODOS', 'CD');
  assert.deepEqual(p.linhas, [oficial, graficaKN, graficaAthos]);
});

test('Origem Acabadora inclui KN Raizes Athos e conserva o CD proprio da fonte', () => {
  const acabadoras = ['KN', 'Raízes', 'ATHOS', 'HR'].map((nome, i) => acabadora(`acab-${i}`, nome));
  const grafica = pcp('grafica');
  const p = portal([...acabadoras, grafica], 'ACABADORA', 'TODOS');
  assert.deepEqual(p.linhas, acabadoras);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), acabadoras);
  assert.deepEqual(Array.from(p.w.dadosBaseTPPortal), acabadoras);
  for (const l of acabadoras) {
    assert.equal(p.w.pgLinhaDaOrigem(l, 'ACABADORA'), true);
    assert.equal(p.w.pgValorFiltroProducao(l, 'CD Destino'), 'CD JDI');
  }
});

test('nova fatia do cache entra no Total Base com os mesmos filtros', () => {
  const primeira = pcp('primeira');
  const segunda = pcp('segunda', 'LEOGRAF');
  const hr = acabadora('hr', 'HR');
  const p = portal([primeira], 'TODOS', 'CD');
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [primeira]);
  assert.equal(p.anexar([segunda, hr]), 3);
  assert.deepEqual(p.linhas, [primeira, segunda, hr]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [primeira, segunda, hr]);
  assert.deepEqual(Array.from(p.w.DADOS_PCP_CACHE), [primeira, segunda, hr]);
  assert.equal(p.w.dadosTotalCanonico.reduce((s, l) => s + l.TIRAGEM, 0), 300);
});

test('CD_MAPA vazio numa nova fatia entra marcado e chega ao fluxo Acabadora', () => {
  const primeira = pcp('primeira');
  const novoVazio = pcp('novo-vazio', 'LEOGRAF', '');
  const p = portal([primeira], 'TODOS', 'ACAB');
  assert.deepEqual(p.linhas, []);
  p.anexar([novoVazio]);
  assert.equal(p.checks.get('CDDestino').find(cb => cb.value === '(Vazio)').checked, true);
  assert.deepEqual(p.linhas, [novoVazio]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [novoVazio]);
});

test('nova fatia conserva vazio desmarcado e respeita selecao de CD especifico', () => {
  const primeira = pcp('primeira');
  const vazio = pcp('vazio', 'LEOGRAF', '');
  const novoVazio = pcp('novo-vazio', 'LEOGRAF', '');
  const segunda = pcp('segunda');
  const p = portal([primeira, vazio]);
  p.w.checkOnlyGeral('CDDestino', 'CD JDI');
  p.anexar([novoVazio, segunda]);
  assert.equal(p.checks.get('CDDestino').find(cb => cb.value === '(Vazio)').checked, false);
  assert.deepEqual(p.linhas, [primeira, segunda]);
  assert.deepEqual(Array.from(p.w.dadosTotalCanonico), [primeira, segunda]);
});
