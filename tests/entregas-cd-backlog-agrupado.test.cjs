const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Reutiliza somente a montagem do DOM/RPC em memória; executa modelo e controle reais.
const harness = fs.readFileSync(path.join(__dirname, 'entregas-cd-interface.test.cjs'), 'utf8').split('\ntest(')[0];
const interfacePortal = new Function('require', '__dirname', harness + '\nreturn interfacePortal;')(require, __dirname);
const plain = value => JSON.parse(JSON.stringify(value));
const linhasDoBacklog = a => (a.nodes.get('ecdBacklog').innerHTML.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []);

function grupo({graficaDiferente = false} = {}) {
  const a = interfacePortal({adiar: true});
  a.linhas.forEach((l, n) => Object.assign(l, {
    GRAFICA_FINAL: graficaDiferente && n ? 'OUTRA GRÁFICA' : 'LOGPRINT',
    MARCA_FINAL: 'SAE', serie_corrigida: '2ª SÉRIE', CD_FINAL: 'CD JDI', TIRAGEM: n ? 200 : 100,
    'Coleta/Internalização de estoque final (re) plan': n ? '2026-10-22' : '2026-10-20',
    coletas: n ? [{data: '2026-10-22', volume: 70}, {data: '2026-10-23', volume: 30}]
      : [{data: '2026-10-20', volume: 10}, {data: '2026-10-21', volume: 30}],
    entregas: [{data: '2026-10-24', volume: n ? 30 : 20}]
  }));
  const antes = JSON.stringify(a.linhas);
  a.window.processarEntregasCD();
  assert.equal(JSON.stringify(a.linhas), antes, 'agrupamento não altera as linhas da base');
  return a;
}

test('backlog agrupa SKUs por gráfica, marca, série e CD sem duplicar plano ou coletado por parcela', () => {
  const a = grupo(), html = a.nodes.get('ecdBacklog').innerHTML, linhas = linhasDoBacklog(a);
  assert.equal(linhas.length, 1);
  assert.match(html, /<th>Gráfica<\/th><th>Marca<\/th><th>Série<\/th><th>CD<\/th>/);
  assert.match(linhas[0], /<td>LOGPRINT<\/td><td>SAE<\/td><td>2ª SÉRIE<\/td><td>CD JDI<\/td>/);
  assert.match(linhas[0], /<td>Datas variadas<\/td>/);
  assert.match(linhas[0], /<td title="300">0,3k<\/td>/);
  assert.match(linhas[0], /<td>0,1k \(46,7%\)<\/td>/);
  assert.match(linhas[0], /<td title="250">/);
  assert.match(linhas[0], /aria-label="Nova previsão \(coleta\) LOGPRINT · SAE · 2ª SÉRIE · CD JDI"/);
  assert(!html.includes('SKU'), 'nenhum SKU aparece em cabeçalho, célula, tooltip ou acessibilidade');
});

test('gráficas diferentes produzem linhas de backlog diferentes mesmo com marca, série e CD iguais', () => {
  const a = grupo({graficaDiferente: true}), linhas = linhasDoBacklog(a);
  assert.equal(linhas.length, 2);
  assert(linhas.some(l => l.includes('<td>LOGPRINT</td>')));
  assert(linhas.some(l => l.includes('<td>OUTRA GRAFICA</td>')));
});

test('previsão do grupo envia todas as chaves dos SKUs e remonta após confirmação', () => {
  const a = grupo(), chaves = a.linhas.map(l => a.window.pgEntregasCDModelo.chave(l));
  a.nodes.get('ecdTodasPendencias').checked = true;
  a.window.pgECDRender();
  a.window.pgECDSalvar(0, {value: '2026-10-29'});
  const pedido = a.salvo();
  assert.deepEqual(plain(pedido.previsoes.map(p => p.chave)), chaves);
  for (const p of pedido.previsoes) {
    assert.equal(JSON.parse(p.chave)[0], 'ECD1');
    assert.equal(p.dataEntrega, '2026-10-29');
    assert.deepEqual(plain(p.campos), ['dataEntrega']);
  }
  assert.match(linhasDoBacklog(a)[0], /disabled/);
  a.confirmar();
  for (const chave of chaves) assert.equal(a.window.PG_ECD_PREVISOES[chave].versao, 1);
  assert.equal(linhasDoBacklog(a).length, 1);
  assert.match(linhasDoBacklog(a)[0], /value="2026-10-29"/);
  assert(!linhasDoBacklog(a)[0].includes('disabled'));
  assert.match(a.nodes.get('ecdAviso').textContent, /salva e compartilhada/);
});

test('grupo reúne também todas as chaves de origem de itens já conciliados', () => {
  const a = grupo(), modelo = a.window.pgEntregasCDModelo, montar = modelo.montar;
  const extra = modelo.chave({...a.linhas[0], KIT: 'ORIGEM-EXTRA'});
  const chaves = [modelo.chave(a.linhas[0]), extra, modelo.chave(a.linhas[1])];
  modelo.montar = (...args) => montar(...args).map((i, n) => n ? i : {...i,
    chavesOrigem: [i.chave, extra], previsoesOrigem: {...i.previsoesOrigem, [extra]: {}}});
  a.window.processarEntregasCD();
  a.window.pgECDSalvar(0, {value: '2026-10-29'});
  assert.deepEqual(plain(a.salvo().previsoes.map(p => p.chave)), chaves);
});

test('datas manuais diferentes ficam vazias no grupo e falha identifica o grupo sem SKU', () => {
  const a = grupo(), chaves = a.linhas.map(l => a.window.pgEntregasCDModelo.chave(l));
  a.nodes.get('ecdTodasPendencias').checked = true;
  a.window.PG_ECD_PREVISOES = {
    [chaves[0]]: {dataEntrega: '2026-10-28', versao: 1},
    [chaves[1]]: {dataEntrega: '2026-10-29', versao: 1}
  };
  a.window.processarEntregasCD();
  assert.match(linhasDoBacklog(a)[0], /value=""/);
  a.window.pgECDSalvar(0, {value: '2026-10-30'});
  const pedido = a.salvo();
  a.falhar();
  const html = a.nodes.get('ecdFalhas').innerHTML;
  assert.match(html, /LOGPRINT · SAE · 2ª SÉRIE · CD JDI/);
  assert(!html.includes('SKU'));
  a.window.pgECDReenviar(0);
  assert.equal(a.salvo().requestId, pedido.requestId);
  assert.deepEqual(plain(a.salvo().previsoes), plain(pedido.previsoes));
  a.confirmar();
  assert.match(linhasDoBacklog(a)[0], /value="2026-10-30"/);
});
