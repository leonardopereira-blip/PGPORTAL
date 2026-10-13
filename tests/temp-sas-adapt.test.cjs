const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const contexto = vm.createContext({
  Utilities: { formatDate(v) { return new Date(v).toISOString().slice(0,10); } }
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','TempSasAdapt.js'),'utf8'), contexto);

const pHeader = ['GRÁFICA','UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','SKU','CD DESTINO','TIRAGEM','TIRAGEM COLETADA','Data_Coleta_Mapa','Entrega_TP'];
const mHeader = ['UN PCP','CÓD MP','UNIDADE','CD DESTINO','ENVIO','SKU','GRÁFICA','TIRAGEM','DT COLETA','Entrega_TP'];
const exemplo = () => ({
  pcp: [
    pHeader,
    ['LOGPRINT','SAS ADAPT','V1','PRODUÇÃO COM ACABADORA','SKU-1','ATHOS',40,70,'11/09/2026','17/09/2026'],
    ['LOGPRINT','SAS ADAPT','V1','PRODUÇÃO COM ACABADORA','SKU-1','ATHOS',30,0,'',''],
    ['MAXIGRAFICA','SAS ADAPT','V1','PRODUÇÃO COM ACABADORA','SKU-2','ATHOS',60,50,'14/09/2026','19/09/2026'],
    ['IMOS','SAS ADAPT','V1','PRODUÇÃO COM ACABADORA','SKU-3','CD JDI',1000,1000,'',''],
    ['LOGPRINT','SAS ADAPT','V2','','SKU-4','ATHOS',500,500,'',''],
    ['LOGPRINT','SAS ADAPT','V1','Cancelado','SKU-5','ATHOS',300,300,'','']
  ],
  mapa: [
    mHeader,
    ['SAS ADAPT','MP-1','SAS','Acabadora - ATHOS','V1','SKU-1','IMOS',100,'11/09/2026','14/09/2026'],
    ['SAS ADAPT','MP-2','SAD','Jundiaí - SP','V1','SKU-1','ATHOS',20,'18/09/2026','21/09/2026'],
    ['','MP-3','SAD','Itaitinga - CE','V1','SKU-2','ATHOS',35,'','20/09/2026'],
    ['','MP-4','SAD','Itaitinga - CE','V1','SKU-2','ATHOS',30,'20/09/2026','21/09/2026'],
    ['SAS ADAPT','MP-5','SAD','Jundiaí - SP','V1','SKU-3','ATHOS',60,'20/09/2026','22/09/2026'],
    ['SAS ADAPT','MP-6','SAD','Jundiaí - SP','V2','SKU-2','ATHOS',900,'',''],
    ['SAS ADAPT','MP-7','SAD','Acabadora - ATHOS','V1','SKU-2','ATHOS',900,'','']
  ]
});
test('entrada usa PCP TIRAGEM COLETADA e saida usa coleta MAPA original', () => {
  const {pcp,mapa}=exemplo();
  const r=contexto.pgTempSasAdaptResumo_(pcp,mapa);
  assert.equal(r.pcpTotal,130);
  assert.equal(r.entradasAthos,120);
  assert.equal(r.saidasCD,110);
  assert.equal(r.diferencaAthos,10);
  assert.equal(r.entradasPorGrafica.find(x=>x.nome==='LOGPRINT').tiragem,70);
  assert.equal(r.entradasPorGrafica.find(x=>x.nome==='MAXIGRAFICA').tiragem,50);
  assert.equal(r.saidasPorCD.find(x=>x.nome==='JUNDIAI - SP').tiragem,80);
  assert.equal(r.saidasPorCD.find(x=>x.nome==='ITAITINGA - CE').tiragem,30);
  assert.equal(r.linhasEntrada.length,3);
  assert.equal(r.linhasSaida.length,4);
});
test('auditoria preserva numero de linha, datas, MP e pendencias de coleta', () => {
  const r=contexto.pgTempSasAdaptResumo_(exemplo().pcp,exemplo().mapa);
  assert.equal(r.linhasEntrada[0].linha,2);
  assert.equal(r.linhasEntrada[0].dataColeta,'11/09/2026');
  assert.equal(r.linhasEntrada[0].entregaTP,'17/09/2026');
  assert.equal(r.linhasSaida[0].mapa,'MP-2');
  assert.equal(r.linhasSaida[0].linha,3);
  assert.equal(r.linhasSaida[1].mapa,'MP-3');
  assert.equal(r.linhasSaida[1].volumeColetado,0);
  assert.match(r.linhasSaida[1].status,/não somado/);
});
test('SKU agrega cada lado, sem compensar entre SKUs distintos', () => {
  const r=contexto.pgTempSasAdaptResumo_(exemplo().pcp,exemplo().mapa);
  const s1=r.porSku.find(x=>x.sku==='SKU-1');
  assert.equal(s1.planejado,70);
  assert.equal(s1.coletado,70);
  assert.equal(s1.saida,20);
  assert.equal(s1.diferenca,50);
  assert.equal(s1.mapas,'MP-2');
  const s3=r.porSku.find(x=>x.sku==='SKU-3');
  assert.equal(s3.coletado,0);
  assert.equal(s3.saida,60);
  assert.equal(s3.diferenca,-60);
});
test('falha se coluna auditada faltar', () => {
  const {pcp,mapa}=exemplo();
  pcp[0]=pcp[0].slice();
  pcp[0][7]='coluna incorreta';
  assert.throws(()=>contexto.pgTempSasAdaptResumo_(pcp,mapa),/TIRAGEM COLETADA/);
});
