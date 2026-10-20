const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'PreProducao.html'), 'utf8');

const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

function registro(sku, indexTiragem, extras = {}) {
  return {
    sku, indexTiragem, descricao: `Material ${sku}`, un: 'Marca A', grafica: 'Grafica A', paginas: 40,
    dtEnvioPlan: '01/09/2026', dtRecBonPlan: '02/09/2026', dtApvBonPlan: '03/09/2026',
    ...extras
  };
}

const realizados = { dtEnvioReal: '01/09/2026', dtRecBonReal: '02/09/2026', dtApvBonReal: '03/09/2026' };
const dados = [
  registro('A', 2, realizados),
  registro('A', 2, { paginas: 80 }), // mesma chave com datas divergentes: fica o pior cenario
  registro('B', 2, realizados),
  registro('C', 1),
  registro('D', 5)
];

function iniciar({ falhaCache = false, base = dados } = {}) {
  const nodes = new Map();
  const chamadas = [];
  const downloads = [];
  const graficos = [];
  let blobExportado;
  const elemento = id => {
    const classes = new Set();
    return {
      id, value: '', innerHTML: '', textContent: '', innerText: '', attributes: {},
      classList: {
        add: (...itens) => itens.forEach(item => classes.add(item)),
        remove: (...itens) => itens.forEach(item => classes.delete(item)),
        contains: item => classes.has(item),
        toggle(item, ativo) {
          const incluir = ativo === undefined ? !classes.has(item) : ativo;
          if (incluir) classes.add(item); else classes.delete(item);
        }
      },
      setAttribute(nome, valor) { this.attributes[nome] = valor; },
      click() { downloads.push({ href: this.href, download: this.download }); }
    };
  };
  for (const match of source.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], elemento(match[1]));
  nodes.get('rxFaseQuinz').value = 'env';
  const botaoAtualizar = elemento('atualizar');
  const document = {
    body: { appendChild() {}, removeChild() {} },
    getElementById: id => nodes.get(id) || null,
    querySelector: () => botaoAtualizar,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => elemento('download')
  };
  const sandbox = {
    document,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-10-20T12:00:00-03:00'])); }
      static now() { return Date.parse('2026-10-20T12:00:00-03:00'); }
    },
    console: { info() {}, error() {} },
    alert: mensagem => { throw new Error(mensagem); },
    Blob,
    URL: { createObjectURL(blob) { blobExportado = blob; return 'blob:pre-producao'; } },
    Chart: class {
      constructor(canvas, config) { graficos.push(config); }
      destroy() {}
    },
    google: { script: {} }
  };
  Object.defineProperty(sandbox.google.script, 'run', {
    get() {
      let sucesso, falha;
      return {
        withSuccessHandler(handler) { sucesso = handler; return this; },
        withFailureHandler(handler) { falha = handler; return this; },
        getDadosPreProducao_Cache() {
          chamadas.push('cache');
          if (falhaCache) falha(new Error('cache indisponivel')); else sucesso(base);
        },
        getDadosPreProducao() { chamadas.push('direto'); sucesso(base); }
      };
    }
  });
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  scripts.forEach((script, i) => vm.runInContext(script, context, { filename: `PreProducao.html:script-${i + 1}` }));
  return { app: sandbox, nodes, chamadas, downloads, graficos, botaoAtualizar, blob: () => blobExportado };
}

test('Resumo Executivo abre pelo cache com Principal e Index 2, sem repetir carga na navegacao', () => {
  const { app, nodes, chamadas, graficos } = iniciar();
  app.chamarTelaPreProd('resumoExec');
  assert.deepEqual(chamadas, ['cache']);
  assert.equal(nodes.get('rxTipoProd').value, 'Principal');
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '2');
  assert.equal(nodes.get('visaoResumoExec').classList.contains('hidden'), false);
  assert.equal(nodes.get('visaoCaixasPre').classList.contains('hidden'), true);
  assert.equal(graficos.at(-1).data.datasets.length, 2);
  app.chamarTelaPreProd('resumoExec');
  assert.deepEqual(chamadas, ['cache']);
});

test('cache indisponivel usa leitura direta e Atualizar Base refaz a carga', () => {
  const { app, nodes, chamadas } = iniciar({ falhaCache: true });
  app.rxIniciar();
  assert.deepEqual(chamadas, ['cache', 'direto']);
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '2');
  assert.equal(nodes.get('loadingPreProd').classList.contains('hidden'), true);
  app.rxRecarregar();
  assert.deepEqual(chamadas, ['cache', 'direto', 'cache', 'direto']);
});

test('datas divergentes da mesma chave preservam pendencias e exportam todas as fases atrasadas', async () => {
  const { app, nodes, downloads, blob } = iniciar();
  app.rxIniciar();
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '2');
  assert.match(nodes.get('rxQtdExtracao').textContent, /^1 SKU/);
  assert.match(nodes.get('rxTbExtracao').innerHTML, /Atraso em mais de uma etapa \(3\)/);
  assert.match(nodes.get('rxTbPrincipal').innerHTML, /80 pgs/);
  app.rxExportarAtrasos();
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].download, /^atrasos_pre_producao_\d{8}\.csv$/);
  const csv = await blob().text();
  const linhas = csv.trim().split('\n');
  assert.equal(linhas.length, 2);
  assert.match(linhas[1], /^"A";/);
  assert.match(linhas[1], /Envio de Arquivo \+ Recebimento de Boneco \+ Aprove de Boneco/);
  assert.match(linhas[1], /;3;"Sim"$/);
});

test('filtros distinguem Principal e Chamado e restauram o Index 2', () => {
  const { app, nodes } = iniciar();
  app.rxIniciar();
  app.rxLimparDD('index');
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '3');
  nodes.get('rxTipoProd').value = 'Chamado';
  app.rxMudouTipoProd();
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '1');
  assert.match(nodes.get('rxTbReentradas').innerHTML, /MARCA A/);
  nodes.get('rxTipoProd').value = 'Todos';
  app.rxMudouTipoProd();
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '4');
  app.rxLimparFiltros();
  assert.equal(nodes.get('rxTipoProd').value, 'Principal');
  assert.equal(nodes.get('rxKpiSkuTot').textContent, '2');
});

test('navegacao entre Caixas e Resumo usa o carregador e o botao corretos', () => {
  const { app, nodes, botaoAtualizar } = iniciar();
  let cargasCaixas = 0;
  app.carregarDadosCaixas = () => { cargasCaixas++; };
  app.chamarTelaPreProd('caixas');
  assert.equal(cargasCaixas, 1);
  assert.equal(nodes.get('visaoCaixasPre').classList.contains('hidden'), false);
  assert.equal(nodes.get('visaoResumoExec').classList.contains('hidden'), true);
  assert.equal(botaoAtualizar.attributes.onclick, 'carregarDadosCaixas(true)');
  app.chamarTelaPreProd('resumoExec');
  assert.equal(nodes.get('visaoResumoExec').classList.contains('hidden'), false);
  assert.equal(botaoAtualizar.attributes.onclick, 'rxRecarregar()');
});

test('SLA flexivel considera dois dias uteis e feriado sem alterar aderencia estrita', () => {
  const { app, nodes } = iniciar({
    base: [registro('SLA', 2, {
      dtEnvioPlan: '09/10/2026', dtEnvioReal: '09/10/2026',
      dtRecBonPlan: '09/10/2026', dtRecBonReal: '14/10/2026',
      dtApvBonPlan: '14/10/2026', dtApvBonReal: '16/10/2026'
    })]
  });
  app.rxIniciar();
  // 9/10 foi sexta; 12/10 e feriado, portanto 14/10 e o segundo dia util.
  assert.equal((nodes.get('rxGaugesSla').innerHTML.match(/<text[^>]*>100,0%<\/text>/g) || []).length, 3);
  assert.equal((nodes.get('rxGaugesAd').innerHTML.match(/<text[^>]*>0,0%<\/text>/g) || []).length, 2);
});
