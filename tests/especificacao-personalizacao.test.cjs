const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
const front = fs.readFileSync(path.join(__dirname, '..', 'Scripts_Globais_2.html'), 'utf8');

test('filtros usam EG/EH da PCP e CK/CL da acabadora por linha', () => {
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

test('Cliente personalizado e Capa personalizada sao filtros gerais', () => {
  assert.match(front, /'Cliente personalizado': new Set\(\)/);
  assert.match(front, /'Capa personalizada': new Set\(\)/);
  assert.match(front, /'Cliente personalizado': 'CLIENTE_PERSONALIZADO'/);
  assert.match(front, /'Capa personalizada': 'CAPA_PERSONALIZADA'/);
});
