const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('filtros preservam índices legados quando não há cabeçalho de personalização', () => {
  const pcp = new Array(138).fill('');
  pcp[16] = 'PCP_ITEM';
  pcp[74] = 'MESMO_SKU';
  pcp[136] = ' sim ';
  pcp[137] = 'Não';
  const acab = new Array(90).fill('');
  acab[0] = 'ACAB_ITEM';
  acab[74] = 'MESMO_SKU';
  acab[88] = 'não';
  acab[89] = 'SIM';
  const fontes = {
    PCP: [pcp.map((_, i) => 'Col' + i), pcp],
    PCP_ACABADORAS: [acab.map((_, i) => 'Col' + i), acab]
  };
  const contexto = {
    console: { log() {} },
    pgValidarCabecalhosDashboard_() {},
    pgLerAbaCache_(nome) { return fontes[nome]; },
    pgLerEspecificacaoPersonalizacao_() { throw new Error('Fonte antiga não deve ser consultada'); }
  };
  vm.runInNewContext(code, contexto);
  const dados = contexto._processarDadosDashboardBruto();
  assert.equal(dados.length, 2);
  assert.equal(dados[0].CLIENTE_PERSONALIZADO, 'Sim');
  assert.equal(dados[0].CAPA_PERSONALIZADA, 'Não');
  assert.equal(dados[1].CLIENTE_PERSONALIZADO, 'Não');
  assert.equal(dados[1].CAPA_PERSONALIZADA, 'Sim');
});

test('acabadora mantém personalização por cabeçalho após inclusão de série corrigida', () => {
  const headers = new Array(94).fill('').map((_, i) => 'Col' + i);
  headers[88] = 'serie_corrigida';
  headers[89] = 'Coluna 90';
  headers[91] = ' cliente_personalizado ';
  headers[92] = 'capa_personalizada';
  headers[93] = 'AVALIACAO';
  const linha = new Array(94).fill('');
  linha[0] = 'ACAB_NOVA';
  linha[88] = '6º ANO';
  linha[91] = 'SIM';
  linha[92] = 'não';
  linha[93] = 'Sim';
  const emBranco = linha.slice();
  emBranco[0] = 'ACAB_BRANCA';
  emBranco[88] = 'Sim';
  emBranco[89] = 'Sim';
  emBranco[91] = '';
  emBranco[92] = '';
  const contexto = {
    console: { log() {} },
    pgValidarCabecalhosDashboard_() {},
    pgLerAbaCache_(nome) { return nome === 'PCP' ? null : [headers, linha, emBranco]; }
  };
  vm.runInNewContext(code, contexto);
  const dados = contexto._processarDadosDashboardBruto();
  assert.equal(dados.length, 2);
  assert.equal(dados[0].CLIENTE_PERSONALIZADO, 'Sim');
  assert.equal(dados[0].CAPA_PERSONALIZADA, 'Não');
  assert.equal(dados[0].AVALIACAO, 'Sim');
  assert.equal(dados[0].serie_corrigida, '6º ANO');
  assert.equal(dados[1].CLIENTE_PERSONALIZADO, 'Não');
  assert.equal(dados[1].CAPA_PERSONALIZADA, 'Não');
});

test('Cliente personalizado e Capa personalizada sao filtros gerais', () => {
  assert.match(front, /'Cliente personalizado': new Set\(\)/);
  assert.match(front, /'Capa personalizada': new Set\(\)/);
  assert.match(front, /'Cliente personalizado': 'CLIENTE_PERSONALIZADO'/);
  assert.match(front, /'Capa personalizada': 'CAPA_PERSONALIZADA'/);
});
