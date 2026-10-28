const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reutiliza o harness do Giro, permitindo estados diferentes por linha nesta suíte.
const origem = fs.readFileSync(path.join(__dirname, 'giro-filtros-excedente-exportacao.test.cjs'), 'utf8');
const harness = origem.slice(0, origem.indexOf('\ntest('))
  .replace('pos=false,temCampos=true', 'pos=false,aberto=true,concluido=false,temCampos=true')
  .replace('pgEstadoColetaMapa:()=>({', 'pgEstadoColetaMapa:r=>({')
  .replace('concluida:false,...estado', 'concluida:false,...estado,...(r._estado||{})')
  .replace('pgGiroSaldoPrazosV41:()=>({', 'pgGiroSaldoPrazosV41:r=>({')
  .replace('totalPendente:eventos.reduce((s,e)=>s+e.volume,0),eventos',
    'totalPendente:(r._eventos||eventos).reduce((s,e)=>s+e.volume,0),eventos:r._eventos||eventos')
  .replace("checked:id==='chkGiroAberto'||(id==='chkGiroPos'&&pos)",
    "checked:(id==='chkGiroAberto'&&aberto)||(id==='chkGiroConcluido'&&concluido)||(id==='chkGiroPos'&&pos)");
const {executarGiro} = vm.runInNewContext(harness + '\n({executarGiro});', {require, __dirname});

const pendente = (sku='PENDENTE', extra={}) => ({SKU:sku,TIRAGEM:100,
  _estado:{pendente:true,saldo:50},_eventos:[{categoria:'Vencida',volume:50,dias:0}],...extra});
const finalizado = (sku='CONCLUIDO', extra={}) => ({SKU:sku,TIRAGEM:200,
  _estado:{concluida:true},_eventos:[],'Última Etapa':'CONCLUÍDO',...extra});
const tela = (materiais, extra={}) => executarGiro({materiais,retornarTela:true,...extra});
const texto = html => html.replace(/<[^>]*>/g, '').trim();
const linhasMaster = html => [...html.matchAll(/<tr class="hover:bg-slate-50 transition-colors border-t border-slate-200">([\s\S]*?)<\/tr>/g)]
  .map(m => [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(c => texto(c[1])));
const valores = (resultado, marca='COC') => {
  const linha = linhasMaster(resultado.html).find(c => c[2] === marca);
  assert(linha, 'Grupo ' + marca + ' está visível');
  return linha.slice(6,10);
};

test('Giro distingue pendências do total do grupo incluindo SKU concluído', () => {
  const r = tela([pendente(),finalizado()]);
  assert.equal(r.linhas.length,1,'Concluído não reaparece entre as pendências');
  assert.deepEqual(valores(r),['1','2','50','300']);
  assert.equal(r.linhas[0].tiragem,50,'Exportação continua com o saldo filtrado');
  const html = fs.readFileSync(path.join(__dirname,'..','abaGiroSemanal_1.html'),'utf8');
  const headers = ['Skus pendentes','SKUs totais','Tiragem pendente','Tiragem total'];
  let anterior = -1;
  for (const header of headers) {
    const indice = html.indexOf('>' + header + ' ');
    assert(indice > anterior, 'Coluna presente e na ordem solicitada: ' + header);
    anterior = indice;
  }
  assert.match(r.html, /colspan="12"/, 'Linha expandida acompanha as duas novas colunas');
});

test('total inclui SKU fora do slider e separa grupos por marca', () => {
  const futuro = pendente('FORA-SLIDER',{TIRAGEM:150,
    _estado:{pendente:true,saldo:60},_eventos:[{categoria:'A vencer',volume:60,dias:-20}]});
  const outra = pendente('OUTRA-MARCA',{UNIDADE:'OUTRA',TIRAGEM:700,
    _estado:{pendente:true,saldo:30},_eventos:[{categoria:'Vencida',volume:30,dias:0}]});
  const r = tela([pendente(),finalizado(),futuro,outra]);
  assert.deepEqual(valores(r),['1','3','50','450']);
  assert.deepEqual(valores(r,'OUTRA'),['1','1','30','700']);
  assert(!r.linhas.some(l => l.sku === 'FORA-SLIDER'));
});

test('SKU total conta os mesmos itens dos restantes e tiragem soma as linhas originais', () => {
  const r = tela([
    pendente('IGNORADO-A',{SKU_REAL:'SKU-REAL',JOIN_KEY:'CHAVE-COMPARTILHADA',_ROW_ID:'PCP-1'}),
    pendente('IGNORADO-B',{SKU_REAL:'SKU-REAL',JOIN_KEY:'CHAVE-COMPARTILHADA',_ROW_ID:'PCP-2',TIRAGEM:200})
  ]);
  assert.deepEqual(valores(r),['2','2','50','300'],
    'Mesmo SKU e JOIN_KEY preservam os dois itens no total e nos restantes; saldo vigente mantém sua deduplicação');
});

test('TIRAGEM zero explícito prevalece sobre QUANTIDADE e ausência permite fallback', () => {
  assert.deepEqual(valores(tela([pendente(),finalizado('ZERO',{TIRAGEM:0,QUANTIDADE:999})])),
    ['1','2','50','100']);
  assert.deepEqual(valores(tela([pendente(),finalizado('QUANTIDADE',{TIRAGEM:undefined,QUANTIDADE:80})])),
    ['1','2','50','180']);
});

test('Zerado altera apenas rótulo geral e mantém os filtros e o estado interno', () => {
  const materiais = [pendente(),finalizado()];
  const r = tela(materiais);
  assert.equal(linhasMaster(r.html)[0][4],'Zerado');
  assert.equal(r.linhas[0].status,'Em Aberto');
  assert.match(r.html,/text-indigo-600[^>]*>Em Aberto<\/td>/,'Status do detalhe preservado');
  const html = fs.readFileSync(path.join(__dirname,'..','abaGiroSemanal_1.html'),'utf8');
  assert.match(html, /id="chkGiroAberto"[^>]*> Zerado<\/label>/);
  assert.equal(tela(materiais,{aberto:false}).linhas.length,0,'Desmarcar Zerado oculta os mesmos itens');
  const concluido = tela(materiais,{aberto:false,concluido:true});
  assert.equal(concluido.linhas.length,1);
  assert.equal(concluido.linhas[0].status,'Concluído');
  assert.deepEqual(valores(concluido),['1','2','200','300']);
});

const detalheSku = (resultado, sku) => {
  const linha = [...resultado.html.matchAll(/<tr class="hover:bg-slate-50">([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(c => texto(c[1])))
    .find(c => c[1] === sku);
  assert(linha, 'Detalhe do SKU ' + sku + ' está presente');
  return linha;
};

test('detalhe do SKU parcial distingue tiragem pendente e original sem alterar saldo ou status', () => {
  const r = tela([pendente('PARCIAL',{TIRAGEM:1000,Coleta_TP:'2026-10-10',
    _estado:{pendente:true,parcial:true,saldo:100,coletada:900},
    _eventos:[{categoria:'Vencida',volume:100,dias:0}]})],{pos:true});
  const detalhe = detalheSku(r,'PARCIAL');
  assert.equal(detalhe.length,10,'Detalhe possui total, pendente, observação e nova data em colunas próprias');
  assert.equal(detalhe[6],'100');
  assert.equal(detalhe[7],'1000');
  assert.equal(detalhe[9],'—','Nova data permanece na última coluna');
  assert.deepEqual(valores(r),['1','1','100','1000'],
    'Coleta parcial mantém um SKU pendente, com somente o saldo na tiragem pendente');
  assert.equal(r.linhas[0].tiragem,100,'Saldo da exportação preservado');
  assert.equal(r.linhas[0].status,'Coletado a menos');
  const header = r.html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] || '';
  const colunas = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => texto(m[1]));
  assert.equal(colunas.length,10);
  assert.equal(colunas[6],'Tiragem pendente');
  assert.equal(colunas[7],'Tiragem total');
  assert.equal(colunas[8],'Observação Específica do SKU');
  assert.equal(colunas[9],'Nova data');
});

test('detalhe do SKU preserva tiragem original zero sem trocar por QUANTIDADE', () => {
  const r = tela([pendente('ZERO-EXPLICITO',{TIRAGEM:0,QUANTIDADE:999})]);
  const detalhe = detalheSku(r,'ZERO-EXPLICITO');
  assert.equal(detalhe.length,10);
  assert.equal(detalhe[6],'50','Saldo vigente permanece na coluna pendente');
  assert.equal(detalhe[7],'0','Total original respeita zero explícito');
  assert.equal(r.linhas[0].tiragem,50);
});
