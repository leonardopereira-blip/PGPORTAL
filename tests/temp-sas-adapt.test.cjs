const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'TempSasAdapt.js'), 'utf8'), ctx);
function exemplo() {
  const mapa = [
    ['UN PCP','UNIDADE','CD DESTINO','GRÁFICA','ENVIO','TIRAGEM','DT COLETA'],
    ['SAS ADAPT','SAS','Acabadora - ATHOS','IMOS','V1',100,'11/09/2026'],
    ['', 'SAD','Jundiaí - SP','ATHOS','V1',60,'01/10/2026'],
    ['SAS ADAPT','SAD','Fortaleza - CE','ATHOS','V1',30,'01/10/2026'],
    ['SAS','SAS','Acabadora - ATHOS','IMOS','V1',700,'01/10/2026'],
    ['SAS ADAPT','SAD','Jundiaí - SP','ATHOS','V1',400,''],
    ['SAS ADAPT','SAS','Acabadora - ATHOS','ATHOS','V1',111,'01/10/2026'],
    ['SAS ADAPT','SAS','Acabadora - ATHOS','IMOS','V2',400,'01/10/2026']
  ];
  const pcp = [
    ['UNIDADE','ENVIO','CARACTERÍSTICA DA SOLICITAÇÃO','TIRAGEM'],
    ['SAS ADAPT','V1','PRODUÇÃO COM ACABADORA',100],
    ['SAS ADAPT','V1','',30],
    ['SAS ADAPT','V2','',500],
    ['SAS ADAPT','V1','Cancelado',33]
  ];
  return {mapa,pcp};
}
test('somente movimentos Athos, sem confundir PCP e CD original', () => {
  const {mapa,pcp}=exemplo();
  const out=ctx.pgTempSasAdaptResumo_(mapa,pcp);
  assert.equal(out.pcpTotal,130);
  assert.equal(out.entradasAthos,100);
  assert.equal(out.saidasCD,90);
  assert.equal(out.diferencaAthos,10);
  assert.equal(out.diferencaPCPEntrada,30);
  assert.equal(out.movimentosSemColeta,1);
  assert.equal(out.saidasPorCD.length,2);
});
test('marcas SAD com UN PCP vazio contam, e percentuais nao compensam movimentos', () => {
  const {mapa,pcp}=exemplo();
  mapa.push(['','SAD','Jundiaí - SP','ATHOS','V1','1.500,00','02/10/2026']);
  const r=ctx.pgTempSasAdaptResumo_(mapa,pcp);
  assert.equal(r.saidasCD,1590);
  assert.equal(r.diferencaAthos,-1490);
});
test('falha de cabecalho interrompe a visao sem mexer no portal', () => {
  const {mapa,pcp}=exemplo();
  mapa[0][2]='CD PCP';
  assert.throws(()=>ctx.pgTempSasAdaptResumo_(mapa,pcp),/CD DESTINO/);
});
