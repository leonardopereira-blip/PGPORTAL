const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Atualizar_PCPs.gs'), 'utf8');

function atualizador() {
  const eventos = [];
  const nomes = ['PCP_PGBM', 'ACABADORAS_PGBM'];
  const destinos = ['PCP', 'PCP_ACABADORAS'];
  const propriedades = new Map();
  const abas = new Map();

  for (const [indice, nome] of [...nomes, ...destinos].entries()) {
    const origem = nomes.includes(nome);
    const aba = {
      nome,
      valores: origem
        ? [['CHAVE', 'ID', 'VERSAO', 'CODIGO', 'REFERÊNCIA'],
          [`${nome}-1`, 1, 'V1', 'A', 120],
          [`${nome}-2`, 2, 'V1', 'B', 240]]
        : [['BASE ANTERIOR', nome]],
      linhasMaximas: 2,
      colunasMaximas: 2,
      refDuranteLeitura: false,
      getName: () => nome,
      getSheetId: () => indice + 1,
      getLastRow() { return this.valores.length; },
      getLastColumn() { return Math.max(...this.valores.map(linha => linha.length)); },
      getMaxRows() { return this.linhasMaximas; },
      getMaxColumns() { return this.colunasMaximas; },
      insertRowsAfter(depois, quantidade) {
        eventos.push({ tipo: 'escrita', metodo: 'insertRowsAfter', nome });
        this.linhasMaximas += quantidade;
      },
      insertColumnsAfter(depois, quantidade) {
        eventos.push({ tipo: 'escrita', metodo: 'insertColumnsAfter', nome });
        this.colunasMaximas += quantidade;
      },
      clearContents() {
        eventos.push({ tipo: 'escrita', metodo: 'clearContents', nome });
        this.valores = [];
      },
      getRange(linha, coluna, quantidadeLinhas, quantidadeColunas) {
        const ler = metodo => {
          eventos.push({ tipo: 'leitura', nome, metodo, linha, coluna, quantidadeLinhas, quantidadeColunas });
          const valores = Array.from({ length: quantidadeLinhas }, (_, y) =>
            Array.from({ length: quantidadeColunas }, (_, x) =>
              this.valores[linha - 1 + y]?.[coluna - 1 + x] ?? ''));
          if (this.refDuranteLeitura && linha === 1 && quantidadeLinhas > 1) {
            valores[0][quantidadeColunas - 1] = '#REF!';
          }
          return metodo === 'getDisplayValues'
            ? valores.map(registro => registro.map(String)) : valores;
        };
        return {
          getValues: () => ler('getValues'),
          getDisplayValues: () => ler('getDisplayValues'),
          setValues: valores => {
            eventos.push({ tipo: 'escrita', metodo: 'setValues', nome });
            valores.forEach((registro, y) => {
              const destino = this.valores[linha - 1 + y] ||= [];
              registro.forEach((valor, x) => { destino[coluna - 1 + x] = valor; });
            });
          }
        };
      }
    };
    abas.set(nome, aba);
  }

  const bloqueio = {
    tryLock: () => { eventos.push({ tipo: 'lock' }); return true; },
    releaseLock: () => eventos.push({ tipo: 'release' })
  };
  const contexto = vm.createContext({
    SpreadsheetApp: {
      openById: id => {
        eventos.push({ tipo: 'open', id });
        return { getSheetByName: nome => abas.get(nome) };
      },
      flush: () => eventos.push({ tipo: 'flush' })
    },
    LockService: { getDocumentLock: () => bloqueio, getScriptLock: () => bloqueio },
    PropertiesService: {
      getScriptProperties: () => {
        eventos.push({ tipo: 'propriedades' });
        return {
          getProperty: chave => propriedades.get(chave),
          setProperty: (chave, valor) => {
            eventos.push({ tipo: 'propriedadeEscrita', chave, valor });
            propriedades.set(chave, valor);
          }
        };
      }
    },
    Logger: { log: (...args) => eventos.push({ tipo: 'log', args }) }
  });
  vm.runInContext(source, contexto);
  vm.runInContext('CONFIG_ATUALIZAR_PCPS.abas.forEach(cfg => cfg.minLinhasDados = 2); CONFIG_ATUALIZAR_PCPS.tamanhoLote = 2;', contexto);

  return { contexto, eventos, abas, nomes, destinos, propriedades };
}

function executar(p) {
  assert.doesNotThrow(() => p.contexto.atualizarPCPs());
}

function conferirAbortouAntesDosDados(p) {
  assert.equal(p.eventos.filter(evento => evento.tipo === 'release').length, 1, 'Sempre libera o bloqueio');
  assert.equal(p.eventos.filter(evento => evento.tipo === 'escrita').length, 0, 'Nenhum destino pode ser alterado');
  assert.equal(p.eventos.filter(evento => evento.tipo === 'flush').length, 0, 'Encerra antes de provocar recalculo');
  assert.equal(p.eventos.filter(evento => evento.tipo === 'propriedades').length, 0, 'Encerra antes de acessar o estado da atualizacao');
  assert.equal(p.eventos.filter(evento => evento.tipo === 'propriedadeEscrita').length, 0);
  const leituras = p.eventos.filter(evento => evento.tipo === 'leitura');
  assert.ok(leituras.length > 0);
  for (const leitura of leituras) {
    assert.equal(leitura.linha, 1, 'A trava examina somente o cabecalho');
    assert.equal(leitura.quantidadeLinhas, 1, 'Nenhuma linha de dados pode ser lida ao bloquear');
  }
  for (const destino of p.destinos) {
    assert.deepEqual(p.abas.get(destino).valores, [['BASE ANTERIOR', destino]]);
  }
}

for (const nome of ['PCP_PGBM', 'ACABADORAS_PGBM']) {
  for (const [coluna, erro] of [[0, '#REF!'], [4, '#REF!'], [4, '  #ref!  '], [4, 'REF'], [4, ' ref ']]) {
    test(`${nome}: ${JSON.stringify(erro)} na coluna ${coluna + 1} do cabecalho interrompe sem alteracoes`, () => {
      const p = atualizador();
      p.abas.get(nome).valores[0][coluna] = erro;
      executar(p);
      conferirAbortouAntesDosDados(p);
    });
  }
}

test('A trava de REF nao examina a segunda linha ou as demais linhas de dados', () => {
  const p = atualizador();
  p.abas.get('PCP_PGBM').valores[1][4] = '#REF!';
  p.abas.get('ACABADORAS_PGBM').valores[2][3] = 'REF';
  executar(p);
  for (const [indice, nome] of p.nomes.entries()) {
    assert.deepEqual(p.abas.get(p.destinos[indice]).valores, p.abas.get(nome).valores);
  }
  assert.equal(p.propriedades.size, 2);
});

test('Cabecalho legitimo REFERÊNCIA permite a copia completa de ambas as origens', () => {
  const p = atualizador();
  executar(p);
  for (const [indice, nome] of p.nomes.entries()) {
    assert.deepEqual(p.abas.get(p.destinos[indice]).valores, p.abas.get(nome).valores);
  }
  assert.equal(p.propriedades.get('ATUALIZAR_PCPS_ULTIMO_VOLUME_PCP_PGBM'), '2');
  assert.equal(p.propriedades.get('ATUALIZAR_PCPS_ULTIMO_VOLUME_ACABADORAS_PGBM'), '2');
  assert.equal(p.eventos.filter(evento => evento.tipo === 'release').length, 1);
});

test('Depois de um REF temporario, a proxima execucao tenta e atualiza normalmente', () => {
  const p = atualizador();
  const origem = p.abas.get('ACABADORAS_PGBM');
  origem.valores[0][4] = '#REF!';
  executar(p);
  conferirAbortouAntesDosDados(p);

  origem.valores[0][4] = 'TIRAGEM';
  p.eventos.length = 0;
  executar(p);
  for (const [indice, nome] of p.nomes.entries()) {
    assert.deepEqual(p.abas.get(p.destinos[indice]).valores, p.abas.get(nome).valores);
  }
  assert.equal(p.propriedades.size, 2);
  assert.equal(p.eventos.filter(evento => evento.tipo === 'release').length, 1);
});

test('REF surgido no cabecalho ao ler o primeiro lote ainda preserva ambos os destinos', () => {
  const p = atualizador();
  p.abas.get('ACABADORAS_PGBM').refDuranteLeitura = true;
  executar(p);
  assert.equal(p.eventos.filter(evento => evento.tipo === 'escrita').length, 0);
  assert.equal(p.eventos.filter(evento => evento.tipo === 'propriedadeEscrita').length, 0);
  assert.equal(p.eventos.filter(evento => evento.tipo === 'release').length, 1);
  for (const destino of p.destinos) {
    assert.deepEqual(p.abas.get(destino).valores, [['BASE ANTERIOR', destino]]);
  }
});
