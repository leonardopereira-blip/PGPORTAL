const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {inflateRawSync} = require('node:zlib');

const finalPlan = 'Coleta/Internalização de estoque final (re) plan';
const row = (extra = {}) => ({_SOURCE:'PCP', _ROW_ID:'PCP:2', MARCA_FINAL:'COC', UNIDADE:'COC',
  GRAFICA_FINAL:'FORMA CERTA', 'GRÁFICA':'FORMA CERTA', SKU_REAL:'SKU-1', SKU:'SKU-1',
  ENVIO:'V1', CD_MAPA:'CD JDI', CD_FINAL:'CD JDI', 'CD DESTINO':'CD JDI',
  'SÉRIE':'1º ANO', TIPO:'ALUNO', TIRAGEM:200, 'TIRAGEM COLETADA':80,
  Coleta_TP:'2026-10-10', Entrega_TP:'2026-10-13', [finalPlan]:'2026-10-14', ...extra});
const movement = (extra = {}) => ({eventoTPVersao:1, marca:'COC', destino:'CD JDI',
  grafica:'FORMA CERTA', sku:'SKU-1', envio:'V1', chaveMapa:'MAPA-1',
  codigoMapa:'MP-1', linhaMapa:2, volumeColetado:40,
  coletaTP:'2026-10-10', entregaTP:'2026-10-13', ...extra});
const parcels = () => ({key:[movement(),
  movement({linhaMapa:3, codigoMapa:'MP-2', volumeColetado:50, entregaTP:'2026-10-16'}),
  movement({linhaMapa:4, codigoMapa:'MP-3', volumeColetado:30, entregaTP:'2026-10-22'})]});
const snapshot = value => JSON.parse(JSON.stringify(value));

// Motores e exportador completos; apenas DOM, relógio e download são simulados.
function portal(rows, {today = '2026-10-20', cache = {}, funil = rows} = {}) {
  const downloads = [], blobs = new Map(), alerts = [], controls = {
    filtroReferencia:{value:'replan'}, pgFiltroOrigem:{value:'TODOS'}, pgFiltroDestino:{value:'TODOS'}
  };
  const element = () => ({value:'', textContent:'', innerHTML:'', style:{},
    classList:{add(){}, remove(){}, toggle(){}},
    appendChild(){}, remove(){}, addEventListener(){}, setAttribute(){},
    getAttribute(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];},
    click(){downloads.push({name:this.download, blob:blobs.get(this.href)});}});
  const w = {console:{info(){}, warn(){}, error(){}}, dadosGlobais:rows, MAPA_SAIDA_CACHE:cache,
    PG_MATRIZ_SLA:[['FORNECEDOR','CD JDI'],['FORMA CERTA',0]],
    arredondar:v=>Math.round(Number(v)||0), formatarBR:String,
    setTimeout(){}, clearTimeout(){}, setInterval(){}, clearInterval(){},
    performance:{now:()=>0}, addEventListener(){}, dispatchEvent(){}, Event:class{},
    Blob, TextEncoder, alert:message=>alerts.push(message),
    localStorage:{getItem(){return null;}, setItem(){}},
    URL:{createObjectURL(blob){const url='blob:test-'+blobs.size;blobs.set(url,blob);return url;},
      revokeObjectURL(){}}};
  w.document = {getElementById(id){
    if(id.startsWith('ma'))return controls[id]||(controls[id]=element());
    return controls[id]||null;
  }, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){},
  createElement:element, body:element(), head:element()};
  w.window=w;
  vm.createContext(w);
  for(const name of ['Scripts_Eventos_TP.html','Scripts_Globais_2.html','abaMetaArmazem.html','ExportadorExcel.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      vm.runInContext(script,w,{filename:name});
  }
  vm.runInContext(`dtHojeISO='${today}';dtHoje=new Date('${today}T12:00:00');`,w);
  w.dadosBaseForecastColeta=funil;
  w.processarMetaArmazem();
  // O exportador aguarda somente o próximo desenho antes de gerar o arquivo.
  w.setTimeout=(callback,delay)=>{if(delay===0)callback();};
  return {w, downloads, alerts};
}

const value = (audit, index, name) => {
  const column=audit.cabecalho.indexOf(name);
  assert.notEqual(column,-1,'Coluna auditável: '+name);
  return audit.linhas[index][column];
};

test('auditoria compara Entrega TP: coleta antes do corte com entrega futura fica zerada',()=>{
  const line=row({Entrega_TP:'2026-10-22'}), {w}=portal([line]);
  assert.equal(w.pgVolumesColetaUnificadosV37(line).coleta,80);
  const audit=w.pgMAObterAuditoriaRealizado();
  assert.equal(value(audit,0,'Entregue Geral'),0);
  assert.equal(value(audit,0,'Entregue armazém'),0);
  assert.equal(value(audit,0,'Diferença Geral - Armazém'),0);
  assert.equal(value(audit,0,'Coleta TP (data)'),'2026-10-10');
  assert.equal(value(audit,0,'Entrega TP (data)'),'2026-10-22');
  assert.equal(value(audit,0,'Tiragem coletada bruta'),80);
  assert.doesNotMatch(value(audit,0,'Diagnóstico da diferença'),/Coleta TP/);
});

test('entrega sem data de Coleta TP mantém os volumes de entrega conciliados',()=>{
  const line=row({Coleta_TP:''}), {w}=portal([line]);
  assert.equal(w.pgVolumesColetaUnificadosV37(line).coleta,0);
  const audit=w.pgMAObterAuditoriaRealizado();
  assert.equal(value(audit,0,'Entregue Geral'),80);
  assert.equal(value(audit,0,'Entregue armazém'),80);
  assert.equal(value(audit,0,'Diferença Geral - Armazém'),0);
  assert.equal(value(audit,0,'Coleta TP (data)'),'');
  assert.match(value(audit,0,'Diagnóstico da diferença'),/Volumes de Entrega TP conciliados/);
  assert.doesNotMatch(value(audit,0,'Diagnóstico da diferença'),/Coleta TP/);
});

test('parcelas respeitam o corte e cada data de entrega para classificar dentro e fora da meta',()=>{
  const line=row({'TIRAGEM COLETADA':120}), {w}=portal([line],{cache:parcels()});
  const atMeta=w.pgMAObterItens({corte:'2026-10-15'})[0];
  assert.equal(atMeta.realizado,40);
  assert.equal(atMeta.real,40);
  assert.equal(atMeta.pendentePlanejado,160);
  assert.deepEqual(snapshot(atMeta.eventosReal),[{data:'2026-10-13',volume:40}]);
  const audit=w.pgMAObterAuditoriaRealizado();
  assert.equal(value(audit,0,'Entregue Geral'),90);
  assert.equal(value(audit,0,'Entregue armazém'),90);
  assert.equal(value(audit,0,'Entregue dentro da meta'),40);
  assert.equal(value(audit,0,'Entregue fora da meta'),50);
  assert.equal(value(audit,0,'Parcelas de Entrega TP (data: quantidade)'),
    '13/10/2026: 40 | 16/10/2026: 50');
  assert.equal(value(audit,0,'Planejado dentro da meta'),150);
  assert.equal(value(audit,0,'Saldo para aderência'),110);
  assert.equal(value(audit,0,'Aderência Realizado / Planejado'),40/150);
  const later=portal([row({'TIRAGEM COLETADA':120})],{cache:parcels(),today:'2026-10-23'}).w;
  const after=later.pgMAObterAuditoriaRealizado();
  assert.equal(value(after,0,'Entregue Geral'),120);
  assert.equal(value(after,0,'Entregue dentro da meta'),40);
  assert.equal(value(after,0,'Entregue fora da meta'),80);
});

test('limite da tiragem é explicitado e excesso de outro registro não compensa saldo e aderência',()=>{
  const excess=row({TIRAGEM:100,'TIRAGEM COLETADA':150});
  const pending=row({_ROW_ID:'PCP:3',SKU_REAL:'SKU-2',SKU:'SKU-2',TIRAGEM:100,
    'TIRAGEM COLETADA':0,Coleta_TP:'',Entrega_TP:''});
  const {w}=portal([excess,pending]), audit=w.pgMAObterAuditoriaRealizado();
  assert.equal(value(audit,0,'Entregue Geral'),150);
  assert.equal(value(audit,0,'Entregue armazém'),100);
  assert.equal(value(audit,0,'Diferença Geral - Armazém'),50);
  assert.equal(value(audit,0,'Tiragem coletada bruta'),100);
  assert.equal(value(audit,0,'Saldo para aderência'),0);
  assert.equal(value(audit,0,'Aderência Realizado / Planejado'),1);
  assert.match(value(audit,0,'Diagnóstico da diferença'),/Entrega TP excede tiragem da linha/);
  assert.equal(value(audit,1,'Planejado dentro da meta'),100);
  assert.equal(value(audit,1,'Saldo para aderência'),100);
  assert.equal(value(audit,1,'Aderência Realizado / Planejado'),0);
  assert.equal(w.pgMAVisaoAtual.total.real,100);
  assert.equal(w.pgMAVisaoAtual.total.previsto,200);
});

test('recorte Funil marca Sim e Não sem eliminar a entrega da linha fora do recorte',()=>{
  const first=row({'TIRAGEM COLETADA':40});
  const second=row({_ROW_ID:'PCP:3',SKU_REAL:'SKU-2',SKU:'SKU-2','TIRAGEM COLETADA':60});
  const {w}=portal([first,second],{funil:[first]}), audit=w.pgMAObterAuditoriaRealizado();
  assert.equal(value(audit,0,'Recorte Funil'),'Sim');
  assert.equal(value(audit,1,'Recorte Funil'),'Não');
  assert.equal(value(audit,1,'Entregue Geral'),60);
  assert.equal(value(audit,1,'Entregue armazém'),60);
  assert.match(value(audit,1,'Diagnóstico da diferença'),/filtros ativos/);
  assert.doesNotMatch(value(audit,1,'Diagnóstico da diferença'),/base de Coleta/);
});

function csvRows(text){
  return text.replace(/^\uFEFF/,'').split('\r\n').map(line=>
    Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/g),m=>m[1].replace(/""/g,'"')));
}
async function xlsxSheet(blob){
  const bytes=Buffer.from(await blob.arrayBuffer());
  for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;){
    const method=bytes.readUInt16LE(offset+8), size=bytes.readUInt32LE(offset+18);
    const nameLength=bytes.readUInt16LE(offset+26), extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString();
    const start=offset+30+nameLength+extraLength, content=bytes.subarray(start,start+size);
    if(name==='xl/worksheets/sheet1.xml')return (method===8?inflateRawSync(content):content).toString();
    offset=start+size;
  }
  assert.fail('Planilha não encontrada no XLSX');
}
function excelCell(xml,ref){
  const cell=xml.match(new RegExp('<c r="'+ref+'"[^>]*>([\\s\\S]*?)</c>'));
  assert.ok(cell,'Célula XLSX '+ref);
  return cell[1].match(/<(?:t(?: [^>]*)?|v)>([\s\S]*?)<\/(?:t|v)>/)[1];
}

test('leitura, CSV e XLSX do Realizado preservam integralmente a auditoria e a visão Planejado',async()=>{
  const {w,downloads,alerts}=portal([row({'TIRAGEM COLETADA':120})],{cache:parcels()});
  const planned=snapshot(w.pgMAObterAuditoria()), view=snapshot(w.pgMAVisaoAtual);
  const audit=w.pgMAObterAuditoriaRealizado();
  assert.equal(audit.cabecalho.length,32);
  assert.deepEqual(Array.from(audit.cabecalho.slice(14,24)),[
    'Tiragem total','Tiragem coletada bruta','Entregue Geral','Entregue armazém',
    'Diferença Geral - Armazém','Entregue dentro da meta','Entregue fora da meta',
    'Planejado dentro da meta','Saldo para aderência','Aderência Realizado / Planejado']);
  // Getters devolvem cópias; nem o consumidor da base pode alterar o Planejado.
  audit.cabecalho[0]='Alterado';audit.linhas[0][0]='Alterado';
  w.pgMABaixarAuditoriaRealizadoCSV();
  const button={textContent:'Baixar Excel Realizado',disabled:false};
  await w.pgMAExportarAuditoriaRealizado(button);
  assert.deepEqual(alerts,[]);
  assert.equal(downloads.length,2);
  assert.match(downloads[0].name,/Meta_Armazem_Realizado_Auditavel.*\.csv$/);
  const csv=csvRows(await downloads[0].blob.text());
  assert.deepEqual(csv[0],Array.from(w.pgMAObterAuditoriaRealizado().cabecalho));
  assert.deepEqual(csv[1].slice(16,24),['90','90','0','40','50','150','110','26,7%']);
  assert.match(downloads[1].name,/Meta_Armazem_Realizado_Auditavel.*\.xlsx$/);
  const xml=await xlsxSheet(downloads[1].blob);
  assert.equal(excelCell(xml,'Q1'),'Entregue Geral');
  assert.equal(excelCell(xml,'R1'),'Entregue armazém');
  assert.equal(excelCell(xml,'T1'),'Entregue dentro da meta');
  assert.equal(excelCell(xml,'U1'),'Entregue fora da meta');
  assert.equal(excelCell(xml,'Q2'),'90');
  assert.equal(excelCell(xml,'R2'),'90');
  assert.equal(excelCell(xml,'T2'),'40');
  assert.equal(excelCell(xml,'U2'),'50');
  assert.equal(excelCell(xml,'W2'),'110');
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Baixar Excel Realizado');
  assert.deepEqual(snapshot(w.pgMAObterAuditoria()),planned);
  assert.deepEqual(snapshot(w.pgMAVisaoAtual),view);
});
