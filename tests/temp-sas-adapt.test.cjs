const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const contexto = vm.createContext({
  Date,
  Utilities: {
    formatDate(value, zone, format) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone === 'GMT' ? 'UTC' : zone,
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date(value));
      const date = Object.fromEntries(parts.map(p => [p.type, p.value]));
      return format === 'dd/MM/yyyy' ? `${date.day}/${date.month}/${date.year}` : `${date.year}-${date.month}-${date.day}`;
    }
  }
});
vm.runInContext(fs.readFileSync(path.join(root, 'TempSasAdapt.js'), 'utf8'), contexto);

const hoje = '2026-10-15';
const pHeader = ['ID', 'GRÁFICA', 'UNIDADE', 'ENVIO', 'CARACTERÍSTICA DA SOLICITAÇÃO', 'SKU',
  'CD DESTINO', 'TIRAGEM', 'TIRAGEM TOTAL', 'TIRAGEM COLETADA', 'Data_Coleta_Mapa', 'Entrega_TP'];
const aHeader = ['ID', 'GRÁFICA', 'UNIDADE', 'ENVIO', 'CARACTERÍSTICA DA SOLICITAÇÃO', 'SKU',
  'CD DESTINO', 'TIRAGEM A ENTREGAR (total por CD)', 'Tiragem recebida (Total SKU)',
  'Formação de kit/Encaixotamento Final Real', 'Acbto Final Real'];
const tabela = (header, rows) => [header.slice(), ...rows.map(row => header.map(key => row[key] ?? ''))];
const pLinha = (overrides = {}) => ({
  ID: 'PCP-1', 'GRÁFICA': 'LOGPRINT', UNIDADE: 'SAS ADAPT', ENVIO: 'V1',
  'CARACTERÍSTICA DA SOLICITAÇÃO': 'PRODUÇÃO COM ACABADORA', SKU: 'SKU-1', 'CD DESTINO': 'ATHOS',
  TIRAGEM: 100, 'TIRAGEM TOTAL': 100, 'TIRAGEM COLETADA': 0, ...overrides
});
const aLinha = (overrides = {}) => ({
  ID: 'ATHOS-1', 'GRÁFICA': 'ATHOS', UNIDADE: 'SAS', ENVIO: 'V1',
  'CARACTERÍSTICA DA SOLICITAÇÃO': 'PRODUÇÃO', SKU: 'SKU-1', 'CD DESTINO': 'JUNDIAÍ - SP',
  'TIRAGEM A ENTREGAR (total por CD)': 100, 'Tiragem recebida (Total SKU)': 100, ...overrides
});
const resumo = (pcp, athos) => contexto.pgTempSasAdaptResumo_(tabela(pHeader, pcp), tabela(aHeader, athos), hoje);

function exemplo() {
  return {
    pcp: [
      pLinha({ ID: 'PCP-1', TIRAGEM: 40, 'TIRAGEM COLETADA': 150, Data_Coleta_Mapa: '12/10/2026', Entrega_TP: '14/10/2026' }),
      pLinha({ ID: 'PCP-2', TIRAGEM: 60, 'TIRAGEM TOTAL': 0 }),
      pLinha({ ID: 'PCP-3', 'GRÁFICA': 'MAXIGRAFICA' }),
      pLinha({ ID: 'PCP-4', 'GRÁFICA': 'IMOS', SKU: 'SKU-2', TIRAGEM: 50, 'TIRAGEM TOTAL': 50, 'TIRAGEM COLETADA': 20 })
    ],
    athos: [
      aLinha({ ID: 'ATHOS-1', 'TIRAGEM A ENTREGAR (total por CD)': 60, 'Tiragem recebida (Total SKU)': 170,
        'Formação de kit/Encaixotamento Final Real': '15/10/2026' }),
      aLinha({ ID: 'ATHOS-2', 'CD DESTINO': 'ITAITINGA - CE', 'TIRAGEM A ENTREGAR (total por CD)': 40,
        'Tiragem recebida (Total SKU)': 170 }),
      aLinha({ ID: 'ATHOS-3', UNIDADE: 'SAS ADAPT', SKU: 'SKU-2', 'TIRAGEM A ENTREGAR (total por CD)': 50,
        'Tiragem recebida (Total SKU)': 30, 'Formação de kit/Encaixotamento Final Real': '16/10/2026' })
    ]
  };
}

test('três indicadores usam saída das gráficas, PCP da Athos e finalização dos kits na Athos', () => {
  const { pcp, athos } = exemplo();
  const r = resumo(pcp, athos);
  assert.equal(r.pcpTotal, 250);
  assert.equal(r.saiuGraficas, 120);
  assert.equal(r.saiuGraficasBruto, 170);
  assert.equal(r.totalAthos, 150);
  assert.equal(r.recebidoAthos, 200);
  assert.equal(r.recebidoAthosReconhecido, 130);
  assert.equal(r.produzidoAthos, 60);
  assert.equal(r.coletadoAthos, 0, 'BP finalizado não prova coleta no Mapa de Saída');
  assert.deepEqual(Array.from(r.expedicoesAthos, x => [x.destino,x.total,x.coletado]),
    [['CD JDI',110,0],['CD FOR',40,0]]);
  assert.equal(r.producaoApontada, true);
  const logprint = r.graficas.find(x => x.nome === 'LOGPRINT');
  assert.equal(logprint.total, 100);
  assert.equal(logprint.saiu, 100);
  assert.equal(logprint.saiuBruto, 150);
  assert.equal(logprint.excedente, 50);
  assert.equal(r.linhasGraficas.length, 4);
  assert.equal(r.linhasAthos.length, 3);
  assert.equal(r.linhasGraficas[0].linha, 2);
  assert.equal(r.linhasGraficas[0].id, 'PCP-1');
  assert.equal(r.linhasGraficas[0].tiragemRaw, 40);
  assert.equal(r.linhasGraficas[0].dataColeta, '12/10/2026');
  assert.equal(r.linhasAthos[0].id, 'ATHOS-1');
  assert.equal(r.linhasAthos[0].produzido, 60);
});

test('excedente não cobre pendências de outra gráfica ou outro destino do mesmo SKU', () => {
  const pcp = [
    pLinha({ ID: '1', 'TIRAGEM TOTAL': 40, 'TIRAGEM COLETADA': 250 }),
    pLinha({ ID: '2', 'TIRAGEM TOTAL': 60 }),
    pLinha({ ID: '3', 'CD DESTINO': 'ACABADORA - ATHOS' }),
    pLinha({ ID: '4', 'GRÁFICA': 'MAXIGRAFICA' }),
    pLinha({ ID: '5', SKU: 'SKU-2' })
  ];
  const r = resumo(pcp, []);
  assert.equal(r.pcpTotal, 400, 'BA soma as parcelas de total, sem trocar por TIRAGEM ou máximo');
  assert.equal(r.saiuGraficas, 100, 'AZ excedente é limitado à operação de origem');
  assert.equal(r.saiuGraficasBruto, 250);
  assert.equal(r.graficas.find(x => x.nome === 'LOGPRINT').saiu, 100);
  assert.equal(r.graficas.find(x => x.nome === 'MAXIGRAFICA').saiu, 0);
  assert.equal(r.linhasGraficas.reduce((n, x) => n + x.saiuReconhecido, 0), r.saiuGraficas,
    'a auditoria alocada por linha reconcilia com o indicador');
});

test('Athos aceita SAS apenas para SKUs de origem SAS Adapt V1 e exclui outros escopos', () => {
  const pcp = [pLinha(),
    pLinha({ SKU: 'CANCELADO', 'CARACTERÍSTICA DA SOLICITAÇÃO': 'Cancelado' }),
    pLinha({ SKU: 'REENTRADA', 'CARACTERÍSTICA DA SOLICITAÇÃO': 'Reentrada' }),
    pLinha({ SKU: 'OUTRO-ENVIO', ENVIO: 'V2' }),
    pLinha({ SKU: 'OUTRO-DESTINO', 'CD DESTINO': 'CD JDI' }),
    pLinha({ SKU: 'OUTRA-UNIDADE', UNIDADE: 'SAS' })];
  const athos = [aLinha({ ID: 'VALIDO-SAS' }), aLinha({ ID: 'VALIDO-ADAPT', UNIDADE: 'SAS ADAPT' }),
    aLinha({ ID: 'OUTRO-SKU', SKU: 'SEM-ORIGEM' }),
    aLinha({ ID: 'CANCELADO', 'CARACTERÍSTICA DA SOLICITAÇÃO': 'Cancelado' }),
    aLinha({ ID: 'REENTRADA', 'CARACTERÍSTICA DA SOLICITAÇÃO': 'Reentrada' }),
    aLinha({ ID: 'OUTRA-GRAFICA', 'GRÁFICA': 'LOGPRINT' }),
    aLinha({ ID: 'OUTRO-ENVIO', ENVIO: 'V2' }),
    aLinha({ ID: 'OUTRA-UNIDADE', UNIDADE: 'SAE' })];
  const r = resumo(pcp, athos);
  assert.equal(r.pcpTotal, 100);
  assert.equal(r.totalAthos, 200);
  assert.deepEqual(Array.from(r.linhasGraficas, x => x.sku), ['SKU-1']);
  assert.deepEqual(Array.from(r.linhasAthos, x => x.id).sort(), ['VALIDO-ADAPT', 'VALIDO-SAS']);
});

test('recebido é um único total por SKU, limitado ao seu próprio PCP para o saldo programado', () => {
  const r = resumo([pLinha(), pLinha({ SKU: 'SKU-2' })], [
    aLinha({ 'TIRAGEM A ENTREGAR (total por CD)': 60, 'Tiragem recebida (Total SKU)': 170 }),
    aLinha({ ID: '2', 'CD DESTINO': 'ITAITINGA - CE', 'TIRAGEM A ENTREGAR (total por CD)': 40,
      'Tiragem recebida (Total SKU)': 150 }),
    aLinha({ ID: '3', SKU: 'SKU-2', 'Tiragem recebida (Total SKU)': 30 })
  ]);
  assert.equal(r.totalAthos, 200);
  assert.equal(r.recebidoAthos, 200, 'BB usa máximo por SKU e não soma repetições nos CDs');
  assert.equal(r.recebidoAthosReconhecido, 130, 'excedente de SKU-1 não supre SKU-2');
  const s1 = r.athosPorSku.find(x => x.sku === 'SKU-1');
  const s2 = r.athosPorSku.find(x => x.sku === 'SKU-2');
  assert.equal(s1.total, 100);
  assert.equal(s1.recebido, 170);
  assert.equal(s1.recebidoReconhecido, 100);
  assert.equal(s2.recebidoReconhecido, 30);
  assert.equal(r.totalAthos - r.recebidoAthosReconhecido, 70);
  assert.deepEqual(Array.from(r.linhasAthos, x => x.recebidoRaw), [170, 150, 30],
    'a auditoria mantém cada BB original, inclusive a divergência entre CDs');
  assert.equal(r.linhasAthos.reduce((n, x) => n + x.recebido, 0), r.recebidoAthos);
  assert.equal(r.linhasAthos.reduce((n, x) => n + x.recebidoReconhecido, 0), r.recebidoAthosReconhecido);
});

test('produzido exige BP final válido até hoje; recebimento, coleta e acabamento isolado não finalizam kit', () => {
  const serial = Date.UTC(2026, 9, 14) / 86400000 + 25569;
  const datas = ['15/10/2026', '2026-10-14', serial, new Date('2026-10-15T03:00:00Z'),
    '16/10/2026', '31/02/2026', 'texto inválido', ''];
  const athos = datas.map((data, i) => aLinha({
    ID: `FINAL-${i}`, 'TIRAGEM A ENTREGAR (total por CD)': 10,
    'Formação de kit/Encaixotamento Final Real': data, 'Acbto Final Real': '10/10/2026',
    'Tiragem recebida (Total SKU)': 80, Data_Coleta_Mapa: '10/10/2026', Entrega_TP: '12/10/2026'
  }));
  const r = resumo([pLinha()], athos);
  assert.equal(r.totalAthos, 80);
  assert.equal(r.produzidoAthos, 40);
  assert.equal(r.producaoApontada, true);
  assert.deepEqual(Array.from(r.linhasAthos, x => x.produzido), [10, 10, 10, 10, 0, 0, 0, 0]);
  const semFinal = resumo([pLinha()], athos.slice(4));
  assert.equal(semFinal.produzidoAthos, 0);
  assert.equal(semFinal.producaoApontada, false);
  assert.ok(Array.from(semFinal.athosPorSku).every(x => x.producaoApontada === false));
});

test('saída original ATHOS para CDs comprova finalização sem BP, sem duplicar mapa ou compensar outro CD', () => {
  const pcp = [pLinha()];
  const athos = [
    aLinha({ ID: 'JDI', 'CD DESTINO': 'JUNDIAÍ - SP', 'TIRAGEM A ENTREGAR (total por CD)': 60 }),
    aLinha({ ID: 'FOR', 'CD DESTINO': 'ITAITINGA - CE', 'TIRAGEM A ENTREGAR (total por CD)': 40 })
  ];
  const saidas = [
    { sku: 'SKU-1', destino: 'CD JDI', codigoMapa: 'MP-1', coletado: 35 },
    { sku: 'SKU-1', destino: 'JUNDIAÍ - SP', codigoMapa: 'MP-1', coletado: 35 },
    { sku: 'SKU-1', destino: 'CD JDI', codigoMapa: 'MP-3', coletado: 8 },
    { sku: 'SKU-1', destino: 'FORTALEZA', codigoMapa: 'MP-2', coletado: 20 },
    { sku: 'SKU-2', destino: 'JUNDIAÍ - SP', codigoMapa: 'MP-4', coletado: 100 }
  ];
  const r = contexto.pgTempSasAdaptResumo_(tabela(pHeader, pcp), tabela(aHeader, athos), hoje, saidas);
  assert.equal(r.produzidoAthos, 63);
  assert.equal(r.coletadoAthos, 63);
  assert.deepEqual(Array.from(r.expedicoesAthos, x => [x.destino,x.total,x.coletado]),
    [['CD JDI',60,43],['CD FOR',40,20]]);
  assert.deepEqual(Array.from(r.athosPorSku, x => [x.sku,x.coletado]), [['SKU-1',63]]);
  assert.equal(r.producaoApontada, true);
  assert.deepEqual(Array.from(r.linhasAthos, x => x.saidaMapa), [43, 20]);
  assert.deepEqual(Array.from(r.linhasAthos, x => x.produzido), [43, 20]);
  assert.equal(r.linhasAthos[0].statusFinalizacao, 'Saída Athos para CD confirmada');
  // BP já finalizado e Mapa de Saída não são somados na mesma linha.
  athos[0]['Formação de kit/Encaixotamento Final Real'] = '15/10/2026';
  const comBP = contexto.pgTempSasAdaptResumo_(tabela(pHeader, pcp), tabela(aHeader, athos), hoje, saidas);
  assert.equal(comBP.produzidoAthos, 80);
  assert.equal(comBP.coletadoAthos, 63, 'BP não soma nem antecipa coleta');
  assert.deepEqual(Array.from(comBP.linhasAthos, x => x.coletado), [43,20]);
});

test('colunas de total e finalização são obrigatórias e não viram números silenciosamente errados', () => {
  const { pcp, athos } = exemplo();
  const p = tabela(pHeader, pcp), a = tabela(aHeader, athos);
  p[0][pHeader.indexOf('TIRAGEM TOTAL')] = 'OUTRA COLUNA';
  assert.throws(() => contexto.pgTempSasAdaptResumo_(p, a, hoje), /TIRAGEM TOTAL/);
  const aSemFinal = tabela(aHeader, athos);
  aSemFinal[0][aHeader.indexOf('Formação de kit/Encaixotamento Final Real')] = 'OUTRA COLUNA';
  assert.throws(() => contexto.pgTempSasAdaptResumo_(tabela(pHeader, pcp), aSemFinal, hoje), /Final Real/i);
  assert.throws(() => contexto.pgTempSasAdaptResumo_(tabela(pHeader, pcp), a, 'data inválida'), /data|hoje/i);
});

test('endpoint usa PCP para gráficas e Mapa original mais fontes do CD para entregas', () => {
  const p = tabela(['COLUNA EXTRA', ...pHeader].reverse(), [
    pLinha({ ID: 'PCP-LINHA-3', TIRAGEM: 999, 'TIRAGEM COLETADA': 25 }),
    pLinha({ ID: 'PCP-LINHA-4', SKU: 'SKU-2', 'TIRAGEM TOTAL': 50, 'TIRAGEM COLETADA': 10 })
  ]);
  p.splice(1, 0, []);
  const mapaLinha = Array(50).fill('');
  mapaLinha[1] = 'CD ERRADO PCP'; // B: nao usar
  mapaLinha[2] = 'ATHOS'; // C: GRÁFICA PCP é a única coluna PCP usada
  mapaLinha[4] = 'MP-ATHOS-SKU-2'; // E: codigo mapa
  mapaLinha[6] = 'JUNDIAÍ - SP'; // G: CD ORIGINAL
  mapaLinha[7] = 'V1'; // H: envio original
  mapaLinha[10] = 'K-1'; // K: KIT original
  mapaLinha[11] = 'SKU-2'; // L: SKU original
  mapaLinha[13] = 'LOGPRINT'; // N: gráfica original, não deve ser usada
  mapaLinha[14] = 45; // O: TIRAGEM original
  mapaLinha[39] = 20; // AN: Volume Coletado
  mapaLinha[45] = '14/10/2026'; // AT: Coleta TP
  mapaLinha[49] = 'V1'; // AX: envio normalizado
  const semColeta = mapaLinha.slice();
  semColeta[4] = 'MP-ATHOS-FOR';
  semColeta[6] = 'ITAITINGA - CE';
  semColeta[10] = 'K-2';
  semColeta[14] = 30;
  semColeta[39] = 0;
  const outraGrafica = mapaLinha.slice();
  outraGrafica[2] = 'LOGPRINT'; outraGrafica[13] = 'ATHOS';
  const outroEnvio = mapaLinha.slice();
  outroEnvio[7] = 'V2';
  const semCDOriginal = mapaLinha.slice();
  semCDOriginal[1] = 'CD JDI'; semCDOriginal[6] = '';
  const mapa = [Array.from({length: 50}, (_, i) => 'COLUNA ' + i), mapaLinha, semColeta,
    outraGrafica, outroEnvio, semCDOriginal];
  const sheets = { PCP: p, 'MAPA DE SAÍDA': mapa };
  const fontes = {
    'planilha-teste': sheets,
    '1qyRgj1_hdiJDo1zEu21vMSioeZe_i-emmnCPV4FMErk': {
      'SAS V1 27': [['Cód Kit', 'Cód Item', 'Recebido'], ['K-1', 'SKU-2', 3], [], ['K-1', 'SKU-2', 7],
        ['K-OUTRO', 'SKU-2', 888], ['K-1', 'SKU-NÃO-ENVIADO', 999]]
    },
    '1nCVxwkQw_loqHCGahYoTa-8ZyFy42gXg7hC2MliUoHM': {
      'SAS V1 27': [['Cód Kit', 'Cód Item', 'Recebido'], ['K-2', 'SKU-2', 0], ['K-1', 'SKU-2', 4]]
    }
  };
  const sourceRequests = [], headers = [], batches = [];
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-15T15:00:00Z'])); }
  };
  const api = vm.createContext({
    Date: FixedDate, Utilities: contexto.Utilities,
    pgFonteExternaCache_(names) { sourceRequests.push(Array.from(names)); return 'planilha-teste'; },
    pgMetadadosPlanilhaCache_(id) {
      return { id, nomes: Object.keys(fontes[id]), abas: Object.entries(fontes[id]).map(([title, rows]) => ({
        title, gridProperties: { rowCount: 12, columnCount: rows[0].length }
      })) };
    },
    Sheets: { Spreadsheets: { Values: {
      get(id, range, options) {
        const match = /^'([^']+)'!A1:([A-Z]+)1$/.exec(range);
        assert.ok(match, range);
        assert.equal(options.dateTimeRenderOption, 'SERIAL_NUMBER');
        headers.push(match[1]);
        return { values: [fontes[id][match[1]][0]] };
      },
      batchGet(id, options) {
        assert.equal(options.valueRenderOption, 'UNFORMATTED_VALUE');
        batches.push(Array.from(options.ranges));
        return { valueRanges: options.ranges.map(range => {
          const match = /^'([^']+)'!([A-Z]+)([12]):\2(\d+)$/.exec(range);
          assert.ok(match, range);
          const column = Array.from(match[2]).reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1;
          const values = fontes[id][match[1]].slice(Number(match[3]) - 1)
            .map(row => row[column] == null || row[column] === '' ? [] : [row[column]]);
          while (values.length && !values.at(-1).length) values.pop();
          return { values };
        }) };
      }
    } } }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'TempSasAdapt.js'), 'utf8'), api);
  const r = api.getTempSasAdapt();
  assert.deepEqual(sourceRequests, [['PCP'], ['MAPA DE SAÍDA','MAPA DE SAIDA','MAPA DE SAIDA ']]);
  assert.deepEqual(headers, ['PCP', 'SAS V1 27', 'SAS V1 27']);
  assert.equal(batches.length, 4);
  assert.equal(batches[0].length, pHeader.length);
  assert.deepEqual(batches[1], ['C','E','G','H','K','L','O','AN','AT'].map(c => "'MAPA DE SAÍDA'!" + c + "2:" + c + "12"));
  assert.equal(r.pcpTotal, 150);
  assert.equal(r.saiuGraficas, 35);
  assert.equal(r.totalAthos, 75, 'total da expedição soma O inclusive quando AN está zerada');
  assert.equal('recebidoAthos' in r, false);
  assert.equal('produzidoAthos' in r, false);
  assert.equal(r.coletadoAthos, 20, 'saída efetiva somente de AN no Mapa original com gráfica PCP=ATHOS');
  assert.deepEqual(Array.from(r.expedicoesAthos, x => [x.destino,x.total,x.coletado,x.internalizado]),
    [['CD JDI',45,20,10], ['CD FOR',30,0,0]]);
  assert.equal(r.internalizadoAthos, 10);
  assert.deepEqual(Array.from(r.internalizacaoIndisponivel), []);
  assert.equal(r.internalizacaoSemCorrespondencia, 0);
  assert.deepEqual(Array.from(r.athosPorSku, x => [x.kit,x.sku,x.destino,x.total,x.coletado,x.internalizado]),
    [['K-1','SKU-2','CD JDI',45,20,10], ['K-2','SKU-2','CD FOR',30,0,0]]);
  assert.deepEqual(Array.from(r.linhasGraficas, row => row.linha), [3, 4]);
  assert.equal('linhasAthos' in r, false);
  assert.equal(r.dataReferencia, hoje);
  assert.match(r.atualizadoEm, /^2026-10-15T/);
});

test('mapa Athos separa kits no mesmo SKU e CD e conserva os volumes e os totais', () => {
  const entrada = [
    {sku:'SKU-1', destino:'CD JDI', kit:'K-1', codigoMapa:'MP-1', tiragem:10, coletado:8},
    {sku:'SKU-1', destino:'Jundiaí - SP', kit:'K-1', codigoMapa:'MP-1', tiragem:9, coletado:12},
    {sku:'SKU-1', destino:'CD JDI', kit:'K-2', codigoMapa:'MP-1', tiragem:4, coletado:5},
    {sku:'SKU-1', destino:'CD JDI', kit:'K-1', codigoMapa:'MP-4', tiragem:3, coletado:2},
    {sku:'SKU-1', destino:'CD FOR', kit:'K-1', codigoMapa:'MP-1', tiragem:4, coletado:0},
    {sku:'SKU-2', destino:'CD JDI', kit:'K-2', codigoMapa:'MP-2', tiragem:2, coletado:0},
    {sku:'SKU-1', destino:'CD RP', kit:'K-1', codigoMapa:'MP-3', tiragem:30, coletado:20}
  ];
  const vinculo = (sku, kit) => JSON.stringify([sku, kit]);
  const jdi = {
    [vinculo('SKU-1', 'K-1')]: 7,
    [vinculo('SKU-1', 'K-OUTRO')]: 99,
    [vinculo('SKU-2', 'K-2')]: 0
  };
  const r = contexto.pgTempSasAdaptSaidaPorSkuCD_(entrada, {porCD:{'CD JDI':jdi}, indisponiveis:['CD FOR']});
  assert.deepEqual(Array.from(r.athosPorSku, x => [x.kit,x.sku,x.destino,x.total,x.coletado,x.internalizado]), [
    ['K-1','SKU-1','CD FOR',4,0,null], ['K-1','SKU-1','CD JDI',13,14,7],
    ['K-2','SKU-1','CD JDI',4,5,null],
    ['K-2','SKU-2','CD JDI',2,0,0]
  ]);
  assert.deepEqual(Array.from(r.expedicoesAthos, x => [x.destino,x.total,x.coletado,x.internalizado]),
    [['CD JDI',19,19,7], ['CD FOR',4,0,null]]);
  assert.equal(r.totalAthos, 23);
  assert.equal(r.coletadoAthos, 19);
  assert.equal(r.internalizadoAthos, null);
  assert.deepEqual(Array.from(r.internalizacaoIndisponivel), ['CD FOR']);
  assert.equal(r.internalizacaoSemCorrespondencia, 1, 'falha da fonte de FOR não entra nas correspondências ausentes');

  const legivel = contexto.pgTempSasAdaptSaidaPorSkuCD_(entrada, {
    porCD:{'CD JDI':jdi, 'CD FOR':{[vinculo('SKU-1', 'K-OUTRO')]:99}}, indisponiveis:[]
  });
  assert.equal(legivel.internalizacaoSemCorrespondencia, 2);
  assert.equal(legivel.expedicoesAthos.find(cd => cd.destino === 'CD FOR').internalizado, null);
  assert.equal(legivel.internalizadoAthos, 7, 'CD legível sem correspondências não esconde os valores confirmados');
});

function frontHarness(data) {
  const html = fs.readFileSync(path.join(root, 'abaTempSasAdapt.html'), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(match[1], { id: match[1], textContent: '', innerHTML: '', value: '', className: '' });
  }
  const downloads = [];
  const blobs = [];
  let success;
  const run = {
    withSuccessHandler(fn) { success = fn; return run; },
    withFailureHandler() { return run; },
    getTempSasAdapt() { success(data); }
  };
  const context = vm.createContext({
    document: {
      getElementById(id) { return elements.get(id) || null; },
      body: { appendChild() {}, removeChild() {} },
      createElement() { return { click() { downloads.push({ href: this.href, download: this.download }); } }; }
    },
    google: { script: { run } }, window: {},
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; blobs.push(this); } },
    URL: { createObjectURL() { return 'blob:test-download'; }, revokeObjectURL() {} },
    setTimeout() {}, alert(message) { assert.fail(message); }, console
  });
  for (const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInContext(script[1], context);
  return { html, elements, context, downloads, blobs };
}

function dadosVisaoAthos() {
  const { pcp, athos } = exemplo();
  const data = resumo(pcp, athos);
  data.athosPorSku = [
    {kit:'KIT-A',sku:'SKU-1',destino:'CD JDI',total:60,coletado:40,internalizado:55},
    {kit:'KIT-B',sku:'SKU-1',destino:'CD JDI',total:40,coletado:35,internalizado:50},
    {kit:'KIT-C',sku:'SKU-2',destino:'CD FOR',total:50,coletado:0,internalizado:10}
  ];
  data.expedicoesAthos = [
    {destino:'CD JDI',total:100,coletado:75,internalizado:105},
    {destino:'CD FOR',total:50,coletado:0,internalizado:10}
  ];
  data.totalAthos = 150;
  data.coletadoAthos = 75;
  data.internalizadoAthos = 115;
  data.internalizacaoSemCorrespondencia = 2;
  return data;
}

test('visão usa a tiragem total como base dos cards e mantém uma linha por kit, SKU e CD', () => {
  const h = frontHarness(dadosVisaoAthos());
  h.context.window.pgCarregarTempSasAdapt(true);
  assert.match(h.html, /Tiragem coletada na Athos/);
  assert.match(h.html, /Entregas no CD · Internalizado/);
  assert.match(h.html, /Entregas no CD · SKUs/);
  assert.match(h.html, /id="pgTempLabelTotal"[^>]*>Tiragem total<\/h3>/);
  assert.deepEqual(Array.from(h.html.matchAll(/<section class="pg-sas-kpi[^"]*" aria-labelledby="([^"]+)"/g), m => m[1]),
    ['pgTempLabelTotal','pgTempLabelAthos','pgTempLabelColetado','pgTempLabelInternalizado']);
  assert.equal(h.elements.get('pgTempTotalVolume').textContent, '250');
  assert.match(h.elements.get('pgTempTotalPct').textContent, /^100%/);
  assert.equal(h.elements.get('pgTempAthosProgramado').textContent, '150');
  assert.match(h.elements.get('pgTempAthosTotalPct').textContent, /^60%/);
  assert.equal(h.elements.get('pgTempColetadoVolume').textContent, '75');
  assert.match(h.elements.get('pgTempColetadoPct').textContent, /^30%/);
  assert.equal(h.elements.get('pgTempInternalizadoVolume').textContent, '115');
  assert.match(h.elements.get('pgTempInternalizadoPct').textContent, /^46%/);
  assert.match(h.elements.get('pgTempInternalizadoPct').textContent, /2 vínculos kit\/SKU sem registro/);
  assert.match(h.elements.get('pgTempTabelaGraficas').innerHTML, /LOGPRINT/);
  assert.match(h.elements.get('pgTempTabelaExpedicoesAthos').innerHTML, /CD JDI/);
  const linhas = Array.from(h.elements.get('pgTempTabelaAthos').innerHTML.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g), m => m[1]);
  assert.equal(linhas.length, 3);
  assert.match(linhas[0], /KIT-A.*SKU-1.*CD JDI.*100%.*66,67%.*91,67%/);
  assert.match(linhas[1], /KIT-B.*SKU-1.*CD JDI.*100%.*87,5%.*125%/);
  assert.equal(h.elements.get('pgTempQtdSku').textContent, '3 linhas · 2 SKUs');
  h.elements.get('pgTempFiltroSku').value = 'SKU-2';
  h.context.window.pgFiltrarTempSasAdapt();
  assert.match(h.elements.get('pgTempTabelaAthos').innerHTML, /KIT-C.*SKU-2.*CD FOR.*100%.*0%.*20%/);
  assert.doesNotMatch(h.elements.get('pgTempTabelaAthos').innerHTML, /SKU-1/);
  assert.equal(h.elements.get('pgTempQtdSku').textContent, '1 linha · 1 SKU');
  const parcial = dadosVisaoAthos();
  parcial.athosPorSku[2].internalizado = null;
  parcial.internalizadoAthos = null;
  parcial.internalizacaoIndisponivel = ['CD FOR'];
  const missing = frontHarness(parcial);
  missing.context.window.pgCarregarTempSasAdapt(true);
  assert.equal(missing.elements.get('pgTempInternalizadoVolume').textContent, '—');
  assert.equal(missing.elements.get('pgTempInternalizadoPct').textContent, 'Fonte indisponível em CD FOR');
  assert.match(missing.elements.get('pgTempTabelaAthos').innerHTML, /SKU-2.*<td>—<\/td>/);
});

test('CSV auditável preserva quantidades negativas e neutraliza fórmulas em campos de texto', () => {
  const data = dadosVisaoAthos();
  data.linhasGraficas[0].id = '=1+1';
  data.linhasGraficas[0].sku = '@COMANDO';
  data.linhasGraficas[0].tiragemRaw = -10;
  data.linhasGraficas[0].saiuBruto = -10;
  const h = frontHarness(data);
  h.context.window.pgCarregarTempSasAdapt(true);
  h.context.window.pgExportarTempSasAdapt('graficas');
  assert.equal(h.downloads.length, 1);
  const csv = h.blobs[0].parts.join('');
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'@COMANDO"/);
  assert.match(csv, /"-10"/);
  assert.doesNotMatch(csv, /"'-10"/);
  const parsed = csv.replace(/^\uFEFF/, '').split('\r\n').map(line =>
    Array.from(line.matchAll(/"((?:[^"]|"")*)"/g), match => match[1].replace(/""/g, '"')));
  const campo = title => parsed[1][parsed[0].indexOf(title)];
  assert.equal(campo('TIRAGEM TOTAL'), '100');
  assert.equal(campo('COLETADO RECONHECIDO (uma vez por operação)'), '100');
  assert.equal(campo('UNIDADE ORIGINAL'), 'SAS ADAPT');
  assert.equal(campo('LINHAS AGRUPADAS NA FONTE'), '2, 3');
  h.elements.get('pgTempFiltroSku').value = 'SKU-1';
  h.context.window.pgExportarTempSasAdapt('athos');
  const athosCsv = h.blobs[1].parts.join('');
  assert.match(athosCsv, /"KIT";"SKU";"CD DESTINO";"TIRAGEM TOTAL";"% TOTAL";"TIRAGEM COLETADA";"% COLETADO";"INTERNALIZADO";"% INTERNALIZADO"/);
  assert.match(athosCsv, /"KIT-A";"SKU-1";"CD JDI";"60";"100%";"40";"66,67%";"55";"91,67%"/);
  assert.match(athosCsv, /"KIT-B";"SKU-1";"CD JDI";"40";"100%";"35";"87,5%";"50";"125%"/);
  assert.equal(athosCsv.split('\r\n').length, 3, 'exporta uma linha por kit para o SKU filtrado');
  assert.doesNotMatch(athosCsv, /SKU-2/);
  h.context.window.pgExportarTempSasAdapt('expedicoesAthos');
  assert.equal(h.downloads.length, 3);
  const expCsv = h.blobs[2].parts.join('');
  assert.match(expCsv, /"CD FOR";"50";"100%";"0";"0%";"10";"20%"/);
});


test('TEMP SAS ADAPT lê Athos pela coluna C; destino, envio, SKU, kit e AN são originais', () => {
  const baseP=[pLinha({SKU:'SKU-1'})];
  const baseA=[aLinha({'CD DESTINO':'-', 'TIRAGEM A ENTREGAR (total por CD)':100})];
  const mapa=[
    {sku:'SKU-1',destino:'JUNDIAÍ - SP',codigoMapa:'MP-873303-SAD-V1-ATHOS',kit:'KIT-1',coletado:15},
    {sku:'SKU-1',destino:'CD JDI',codigoMapa:'MP-873303-SAD-V1-ATHOS',kit:'KIT-2',coletado:25},
    {sku:'SKU-1',destino:'CD JDI',codigoMapa:'MP-873303-SAD-V1-ATHOS',kit:'KIT-1',coletado:15}
  ];
  const result=contexto.pgTempSasAdaptResumo_(tabela(pHeader,baseP),tabela(aHeader,baseA),hoje,mapa);
  assert.equal(result.coletadoAthos,40,'somar kits diferentes do mesmo mapa, mas não repetir a mesma linha/kit');
  assert.equal(result.produzidoAthos,40);
  assert.equal(result.linhasAthos[0].coletado,40);
  assert.deepEqual(Array.from(result.expedicoesAthos, e=>[e.destino,e.total,e.coletado]),[['CD JDI',100,40]]);
  assert.match(result.linhasAthos[0].codigosMapa,/MP-873303-SAD-V1-ATHOS/);
});

test('quando PCP_ACABADORAS não informa CD, expedição tem CD real do mapa e saldo sem CD explícito', () => {
  const baseP=[pLinha({SKU:'SKU-1'})];
  const baseA=[aLinha({'CD DESTINO':'-', 'TIRAGEM A ENTREGAR (total por CD)':100})];
  const mapa=[
    {sku:'SKU-1',destino:'JUNDIAÍ - SP',codigoMapa:'MP-JDI',kit:'KIT-1',coletado:25},
    {sku:'SKU-1',destino:'FORTALEZA',codigoMapa:'MP-FOR',kit:'KIT-2',coletado:15}
  ];
  const result=contexto.pgTempSasAdaptResumo_(tabela(pHeader,baseP),tabela(aHeader,baseA),hoje,mapa);
  assert.equal(result.coletadoAthos,40);
  assert.equal(result.totalAthos,100);
  assert.equal(result.expedicoesAthos.reduce((sum,x)=>sum+x.total,0),100,'não duplica o programa entre os CDs');
  assert.deepEqual(Array.from(result.expedicoesAthos, e=>[e.destino,e.total,e.coletado]),
    [['CD NÃO INFORMADO',60,0],['CD JDI',25,25],['CD FOR',15,15]]);
});

test('entregas por janela aparece na mesma visão e exporta o resumo com a fonte', () => {
  const { pcp, athos } = exemplo();
  const data = resumo(pcp, athos);
  data.entregasPorJanela = [{id:'676724057',titulo:'Janela_1 - 29-09',total:100,
    entregue:40,saldo:60,aConferir:20,pedidos:2}];
  const h = frontHarness(data);
  h.context.window.pgCarregarTempSasAdapt(true);
  const table = h.elements.get('pgTempTabelaJanelas').innerHTML;
  assert.match(table, /Janela 1 - 29\/09/);
  assert.match(table, /40%/);
  assert.match(table, /pg-sas-review/);
  assert.doesNotMatch(h.html, /role="tab(?:list)?"|pgSelecionarJanelaTempSasAdapt/);
  assert.match(h.elements.get('pgTempTabelaGraficas').innerHTML, /LOGPRINT/);
  h.context.window.pgExportarTempSasAdapt('janelas');
  assert.match(h.downloads[0].download, /ENTREGAS_POR_JANELA/);
  const csv = h.blobs[0].parts.join('');
  assert.match(csv, /"PROGRAMADO \(KITS\)"/);
  assert.match(csv, /"COLETA CONFIRMADA \(KITS\)"/);
  assert.match(csv, /"A CONFERIR \(INCLUÍDO NO SALDO\)"/);
  assert.match(csv, /gid=676724057/);
});

test('falha na referência de janelas mantém os indicadores, busca e exportações atuais', () => {
  const { pcp, athos } = exemplo();
  const data = resumo(pcp, athos);
  data.pcpTotal = 1115039;
  data.erroEntregasPorJanela = 'referência indisponível';
  data.entregasPorJanela = [];
  const h = frontHarness(data);
  h.context.window.pgCarregarTempSasAdapt(true);
  assert.match(h.elements.get('pgTempTabelaJanelas').innerHTML, /Não foi possível carregar/);
  assert.equal(h.elements.get('pgTempExportarJanelas').disabled, true);
  assert.equal(h.elements.get('pgTempTotalVolume').textContent, '1.115.039');
  assert.match(h.elements.get('pgTempTotalPct').textContent, /^100%/);
  h.elements.get('pgTempFiltroSku').value = 'SKU-2';
  h.context.window.pgFiltrarTempSasAdapt();
  assert.match(h.elements.get('pgTempTabelaAthos').innerHTML, /SKU-2/);
  h.context.window.pgExportarTempSasAdapt('athos');
  assert.equal(h.downloads.length, 1);
});
