const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reutiliza a mesma montagem e as mesmas integrações simuladas da interface.
const origemHarness = fs.readFileSync(path.join(__dirname, 'entregas-cd-interface.test.cjs'), 'utf8');
const {interfacePortal} = vm.runInNewContext(
  origemHarness.slice(0, origemHarness.indexOf("\ntest(")) + '\n({interfacePortal});',
  {require, __dirname, console}
);

function cenario() {
  const a = interfacePortal();
  const sae = a.linhas[0], sas = a.linhas[1];
  sae.entregas = [{data:'2026-10-25',volume:20}];
  a.linhas.push({...sae, SKU_REAL:'SKU-03', coletas:[], entregas:[]});
  a.linhas.push({...sae, SKU_REAL:'SKU-04', GRAFICA_FINAL:'HR', serie_corrigida:'3ª SÉRIE',
    TIRAGEM:40, coletas:[], entregas:[],
    'Coleta/Internalização de estoque final (re) plan':'2026-10-27'});
  a.linhas.push({...sae, SKU_REAL:'SKU-05', TIRAGEM:30,
    coletas:[{data:'2026-10-26',volume:30}], entregas:[]});
  a.window.processarEntregasCD();
  return a;
}

const conteudo = (html, tag) => html.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>'))?.[1] || '';
const celulas = html => [...html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].map(m => ({attrs:m[1], html:m[2]}));
const cabecalhos = html => [...(html.match(/<tr class="ecd-day">([\s\S]*?)<\/tr>/)?.[1] || '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => m[1]);
const linha = (html, marca) => [...conteudo(html, 'tbody').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .find(m => m[1].includes('>' + marca + '<'))?.[1] || '';

function mostrar(a, celula) {
  const indice = celula.attrs.match(/data-ecd-tooltip="(\d+)"/)?.[1];
  assert.notEqual(indice, undefined, 'Célula deve abrir o detalhe ao passar o mouse');
  assert.match(celula.attrs, /tabindex="0"/, 'Detalhe também acessível pelo teclado');
  const painel = a.nodes.get('ecdTooltip');
  assert(painel, 'Painel de detalhe criado');
  a.window.pgECDMostrarDetalhe(Number(indice), {
    getBoundingClientRect:() => ({left:100,right:236,top:100,bottom:153,width:136,height:53})
  });
  assert.notEqual(painel.hidden, true, 'Painel aparece ao passar o mouse');
  return painel.innerHTML;
}

function linhasDetalhe(html) {
  return [...conteudo(html, 'tbody').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
      .map(c => c[1].replace(/<[^>]+>/g, '').trim()));
}

test('quadro mantém Gráfica apenas no hover e Entregue detalha pendências agregadas sem SKU', () => {
  const a = cenario();
  const html = a.nodes.get('ecdQuadroMarca').innerHTML;
  const headers = cabecalhos(html);
  assert.deepEqual(headers.slice(0,3).map(h => h.replace(/<span[\s\S]*/, '')), ['Marca','CD','Entregue']);
  assert(!headers.some(h => h === 'Gráfica'), 'Gráfica não ocupa coluna fixa');
  assert.match(a.nodes.get('ecdNovaVisao').innerHTML, /role="tooltip"/);
  const sae = celulas(linha(html, 'SAE'));
  assert.match(sae[1].attrs, /left:175px/, 'CD acompanha a Marca após retirar a coluna');
  assert.match(sae[2].attrs, /left:330px/, 'Entregue acompanha o CD sem lacuna');
  assert(!html.includes('LOGPRINT'), 'Nome da gráfica só aparece no painel de hover');
  assert(!html.includes('SKU-'), 'SKU não vaza para a tabela');
  const detalhe = mostrar(a, sae[2]);
  assert.match(detalhe, /Tiragem pendente/);
  assert.deepEqual(linhasDetalhe(detalhe), [['LOGPRINT','SAE','2ª SÉRIE','175']]);
  assert(!detalhe.includes('SAS')); assert(!detalhe.includes('HR'));
  assert(!detalhe.includes('SKU-'));
  a.window.pgECDOcultarDetalhe();
  const painel = a.nodes.get('ecdTooltip');
  assert(painel.hidden === true || painel.style.display === 'none' || painel.classList.contains('hidden'),
    'Painel fecha ao sair da célula');
});

test('hover do Total Geral reúne pendências sem misturar parcelas já programadas', () => {
  const a = cenario();
  for (const id of ['ecdQuadroMarca','ecdQuadroSerie']) {
    const html = a.nodes.get(id).innerHTML;
    const total = celulas(conteudo(html, 'tfoot'));
    const entregue = total[cabecalhos(html).findIndex(h => h.startsWith('Entregue'))];
    const detalhe = mostrar(a, entregue);
    assert.deepEqual(linhasDetalhe(detalhe), [
      ['LOGPRINT','SAE','2ª SÉRIE','175'], ['LOGPRINT','SAS','2ª SÉRIE','75']
    ]);
    assert(!detalhe.includes('HR'), 'Série com 40 programados para 29/10 não vira pendência');
    assert(!detalhe.includes('SKU-'));
  }
});

test('hover de cada data mostra só suas parcelas e soma SKUs da mesma gráfica, marca e série', () => {
  const a = cenario();
  const html = a.nodes.get('ecdQuadroMarca').innerHTML, headers = cabecalhos(html);
  const sae = celulas(linha(html, 'SAE'));
  const dia28 = mostrar(a, sae[headers.findIndex(h => h.includes('28/10'))]);
  assert.deepEqual(linhasDetalhe(dia28), [['LOGPRINT','SAE','2ª SÉRIE','35']]);
  assert(!dia28.includes('HR')); assert(!dia28.includes('SAS')); assert(!dia28.includes('SKU-'));
  const dia29 = mostrar(a, sae[headers.findIndex(h => h.includes('29/10'))]);
  assert.deepEqual(linhasDetalhe(dia29), [['HR','SAE','3ª SÉRIE','40']]);
  assert(!dia29.includes('LOGPRINT')); assert(!dia29.includes('SKU-'));
  const total = celulas(conteudo(html, 'tfoot'));
  const total28 = mostrar(a, total[headers.findIndex(h => h.includes('28/10'))]);
  assert.deepEqual(linhasDetalhe(total28), [
    ['LOGPRINT','SAE','2ª SÉRIE','35'], ['LOGPRINT','SAS','2ª SÉRIE','25']
  ]);
  assert(!total28.includes('HR')); assert(!total28.includes('SKU-'));
});
