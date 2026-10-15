const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {inflateRawSync} = require('node:zlib');

const repo = path.join(__dirname, '..');
const fimPlan = 'Coleta/Internalização de estoque final (re) plan';
const inicioPlan = 'Coleta/Internalização de estoque inicial (re) plan';
const totalCD = 'TIRAGEM A ENTREGAR (total por CD)';
const plain = value => JSON.parse(JSON.stringify(value));
const parcels = events => Array.from(events, event => [event.data,event.volume]);
const row = (id, extra = {}) => ({
  _SOURCE:'PCP', _ROW_ID:'PCP:'+id, _PG_TP_LINHA:id, ID:id,
  MARCA_FINAL:'COC', UNIDADE:'COC', GRAFICA_FINAL:'FORMA CERTA', 'GRÁFICA':'FORMA CERTA',
  SKU:'SKU-1', SKU_REAL:'SKU-1', ENVIO:'V1', CD_MAPA:'CD JDI', CD_FINAL:'CD JDI', 'CD DESTINO':'CD JDI',
  KIT:'', TIPO:'ALUNO', 'SÉRIE':'1º ANO', serie_corrigida:'1º ANO',
  TIRAGEM:100, 'TIRAGEM COLETADA':0, Coleta_TP:'2026-10-10', Entrega_TP:'2026-10-13',
  [fimPlan]:'2026-10-14', ...extra
});
const movement = (id, volume, extra = {}) => ({
  eventoTPVersao:1, marca:'COC', grafica:'FORMA CERTA', sku:'SKU-1', destino:'CD JDI', envio:'V1',
  linhaMapa:id, codigoMapa:'MP-'+id, chaveMapa:'CHAVE-'+id, kit:'',
  volumeColetado:volume, coletaTP:'2026-10-10', entregaTP:'2026-10-13', ...extra
});

// Executa os motores reais: somente DOM, relógio e download são simulados.
function portal(rows, {cache = {}, today = '2026-10-20', sla = 0} = {}) {
  const downloads = [], blobs = new Map(), canvasTexts = [];
  const controls = {filtroReferencia:{value:'replan'}, pgFiltroOrigem:{value:'TODOS'}, pgFiltroDestino:{value:'TODOS'}};
  const element = () => ({value:'', innerHTML:'', textContent:'', style:{},
    classList:{add(){}, remove(){}, toggle(){}}, appendChild(){}, remove(){},
    click(){downloads.push({name:this.download,blob:blobs.get(this.href),href:this.href});},
    addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    querySelector(){return null;}, querySelectorAll(){return [];}});
  const w = {dadosGlobais:rows, MAPA_SAIDA_CACHE:cache,
    PG_MATRIZ_SLA:[['FORNECEDOR','CD JDI','CD RP'],['FORMA CERTA',sla,sla],['HR',sla,sla]],
    console:{info(){}, warn(){}, error(){}}, arredondar:v=>Math.round(Number(v)||0), formatarBR:String,
    setTimeout(){}, clearTimeout(){}, setInterval(){}, clearInterval(){}, performance:{now:()=>0},
    addEventListener(){}, dispatchEvent(){}, Event:class{}, Blob, TextEncoder,
    alert:message=>assert.fail(message), localStorage:{getItem(){return null;}, setItem(){}},
    URL:{createObjectURL(blob){const url='blob:test-'+blobs.size;blobs.set(url,blob);return url;}, revokeObjectURL(){}}};
  w.document = {getElementById(id){return controls[id]||(id.startsWith('ma')?(controls[id]=element()):null);},
    querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){},
    createElement(tag){
      if(tag!=='canvas')return element();
      return {getContext(){return {scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
        fillText(text){canvasTexts.push(text);}};},toDataURL(){return 'data:image/png;base64,dGVzdA==';}};
    },
    body:element(), head:element()};
  w.window = w;
  vm.createContext(w);
  for (const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html','Scripts_Meta_Armazem_Realizado.html','abaMetaArmazem.html','ExportadorExcel.html']) {
    const source = fs.readFileSync(path.join(repo, name), 'utf8');
    for (const [, script] of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script, w, {filename:name});
  }
  vm.runInContext(`dtHojeISO='${today}';dtHoje=new Date('${today}T12:00:00');`, w);
  w.dadosBaseForecastColeta = rows;
  w.processarMetaArmazem();
  return {w, controls, downloads, canvasTexts, items:w.pgMAVisaoAtual.itens, total:w.pgMAVisaoAtual.total};
}

function value(audit, index, column) {
  const position = audit.cabecalho.indexOf(column);
  assert.notEqual(position, -1, 'Coluna de auditoria: '+column);
  return audit.linhas[index][position];
}

function checkAuditAlignment(app) {
  const audits = [app.w.pgMAObterAuditoria(), app.w.pgMAObterAuditoriaRealizado(), app.w.pgMAObterAuditoriaColetas()];
  const ids = audits.map(audit => {
    assert.equal(audit.linhas.length, app.items.length, 'Uma linha por item em cada quadro');
    assert.equal(audit.linhas.reduce((sum, _, index) => sum+value(audit,index,'Tiragem total'), 0), app.total.total);
    return audit.linhas.map((_, index) => String(value(audit,index,'ID da linha')));
  });
  assert.deepEqual(ids[1], ids[0], 'Previsão e entregas mantêm a mesma linha');
  assert.deepEqual(ids[2], ids[0], 'Previsão e coletas mantêm a mesma linha');
  return audits;
}

test('recorte do Funil usa fonte e linha física mesmo quando ID se repete', () => {
  const rows=[row(101,{ID:77}),row(102,{ID:77})],app=portal(rows);
  app.w.dadosBaseForecastColeta=[rows[0]];
  const audit=app.w.pgMAObterAuditoriaRealizado();
  assert.equal(value(audit,0,'Recorte Funil'),'Sim');
  assert.equal(value(audit,1,'Recorte Funil'),'Não');
});

test('agrupamento sem KIT conserva total, realizado e saldo numa linha com última previsão', () => {
  const rows = [row(101, {'TIRAGEM COLETADA':250}), row(102, {TIRAGEM:200, [fimPlan]:'2026-10-20'})];
  const before = plain(rows);
  const app = portal(rows, {cache:{key:[movement(2,250)]}});
  assert.equal(app.items.length, 1, 'A coleta agrupada não vira uma linha apartada do planejamento');
  const item = app.items[0];
  assert.equal(item.total, 300);
  assert.equal(item.realizado, 250, 'A tiragem de 100 do owner não pode cortar a entrega do grupo');
  assert.equal(item.pendentePlanejado, 50);
  assert.equal(item.dtPlan, '2026-10-20', 'O saldo usa a última previsão do agrupamento');
  assert.equal(item.previsto, 250);
  assert.equal(item.pos, 50);
  assert.equal(item.semData, 0);
  const audits = checkAuditAlignment(app);
  for (const audit of audits) {
    const ids = String(value(audit,0,'ID da linha'));
    assert.match(ids, /101/);
    assert.match(ids, /102/);
  }
  assert.equal(value(audits[1],0,'Entregue armazém'), 250);
  assert.equal(value(audits[1],0,'Planejado dentro da meta'), 250);
  assert.deepEqual(plain(rows), before, 'A conciliação não reescreve as linhas de origem');
});

test('KIT único conserva duas linhas com as parcelas e previsões próprias', () => {
  const rows = [row(101, {KIT:'KIT-A', GIRO_TOTAL_BA:300, 'TIRAGEM COLETADA':200}),
    row(102, {KIT:'KIT-B', GIRO_TOTAL_BA:0, TIRAGEM:200, [fimPlan]:'2026-10-20'})];
  const app = portal(rows, {cache:{key:[movement(2,100,{kit:'KIT-A'}),
    movement(3,100,{kit:'KIT-B', entregaTP:'2026-10-16'})]}});
  assert.equal(app.items.length, 2);
  const byKit = Object.fromEntries(app.items.map(item => [item.linha.KIT, item]));
  assert.equal(byKit['KIT-A'].total, 100);
  assert.equal(byKit['KIT-A'].realizado, 100);
  assert.equal(byKit['KIT-A'].dtPlan, '2026-10-14');
  assert.equal(byKit['KIT-A'].real, 100);
  assert.equal(byKit['KIT-B'].total, 200);
  assert.equal(byKit['KIT-B'].realizado, 100);
  assert.equal(byKit['KIT-B'].dtPlan, '2026-10-20');
  assert.equal(byKit['KIT-B'].real, 0);
  assert.equal(byKit['KIT-B'].pendentePlanejado, 100);
  assert.deepEqual(parcels(byKit['KIT-B'].eventosReal), [['2026-10-16',100]]);
  checkAuditAlignment(app);
});

test('série corrigida tem prioridade para PCP e acabadora mesmo no mesmo SKU', () => {
  const rows = [row(101, {'SÉRIE':'VARIOS', serie_corrigida:'2º ANO'}),
    row(102, {_SOURCE:'ACABADORA', _ROW_ID:'ACAB:102', GRAFICA_FINAL:'HR', 'GRÁFICA':'HR',
      TIRAGEM:900, [totalCD]:200, 'SÉRIE':'VARIOS', serie_corrigida:'3º ANO'})];
  const app = portal(rows);
  assert.equal(app.items.length, 2);
  assert.deepEqual(Array.from(app.items,item=>item.serie).sort(), ['2º ANO','3º ANO']);
  assert.equal(app.total.total, 300, 'Acabadora usa o total por CD em vez da tiragem de 900');
  checkAuditAlignment(app);
});

test('tiragem total CD da acabadora limita grupo e preserva o realizado original', () => {
  const rows = [row(101, {_SOURCE:'ACABADORA', _ROW_ID:'ACAB:101', GRAFICA_FINAL:'HR', 'GRÁFICA':'HR',
    TIRAGEM:1000, [totalCD]:300, 'TIRAGEM COLETADA':250}),
  row(102, {_SOURCE:'ACABADORA', _ROW_ID:'ACAB:102', GRAFICA_FINAL:'HR', 'GRÁFICA':'HR',
    TIRAGEM:2000, [totalCD]:200, [fimPlan]:'2026-10-20'})];
  const app = portal(rows, {cache:{key:[movement(2,250,{grafica:'HR'})]}});
  assert.equal(app.items.length, 1);
  assert.equal(app.total.total, 500);
  assert.equal(app.total.realCD, 250);
  assert.equal(app.items[0].pendentePlanejado, 250);
  assert.equal(app.items[0].dtPlan, '2026-10-20');
  checkAuditAlignment(app);
});

test('corte preserva parcelas reais e excesso nunca aumenta previsto ou percentual coletado', () => {
  const rows = [row(101, {'TIRAGEM COLETADA':350}), row(102, {TIRAGEM:200, [fimPlan]:'2026-10-20'})];
  const cache = {key:[movement(2,100), movement(3,250,{coletaTP:'2026-10-16',entregaTP:'2026-10-16'})]};
  const historical = portal(plain(rows), {cache, today:'2026-10-15'});
  assert.equal(historical.total.realCD, 100);
  assert.equal(historical.total.coletadoTP, 100);
  assert.equal(historical.items[0].pendentePlanejado, 200);
  assert.deepEqual(parcels(historical.items[0].eventosReal), [['2026-10-13',100]]);
  const app = portal(plain(rows), {cache});
  assert.equal(app.total.total, 300);
  assert.equal(app.total.realCD, 300);
  assert.equal(app.total.previsto, 100);
  assert.equal(app.total.pos, 200);
  assert.equal(app.items[0].pendentePlanejado, 0);
  assert.equal(app.total.coletadoTP, 300);
  assert.equal(app.total.coletadoBrutoTP, 350);
  assert.equal(app.items[0].excedenteColeta, 50);
  assert.deepEqual(parcels(app.items[0].eventosReal), [['2026-10-13',100],['2026-10-16',200]]);
  assert.deepEqual(parcels(app.items[0].eventosColeta), [['2026-10-10',100],['2026-10-16',200]]);
  assert(app.controls.maMatrizColetas.innerHTML.includes('100%'), 'Coletas usa realizado limitado / total CD');
  checkAuditAlignment(app);
});

test('coleta realizada e entrega futura ficam distintas com o mesmo denominador e auditoria', () => {
  const app = portal([row(101, {TIRAGEM:200, 'TIRAGEM COLETADA':80, Entrega_TP:'2026-10-22'})]);
  assert.equal(app.items.length, 1);
  assert.equal(app.total.total, 200);
  assert.equal(app.total.realCD, 0);
  assert.equal(app.total.coletadoTP, 80);
  assert.equal(app.items[0].pendentePlanejado, 200);
  assert.deepEqual(parcels(app.items[0].eventosColeta), [['2026-10-10',80]]);
  assert.match(app.controls.maMatrizColetas.innerHTML, /40%/);
  checkAuditAlignment(app);
});

test('linha simples conserva SLA, rateio e regra de somente saldo no planejamento', () => {
  const app = portal([row(101, {TIRAGEM:200, 'TIRAGEM COLETADA':80,
    [inicioPlan]:'2026-10-13', [fimPlan]:'2026-10-16'})], {sla:1});
  assert.equal(app.items.length, 1);
  const item = app.items[0];
  assert.equal(item.total, 200);
  assert.equal(item.realizado, 80);
  assert.equal(item.inicioPlan, '2026-10-14');
  assert.equal(item.dtPlan, '2026-10-17');
  assert.equal(item.pendentePlanejado, 120);
  assert.equal(item.previsto, 160, '80 realizados + 2/3 dos 120 pendentes');
  assert.equal(item.pos, 40);
  assert.equal(item.ate15+item.apos15+item.semData, 200);
  assert.equal(app.w.pgMADiasEntrega(item).reduce((sum,event)=>sum+event.volume,0), 200);
  checkAuditAlignment(app);
});

test('cada recorte tem os três quadros alinhados sem linhas ou colunas em branco para unir bases', () => {
  const rows = [row(101, {'TIRAGEM COLETADA':40}),
    row(102, {SKU:'OUTRO-SKU',SKU_REAL:'OUTRO-SKU',TIRAGEM:200,serie_corrigida:'2º ANO','TIRAGEM COLETADA':80})];
  const app = portal(rows);
  checkAuditAlignment(app);
  app.w.dadosGlobais = [rows[1]];
  app.w.dadosBaseForecastColeta = [rows[1]];
  app.w.processarMetaArmazem();
  const filtered = {...app,items:app.w.pgMAVisaoAtual.itens,total:app.w.pgMAVisaoAtual.total};
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.total.total, 200);
  assert.equal(filtered.total.realCD, 80);
  assert.equal(filtered.total.coletadoTP, 80);
  const audits = checkAuditAlignment(filtered);
  for (const audit of audits) {
    assert.equal(value(audit,0,'SKU'), 'OUTRO-SKU');
    assert.equal(value(audit,0,'Série'), '2º ANO');
    assert.notEqual(String(value(audit,0,'ID da linha')).trim(), '');
    assert.notEqual(String(value(audit,0,'Fonte')).trim(), '');
  }
});

test('filtro local de material se aplica igualmente à previsão, entregas e coletas', () => {
  const app = portal([row(101, {'TIRAGEM COLETADA':40}),
    row(102, {SKU:'PROF-SKU',SKU_REAL:'PROF-SKU',TIPO:'PROFESSOR',TIRAGEM:200,'TIRAGEM COLETADA':80})]);
  app.w.pgMATipoMaterial('ALUNO', false);
  const filtered = {...app,items:app.w.pgMAVisaoAtual.itens,total:app.w.pgMAVisaoAtual.total};
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].tipo, 'PROFESSOR');
  assert.equal(filtered.total.total, 200);
  assert.equal(filtered.total.realCD, 80);
  assert.equal(filtered.total.coletadoTP, 80);
  assert.match(app.controls.maMatrizColetas.innerHTML, /40%/);
  checkAuditAlignment(filtered);
  app.w.pgMATipoMaterialNenhum();
  const empty = {...app,items:app.w.pgMAVisaoAtual.itens,total:app.w.pgMAVisaoAtual.total};
  assert.equal(empty.items.length, 0);
  assert.equal(empty.total.total, 0);
  assert.equal(empty.total.realCD, 0);
  assert.equal(empty.total.coletadoTP, 0);
  checkAuditAlignment(empty);
});

test('três matrizes compartilham modo, colunas, expansão e ordem das séries', () => {
  const app = portal([row(101,{'TIRAGEM COLETADA':40}),
    row(102,{SKU:'SKU-2',SKU_REAL:'SKU-2',serie_corrigida:'2º ANO'}),
    row(103,{SKU:'SKU-3',SKU_REAL:'SKU-3',serie_corrigida:'PV'})]);
  const heads = () => ['maMatriz','maMatrizRealizado','maMatrizColetas'].map(id =>
    app.controls[id].innerHTML.match(/<thead>([\s\S]*?)<\/thead>/)[1]);
  const checkHeads = () => {const [planned,delivered,collected]=heads();assert.equal(delivered,planned);assert.equal(collected,planned);};
  for(const mode of ['marca','graficaMarca','marcaSerie']) {
    app.w.pgMAMatrizModo(mode);
    checkHeads();
    assert.equal(app.controls.maMatrizTitulo.textContent, 'Previsão Armazém');
  }
  app.w.pgMAAlternarOutros();
  checkHeads();
  assert(heads()[0].includes('PRE-VEST'));
  app.controls.maMatriz.scrollLeft=12;
  app.controls.maMatrizRealizado.scrollLeft=23;
  app.controls.maMatrizColetas.scrollLeft=34;
  app.w.pgMAReordenarMatriz('2º ANO','1º ANO');
  checkHeads();
  assert(heads()[0].indexOf('2º ANO')<heads()[0].indexOf('1º ANO'));
  assert.equal(app.controls.maMatriz.scrollLeft, 12);
  assert.equal(app.controls.maMatrizRealizado.scrollLeft, 23);
  assert.equal(app.controls.maMatrizColetas.scrollLeft, 34);
});

test('captura Coletas usa o percentual coletado sobre total CD e identifica o quadro', () => {
  const app = portal([row(101,{'TIRAGEM COLETADA':40})]);
  app.w.pgMACapturarMatriz('coletas');
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].name, /coletas-.*\.png$/);
  assert(app.canvasTexts.some(text=>text.startsWith('Coletas ·')));
  assert(app.canvasTexts.includes('40%'));
  assert(!app.canvasTexts.includes('100%'), 'Captura não usa o percentual de previsão');
});

function unzip(bytes) {
  const entries = new Map();
  for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;) {
    const method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18);
    const nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString();
    const start=offset+30+nameLength+extraLength,data=bytes.subarray(start,start+size);
    entries.set(name,(method===8?inflateRawSync(data):data).toString());
    offset=start+size;
  }
  return entries;
}

test('CSV e Excel de Coletas exportam a mesma linha completa com percentuais verificáveis', async () => {
  const app = portal([row(101,{'TIRAGEM COLETADA':40})]);
  const audit = app.w.pgMAObterAuditoriaColetas();
  assert.equal(value(audit,0,'% coletado TP / tiragem total'), 0.4);
  assert.equal(value(audit,0,'Saldo a coletar'), 60);
  app.w.pgMABaixarAuditoriaColetasCSV();
  const csv = await app.downloads[0].blob.text();
  assert.match(csv, /Coletado TP/);
  assert.match(csv, /Entregue armazém/);
  assert.match(csv, /Dentro da meta/);
  assert.match(csv, /"40%"/);
  assert.equal(csv.split('\r\n').length, 2);
  app.w.setTimeout=(callback,delay)=>{if(delay===0)callback();};
  await app.w.pgMAExportarAuditoriaColetas();
  assert.equal(app.downloads.length, 2);
  assert.match(app.downloads[1].name, /Coletas_Auditavel.*\.xlsx$/);
  const xml = unzip(Buffer.from(await app.downloads[1].blob.arrayBuffer())).get('xl/worksheets/sheet1.xml');
  assert(xml, 'Arquivo XLSX possui a planilha auditável');
  assert.match(xml, /% coletado TP \/ tiragem total/);
  assert.match(xml, /<c r="[A-Z]+2" s="5"><v>0\.4<\/v><\/c>/, 'Percentual exportado como número percentual');
  assert.match(xml, /<c r="[A-Z]+2" s="4"><v>60<\/v><\/c>/, 'Saldo exportado como volume numérico');
});

test('owner com total CD zero conserva movimentos na linha canônica com volume CD positivo', () => {
  const rows = [row(101,{_SOURCE:'ACABADORA',_ROW_ID:'ACAB:101',GRAFICA_FINAL:'HR','GRÁFICA':'HR',
    TIRAGEM:1000,[totalCD]:0,'TIRAGEM COLETADA':250}),
    row(102,{_SOURCE:'ACABADORA',_ROW_ID:'ACAB:102',GRAFICA_FINAL:'HR','GRÁFICA':'HR',
      TIRAGEM:2000,[totalCD]:300,[fimPlan]:'2026-10-20'})];
  const app = portal(rows,{cache:{key:[movement(2,250,{grafica:'HR'})]}});
  assert.equal(app.items.length, 1);
  assert.equal(app.total.total, 300);
  assert.equal(app.total.realCD, 250);
  assert.equal(app.total.coletadoTP, 250);
  assert.equal(app.items[0].pendentePlanejado, 50);
  assert.equal(app.items[0].dtPlan, '2026-10-20');
  assert(app.items[0].conciliacao.owners.some(owner=>owner.ID===101), 'Origem física do movimento é preservada');
  checkAuditAlignment(app);
});

test('filtro parcial conserva agrupamento inteiro e explica o recorte sem distribuir realizado', () => {
  const rows = [row(101,{'TIRAGEM COLETADA':250}),row(102,{TIRAGEM:200,[fimPlan]:'2026-10-20'})];
  const app = portal(rows,{cache:{key:[movement(2,250)]}});
  app.w.pgBaseGeralReportExecutiva=[rows[1]];
  app.w.dadosBaseForecastColeta=[rows[1]];
  app.w.processarMetaArmazem();
  const filtered = {...app,items:app.w.pgMAVisaoAtual.itens,total:app.w.pgMAVisaoAtual.total};
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.total.total, 300);
  assert.equal(filtered.total.realCD, 250);
  assert.equal(filtered.total.coletadoTP, 250);
  assert.equal(filtered.items[0].conciliacao.filtroParcial, true);
  assert.match(app.controls.maAviso.textContent, /agrupamentos exibidos inteiros porque o filtro/);
  const audits = checkAuditAlignment(filtered);
  assert.match(value(audits[0],0,'Motivo / observação'), /Filtro corresponde a parte do agrupamento/);
  assert.match(String(value(audits[0],0,'ID da linha')), /101/);
  assert.match(String(value(audits[0],0,'ID da linha')), /102/);
});

test('simulação de agrupamento sem previsão usa último baseline sem antecipar o saldo', () => {
  const baseline = 'COLETA/INTERNALIZAÇÃO FIM BASELINE';
  const rows = [row(101,{'TIRAGEM COLETADA':50,[fimPlan]:'',[baseline]:'2026-10-16'}),
    row(102,{TIRAGEM:200,[fimPlan]:'',[baseline]:'2026-10-20'})];
  const app = portal(rows,{cache:{key:[movement(2,50)]}});
  assert.equal(app.items.length, 1);
  assert.equal(app.items[0].semData, 250);
  app.w.pgMAZerarSemPrevisao();
  const simulated = {...app,items:app.w.pgMAVisaoAtual.itens,total:app.w.pgMAVisaoAtual.total};
  assert.equal(simulated.items.length, 1);
  const item=simulated.items[0];
  assert.equal(item.dataFallback, '2026-10-20');
  assert.equal(item.dtPlan, '2026-10-20');
  assert.equal(item.pendentePlanejado, 250);
  assert.equal(item.previsto, 50);
  assert.equal(item.pos, 250);
  assert.equal(item.semData, 0);
  checkAuditAlignment(simulated);
});

test('metas divergentes sem KIT interrompem a conciliação e removem resultados antigos', () => {
  const rows = [row(101,{'TIRAGEM COLETADA':250}),row(102,{TIRAGEM:200,[fimPlan]:'2026-10-20'})];
  const app = portal(rows,{cache:{key:[movement(2,250)]}});
  assert(app.w.pgMAMatrizSnapshot);
  rows[1].AVALIACAO='Sim';
  app.w.processarMetaArmazem();
  assert.equal(app.w.pgMAVisaoAtual, null);
  assert.equal(app.w.pgMAMatrizSnapshot, null);
  assert.equal(app.w.pgMAUltimosItens.length, 0);
  assert.match(app.controls.maAviso.textContent, /Não foi possível conciliar a visão:/);
  assert.match(app.controls.maAviso.textContent, /meta/i);
  for(const id of ['maMatriz','maMatrizRealizado','maMatrizColetas'])assert.equal(app.controls[id].innerHTML, '');
  assert.throws(()=>app.w.pgMAObterItens(), /meta/i);
  for(const audit of [app.w.pgMAObterAuditoria(),app.w.pgMAObterAuditoriaRealizado(),app.w.pgMAObterAuditoriaColetas()])
    assert.equal(audit.linhas.length, 0, 'Exportação não pode devolver valores antigos depois do erro');
});

for(const futureDelivery of [false,true])test('KIT acima da tiragem da linha usa grupo inteiro: '+
  (futureDelivery?'coleta excede e entrega do KIT ainda é futura':'parcelas de entrega e coleta excedem'), () => {
  const rows = [row(101,{KIT:'KIT-A',GIRO_TOTAL_BA:300,'TIRAGEM COLETADA':200}),
    row(102,{KIT:'KIT-B',GIRO_TOTAL_BA:0,TIRAGEM:200,[fimPlan]:'2026-10-20'})];
  const app = portal(rows,{cache:{key:[
    movement(2,150,{kit:'KIT-A',entregaTP:futureDelivery?'2026-10-22':'2026-10-13'}),
    movement(3,50,{kit:'KIT-B'})
  ]}});
  assert.equal(app.items.length, 1, 'KIT nominal não basta quando sua quantidade não cabe na linha');
  assert.equal(app.items[0].conciliacao.agrupado, true);
  assert.equal(app.total.total, 300);
  assert.equal(app.total.realCD, futureDelivery?50:200);
  assert.equal(app.total.coletadoTP, 200);
  assert.equal(app.total.excedenteEntrega, 0, 'O volume cabe no total do agrupamento');
  assert.equal(app.total.excedenteColeta, 0);
  assert.equal(app.items[0].dtPlan, '2026-10-20');
  checkAuditAlignment(app);
});

test('quantidade de parcelas que não concilia preserva zero global e diagnóstico auditado sem bloquear outros itens', () => {
  const problematic = row(101,{TIRAGEM:300,GIRO_TOTAL_BA:300,'TIRAGEM COLETADA':200});
  const healthy = row(102,{SKU:'SKU-SAUDAVEL',SKU_REAL:'SKU-SAUDAVEL','TIRAGEM COLETADA':40});
  const app = portal([problematic,healthy],{cache:{key:[movement(2,150)]}});
  assert(app.w.pgMAVisaoAtual, 'Divergência de quantidade não deve impedir o painel inteiro');
  assert.equal(app.items.length, 2);
  const bad = app.items.find(item=>item.linha.SKU==='SKU-1');
  assert.equal(app.w.pgVolumesColetaUnificadosV37(problematic,'2026-10-20').entrega, 0);
  assert.equal(bad.realizado, 0);
  assert.equal(bad.coletadoTP, 0);
  assert.equal(bad.previsto, 300);
  assert.equal(bad.pendentePlanejado, 300);
  assert.equal(app.total.realCD, 40, 'Item sem divergência mantém sua entrega');
  assert.equal(app.total.coletadoTP, 40);
  assert.match(app.controls.maAviso.textContent, /diagnósticos/i);
  const audits = checkAuditAlignment(app);
  const badIndex=audits[0].linhas.findIndex((_,index)=>value(audits[0],index,'SKU')==='SKU-1');
  assert.match(value(audits[0],badIndex,'Motivo / observação'), /quantidade-nao-concilia-tiragem-coletada/);
  assert.match(value(audits[1],badIndex,'Diagnóstico da diferença'), /quantidade-nao-concilia-tiragem-coletada/);
});

for(const source of ['PCP','ACABADORA'])test('arredonda tiragem por linha antes de somar e conserva bruto, realizado e excesso: '+source, () => {
  const finishing=source==='ACABADORA',grafica=finishing?'HR':'FORMA CERTA';
  const common={_SOURCE:source,GRAFICA_FINAL:grafica,'GRÁFICA':grafica,TIRAGEM:643.6,[totalCD]:643.6};
  const rows=[row(101,{...common,GIRO_TOTAL_BA:1288,'TIRAGEM COLETADA':1300}),
    row(102,{...common,GIRO_TOTAL_BA:0,[fimPlan]:'2026-10-20'})];
  const app=portal(rows,{cache:{key:[movement(2,1300,{grafica})]}});
  assert.equal(app.items.length, 1);
  assert.equal(app.total.total, 1288, 'Math.round(643.6)+Math.round(643.6), antes do agrupamento');
  const item=app.items[0];
  assert.equal(item.entregueBruto, 1300);
  assert.equal(item.realizado, 1288);
  assert.equal(item.excedenteEntrega, 12);
  assert.equal(item.entregueBruto, item.realizado+item.excedenteEntrega);
  assert.equal(item.coletadoBrutoTP, 1300);
  assert.equal(item.coletadoTP, 1288);
  assert.equal(item.excedenteColeta, 12);
  assert.equal(item.coletadoBrutoTP, item.coletadoTP+item.excedenteColeta);
  assert.equal(item.eventosReal.reduce((sum,event)=>sum+event.volume,0), 1288);
  assert.equal(item.eventosColeta.reduce((sum,event)=>sum+event.volume,0), 1288);
  assert.equal(rows[0].TIRAGEM, 643.6);
  checkAuditAlignment(app);
});
