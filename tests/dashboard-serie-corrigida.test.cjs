const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');

function fonte(nome, corrigida, incluirColuna) {
  const ehPcp = nome === 'PCP';
  const cabecalhos = Array.from({ length: ehPcp ? 139 : 90 }, (_, i) => 'COL_' + i);
  const valores = Array(cabecalhos.length).fill('');
  const indiceSerie = ehPcp ? 76 : 37;
  cabecalhos[indiceSerie] = 'SÉRIE';
  valores[indiceSerie] = 'Série original';
  cabecalhos[ehPcp ? 16 : 0] = 'Chave';
  valores[ehPcp ? 16 : 0] = nome + '-001';
  if (incluirColuna) {
    const indice = ehPcp ? 21 : cabecalhos.length;
    cabecalhos[indice] = incluirColuna;
    valores[indice] = corrigida;
  }
  return [cabecalhos, valores];
}

function processar(fontes) {
  const contexto = vm.createContext({
    console: { log() {} },
    pgValidarCabecalhosDashboard_: () => {},
    pgLerAbaCache_: nome => fontes[nome] || null
  });
  vm.runInContext(codigo, contexto);
  return contexto._processarDadosDashboardBruto();
}

for (const nome of ['PCP', 'PCP_ACABADORAS']) {
  test(nome + ': prioriza serie_corrigida com variacoes de caixa e acento', () => {
    for (const titulo of ['serie_corrigida', 'SERIE_CORRIGIDA', '  SéRiE_CoRrIgIdA  ']) {
      const linhas = processar({ [nome]: fonte(nome, 'Série corrigida', titulo) });
      assert.equal(linhas.length, 1);
      assert.equal(linhas[0]['SÉRIE'], 'Série corrigida');
    }
  });

  test(nome + ': mantem serie antiga quando cabecalho corrigido nao existe', () => {
    const linhas = processar({ [nome]: fonte(nome, '', null) });
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0]['SÉRIE'], 'Série original');
  });

  test(nome + ': mantem serie antiga quando valor corrigido esta vazio', () => {
    const linhas = processar({ [nome]: fonte(nome, ' ', 'SERIE_CORRIGIDA') });
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0]['SÉRIE'], 'Série original');
  });
}
