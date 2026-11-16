const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const global = fs.readFileSync(path.join(root, 'Scripts_Globais_2.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'Scripts_Resultados_Analistas.html'), 'utf8');
const ini = global.indexOf("    const PG_ACABADORAS = ['HR'");
const fim = global.indexOf('    function pgCasaGrafica(', ini);
assert.ok(ini >= 0 && fim > ini, 'Classificador real do portal localizado');
const resultado = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(resultado, 'Apuração de analistas encontrada');

function portal() {
  const w = {};
  new Function('window', global.slice(ini, fim))(w);
  w.pgLinhasUnicas = linhas => linhas;
  w.pgIdentidadeOperacionalTPLinha = linha => ({chave: linha.SKU_REAL});
  w.pgVolumesColetaUnificadosV37 = linha => ({
    eventosColetaTP: [{data:'2026-11-10',volume:linha.TIRAGEM,linhaMapa:2,kit:linha.KIT}]
  });
  w.pgNormalizarDataColeta = v => v;
  w.pgDataPlanoEntregaSLA = (linha, dia) => dia;
  vm.runInNewContext(resultado, {window:w, Date});
  return w;
}

const linha = (sku, destino, total=100) => ({
  _SOURCE:'PCP', GRAFICA_FINAL:'OCEANO', UNIDADE:'SAS ADAPT',
  SKU_REAL:sku, KIT:sku, CD_MAPA:destino, 'CD DESTINO':destino, TIRAGEM:total
});

test('SAS ADAPT com ATHOS como CD final não vira transferência duplicada', () => {
  const w = portal();
  const athos = linha('SAS-ADAPT', 'ATHOS', 822530);
  const felk = linha('ACAB-REAL', 'FELK', 120);
  assert.equal(w.pgEhDestinoCD(athos), true, 'ATHOS permanece CD no classificador canônico');
  assert.equal(w.pgEhDestinoAcabadoraGraficaFiltro(athos), true,
    'O filtro exclusivo Gráfica x Acabadora continua com sua classificação ampliada');
  const entradas = w.pgRAItensAcabadoras([athos, felk], {
    corte:'2026-11-16', trajeto:'entrada', etapa:'coleta_matriz'
  });
  assert.deepEqual(Array.from(entradas, x => x.linha.SKU_REAL), ['ACAB-REAL']);
  assert.equal(entradas[0].total, 120, 'O caminho de acabadora legítimo permanece');
});

test('Total por analista não atribui segunda rota a destinos finais de CD', () => {
  const w = portal();
  const diretos = [linha('ATHOS','ATHOS'),linha('CD-JDI','CD JDI')];
  const transferencias = [
    linha('FELK','FELK'),linha('HR','HR'),linha('REPROSET','REPROSET'),
    linha('WALPRINT','WALPRINT'),linha('OCEANO','OCEANO')
  ];
  const entradas = w.pgRAItensAcabadoras([...diretos,...transferencias],{
    corte:'2026-11-16',trajeto:'entrada',etapa:'coleta_matriz'
  });
  assert.deepEqual(Array.from(entradas, x=>x.linha.SKU_REAL),
    ['FELK','HR','REPROSET','WALPRINT','OCEANO']);
});
