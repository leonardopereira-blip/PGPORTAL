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
  .replace('total:100,coletada:0,', "total:100,coletada:Number(r['TIRAGEM COLETADA']||0),")
  .replace("pgCampoColeta:(r,n)=>r[n]||'',", "pgCampoColeta:(r,n)=>r[n]||'',pgEhFonteAcabadora:r=>Boolean(r._acabadora),")
  .replace('concluida:false,...estado', 'concluida:false,...estado,...(r._estado||{})')
  .replace('pgGiroSaldoPrazosV41:()=>({', 'pgGiroSaldoPrazosV41:r=>({')
  .replace('totalPendente:eventos.reduce((s,e)=>s+e.volume,0),eventos',
    'totalPendente:(r._eventos||eventos).reduce((s,e)=>s+e.volume,0),eventos:r._eventos||eventos')
  .replace("checked:id==='chkGiroAberto'||(id==='chkGiroPos'&&pos)",
    "checked:(id==='chkGiroAberto'&&aberto)||(id==='chkGiroConcluido'&&concluido)||(id==='chkGiroPos'&&pos)")
  .replace('pgGiroChaveObs:(_,x)=>x,',
    'pgCodigosMapasColetadosTPLinha:r=>r._mapas||[],pgGiroChaveObs:(_,x)=>x,');
const {executarGiro} = vm.runInNewContext(harness + '\n({executarGiro});', {require, __dirname});

const pendente = (sku='PENDENTE', extra={}) => ({SKU:sku,TIRAGEM:100,'TIRAGEM TOTAL':100,
  _estado:{pendente:true,saldo:50},_eventos:[{categoria:'Vencida',volume:50,dias:0}],...extra});
const finalizado = (sku='CONCLUIDO', extra={}) => ({SKU:sku,TIRAGEM:200,'TIRAGEM TOTAL':200,
  _estado:{concluida:true},_eventos:[],'Última Etapa':'CONCLUÍDO',...extra});
const tela = (materiais, extra={}) => executarGiro({materiais,retornarTela:true,...extra});
const texto = html => html.replace(/<[^>]*>/g, '').trim();
const celulas = linha => [...linha.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
  .map(([,atributos,conteudo]) => ({atributos, texto:texto(conteudo)}));
const celulasMaster = html => [...html.matchAll(/<tr class="hover:bg-slate-50 transition-colors border-t border-slate-200">([\s\S]*?)<\/tr>/g)]
  .map(m => celulas(m[1]));
const linhasMaster = html => celulasMaster(html).map(linha => linha.map(c => c.texto));
const valores = (resultado, marca='COC') => {
  const linha = linhasMaster(resultado.html).find(c => c[2] === marca);
  assert(linha, 'Grupo ' + marca + ' está visível');
  return [linha[6],linha[7],linha[9],linha[10]];
};

test('Giro distingue pendências do total do grupo incluindo SKU concluído', () => {
  const r = tela([pendente(),finalizado()]);
  assert.equal(r.linhas.length,1,'Concluído não reaparece entre as pendências');
  assert.deepEqual(valores(r),['1','2','50','300']);
  assert.equal(r.linhas[0].tiragem,50,'Exportação continua com o saldo filtrado');
  const html = fs.readFileSync(path.join(__dirname,'..','abaGiroSemanal_1.html'),'utf8');
  const headers = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => texto(m[1]));
  assert.deepEqual(headers.slice(6,13), ['Skus pendentes','SKUs totais','SKUs coletados',
    'Tiragem pendente','Tiragem total','Tiragem coletada','% coletado']);
  assert.match(r.html, /colspan="15"/, 'Linha expandida acompanha todas as colunas do grupo');
});

test('total inclui SKU fora do slider e separa grupos por marca', () => {
  const futuro = pendente('FORA-SLIDER',{TIRAGEM:150,'TIRAGEM TOTAL':150,
    _estado:{pendente:true,saldo:60},_eventos:[{categoria:'A vencer',volume:60,dias:-20}]});
  const outra = pendente('OUTRA-MARCA',{UNIDADE:'OUTRA',TIRAGEM:700,'TIRAGEM TOTAL':700,
    _estado:{pendente:true,saldo:30},_eventos:[{categoria:'Vencida',volume:30,dias:0}]});
  const r = tela([pendente(),finalizado(),futuro,outra]);
  assert.deepEqual(valores(r),['1','3','50','450']);
  assert.deepEqual(valores(r,'OUTRA'),['1','1','30','700']);
  assert(!r.linhas.some(l => l.sku === 'FORA-SLIDER'));
});

test('SKU total conta os mesmos itens dos restantes e tiragem soma as linhas originais', () => {
  const r = tela([
    pendente('IGNORADO-A',{SKU_REAL:'SKU-REAL',JOIN_KEY:'CHAVE-COMPARTILHADA',_ROW_ID:'PCP-1'}),
    pendente('IGNORADO-B',{SKU_REAL:'SKU-REAL',JOIN_KEY:'CHAVE-COMPARTILHADA',_ROW_ID:'PCP-2',TIRAGEM:200,'TIRAGEM TOTAL':200})
  ]);
  assert.deepEqual(valores(r),['1','1','100','300'],
    'Mesmo SKU aparece uma vez, com a soma das tiragens e dos saldos dos kits distintos');
  assert.equal(r.linhas.length,1);
});

test('TIRAGEM TOTAL zero ou ausente nao recorre a TIRAGEM nem a QUANTIDADE', () => {
  assert.deepEqual(valores(tela([pendente(),finalizado('ZERO',{
    TIRAGEM:900,QUANTIDADE:999,'TIRAGEM TOTAL':0
  })])),['1','1','50','100']);
  assert.deepEqual(valores(tela([pendente(),finalizado('AUSENTE',{
    TIRAGEM:800,QUANTIDADE:800,'TIRAGEM TOTAL':undefined
  })])),['1','1','50','100']);
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
  assert.deepEqual(valores(concluido),['0','2','0','300']);
});

test('acabadora soma TIRAGEM TOTAL e ignora a base CD de 50', () => {
  const r = tela([
    pendente('ACAB-PARCIAL',{
      _acabadora:true,TIRAGEM:50,'TIRAGEM A ENTREGAR (total por CD)':50,'TIRAGEM TOTAL':25000,
      _estado:{pendente:true,parcial:true,saldo:20000,coletada:5000},
      _eventos:[{categoria:'Vencida',volume:20000,dias:0}]
    }),
    finalizado('ACAB-CONCLUIDO',{
      _acabadora:true,TIRAGEM:75,'TIRAGEM A ENTREGAR (total por CD)':50,'TIRAGEM TOTAL':10000
    })
  ],{pos:true});
  assert.deepEqual(valores(r),['1','2','20000','35000'],
    'Total soma TIRAGEM TOTAL das linhas, incluindo SKUs concluidos');
  assert.equal(detalheSku(r,'ACAB-PARCIAL')[6],'20000');
  assert.equal(detalheSku(r,'ACAB-PARCIAL')[7],'25000');
  assert.equal(r.linhas[0].tiragem,20000,'Saldo pendente nao deve mudar');
});

test('acabadora preserva zero explicito em TIRAGEM TOTAL sem recorrer a outras colunas', () => {
  const r = tela([
    pendente('ACAB-PARCIAL',{
      _acabadora:true,TIRAGEM:50,'TIRAGEM A ENTREGAR (total por CD)':50,'TIRAGEM TOTAL':25000,
      _estado:{pendente:true,saldo:20000},
      _eventos:[{categoria:'Vencida',volume:20000,dias:0}]
    }),
    finalizado('ACAB-ZERO',{
      _acabadora:true,TIRAGEM:900,'TIRAGEM A ENTREGAR (total por CD)':900,'TIRAGEM TOTAL':0
    })
  ],{pos:true});
  assert.deepEqual(valores(r),['1','1','20000','25000']);
});

test('grupo misto soma TIRAGEM TOTAL de PCP e PCP_ACABADORAS', () => {
  const r = tela([
    pendente('PCP-LINHA',{_acabadora:false,TIRAGEM:50,'TIRAGEM TOTAL':12000,
      _estado:{pendente:true,saldo:9000},
      _eventos:[{categoria:'Vencida',volume:9000,dias:0}]}),
    finalizado('ACAB-LINHA',{_acabadora:true,TIRAGEM:50,
      'TIRAGEM A ENTREGAR (total por CD)':50,'TIRAGEM TOTAL':18000})
  ]);
  assert.deepEqual(valores(r),['1','2','9000','30000']);
});

test('parcela zero ja consolidada no SKU e CD nao duplica pendencia nem contagem', () => {
  const principal = pendente('SAS27LAAMT42101BRPDR00',{
    'CD DESTINO':'CD JDI',_acabadora:true,'TIRAGEM TOTAL':25159,
    _estado:{pendente:true,parcial:true,saldo:20667,coletada:4492},
    _eventos:[{categoria:'Vencida',volume:20667,dias:0}]
  });
  const parcela = pendente('SAS27LAAMT42101BRPDR00',{
    'CD DESTINO':'CD JDI',_acabadora:true,'TIRAGEM TOTAL':0,
    'TIRAGEM A ENTREGAR (total por CD)':22948,
    _estado:{pendente:true,saldo:22948},
    _eventos:[{categoria:'Vencida',volume:22948,dias:0}]
  });
  for (const ordem of [[principal,parcela],[parcela,principal]]) {
    const r = tela(ordem,{pos:true});
    assert.deepEqual(valores(r),['1','1','20667','25159'],
      'A parcela 22948 ja esta dentro dos 25159 e nao se soma como outro SKU');
    assert.equal(r.linhas.length,1,'A exportacao tambem mantem apenas a linha consolidada');
    assert.equal((r.html.match(/<tr class="hover:bg-slate-50">/g)||[]).length,1,
      'Somente um detalhe por SKU consolidado');
  }
});

test('kits da PCP Acabadoras nao multiplicam o total nem a coleta de um mesmo SKU', () => {
  const sku='CCP24UX98164601';
  const principal=pendente(sku,{
    KIT:'CCKPO0127L31102','TIRAGEM TOTAL':52106,'TIRAGEM COLETADA':19152,
    _estado:{pendente:true,parcial:true,saldo:32954,coletada:19152},
    _eventos:[{categoria:'Vencida',volume:32954,dias:0}]
  });
  const parcelas=[14350,1502,702,1149].map((quantidade,i)=>pendente(sku,{
    KIT:'KIT-'+i,'TIRAGEM TOTAL':0,TIRAGEM:quantidade,
    _estado:{pendente:true,saldo:quantidade},
    _eventos:[{categoria:'Vencida',volume:quantidade,dias:0}]
  }));
  const r=tela([principal,...parcelas],{pos:true});
  assert.deepEqual(valores(r),['1','1','32954','52106']);
  assert.equal(r.linhas.length,1);
  assert.deepEqual(detalheSku(r,sku).slice(6,10),['32954','52106','19152','36,76%']);
});

test('linha com TIRAGEM TOTAL zero fica fora, mesmo sem consolidado no SKU e CD', () => {
  const solitario = pendente('SKU-ZERO',{'TIRAGEM TOTAL':0,
    _estado:{pendente:true,saldo:100},_eventos:[{categoria:'Vencida',volume:100,dias:0}]});
  const somenteZero=tela([solitario]);
  assert.equal(somenteZero.linhas.length,0);
  assert.equal(linhasMaster(somenteZero.html).length,0);
  const r = tela([pendente('SKU-POSITIVO',{'TIRAGEM TOTAL':200,'CD DESTINO':'CD FOR'}),solitario]);
  assert.equal(linhasMaster(r.html).length,1,'Linha zero nao cria grupo separado por CD');
  assert.deepEqual(Array.from(r.linhas,x=>x.sku),['SKU-POSITIVO']);
});

const celulasDetalhe = (resultado, sku) => {
  const linha = [...resultado.html.matchAll(/<tr class="hover:bg-slate-50">([\s\S]*?)<\/tr>/g)]
    .map(m => celulas(m[1]))
    .find(c => c[1].texto === sku);
  assert(linha, 'Detalhe do SKU ' + sku + ' está presente');
  return linha;
};
const detalheSku = (resultado, sku) => celulasDetalhe(resultado,sku).map(c => c.texto);

test('detalhe do SKU parcial distingue tiragem pendente e original sem alterar saldo ou status', () => {
  const r = tela([pendente('PARCIAL',{TIRAGEM:1000,'TIRAGEM TOTAL':1000,Coleta_TP:'2026-10-10',
    _estado:{pendente:true,parcial:true,saldo:100,coletada:900},
    _eventos:[{categoria:'Vencida',volume:100,dias:0}]})],{pos:true});
  const detalhe = detalheSku(r,'PARCIAL');
  assert.equal(detalhe.length,14,'Detalhe possui observação e nova data em colunas próprias');
  assert.deepEqual(detalhe.slice(6,10),['100','1000','900','90,00%']);
  assert.equal(detalhe[13],'—','Nova data permanece na última coluna');
  assert.deepEqual(valores(r),['1','1','100','1000'],
    'Coleta parcial mantém um SKU pendente, com somente o saldo na tiragem pendente');
  assert.equal(r.linhas[0].tiragem,100,'Saldo da exportação preservado');
  assert.equal(r.linhas[0].status,'Coletado a menos');
  const header = r.html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] || '';
  const colunas = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => texto(m[1]));
  assert.deepEqual(colunas.slice(6),['Tiragem pendente','Tiragem total','Tiragem coletada',
    '% coletado','Kit PCP','Mapa de saída','Observação Específica do SKU','Nova data']);
});

test('detalhe nao apresenta SKU zerado, mesmo com QUANTIDADE e saldo', () => {
  const r = tela([pendente('VALIDO'),pendente('ZERO-EXPLICITO',
    {TIRAGEM:0,'TIRAGEM TOTAL':0,QUANTIDADE:999})]);
  assert.deepEqual(Array.from(r.linhas,x=>x.sku),['VALIDO']);
  assert.doesNotMatch(r.html,/ZERO-EXPLICITO/);
  assert.deepEqual(valores(r),['1','1','50','100']);
});

test('% coletado do grupo usa todos os SKUs da Tiragem total, mesmo concluídos ou filtrados', () => {
  const parcial = pendente('PARCIAL', {
    TIRAGEM:1000,'TIRAGEM TOTAL':1000,'TIRAGEM COLETADA':900,Coleta_TP:'2026-10-10',
    _estado:{pendente:true,parcial:true,saldo:100},
    _eventos:[{categoria:'Vencida',volume:100,dias:0}]
  });
  const completo = finalizado('CONCLUIDO', {
    TIRAGEM:1000,'TIRAGEM TOTAL':1000,'TIRAGEM COLETADA':1000,Coleta_TP:'2026-10-10'
  });
  const naoConfirmado = finalizado('SEM-TP', {
    TIRAGEM:1000,'TIRAGEM TOTAL':1000,'TIRAGEM COLETADA':500,Coleta_TP:''
  });
  const r=tela([parcial,completo,naoConfirmado],{pos:true});
  assert.deepEqual(linhasMaster(r.html)[0].slice(8,13),['1','100','3000','2400','80,00%'],
    'A tiragem coletada do PCP inclui os concluídos filtrados e o volume registrado sem data TP');
  const detalhe=detalheSku(r,'PARCIAL');
  assert.equal(detalhe[6],'100','Pendente continua representando só o saldo');
  assert.equal(detalhe[7],'1000','Total permanece inalterado');
  assert.equal(detalhe[9],'90,00%','Coleta parcial de 900 / 1000');
});

test('excesso é limitado a 100% do próprio SKU, nunca compensa outra tiragem', () => {
  const r=tela([
    pendente('EXCESSO',{'TIRAGEM TOTAL':100,'TIRAGEM COLETADA':150,Coleta_TP:'2026-10-10',
      _estado:{pendente:false,parcial:false,saldo:0}}),
    pendente('SEM-COLETA',{'TIRAGEM TOTAL':100,'TIRAGEM COLETADA':0,
      _estado:{pendente:true,saldo:100},_eventos:[{categoria:'Vencida',volume:100,dias:0}]})
  ],{concluido:true});
  assert.deepEqual(linhasMaster(r.html)[0].slice(6,13),
    ['1','2','1','100','200','100','50,00%']);
  assert.equal(r.linhas.length,2);
  assert.deepEqual(detalheSku(r,'EXCESSO').slice(6,10),['0','100','100','100,00%']);
  assert.deepEqual(detalheSku(r,'SEM-COLETA').slice(6,10),['100','100','0','0,00%']);
});

test('Antilhas: coleta bruta acima do total nao inflaciona cobertura de 99,78%', () => {
  const materiais=[
    ...Array.from({length:7},(_,i)=>pendente('PENDENTE-'+i,{
      TIRAGEM:1403,'TIRAGEM TOTAL':1403,'TIRAGEM COLETADA':1380,
      Coleta_TP:'2026-10-01',_estado:{pendente:true,parcial:true,saldo:23},
      _eventos:[{categoria:'Vencida',volume:23,dias:0}]
    })),
    finalizado('CONCLUIDO-A',{TIRAGEM:20900,'TIRAGEM TOTAL':20900,'TIRAGEM COLETADA':81881}),
    finalizado('CONCLUIDO-B',{TIRAGEM:20900,'TIRAGEM TOTAL':20900,'TIRAGEM COLETADA':20900}),
    finalizado('CONCLUIDO-C',{TIRAGEM:20900,'TIRAGEM TOTAL':20900,'TIRAGEM COLETADA':20900})
  ];
  const r=tela(materiais,{pos:true});
  assert.equal(r.linhas.length,7);
  assert.deepEqual(linhasMaster(r.html)[0].slice(6,13),
    ['7','10','3','161','72521','72360','99,78%']);
});

test('percentual de acabadora usa TIRAGEM TOTAL, não a tiragem por CD', () => {
  const r=tela([pendente('ACABADORA',{
    _acabadora:true,TIRAGEM:50,'TIRAGEM A ENTREGAR (total por CD)':50,
    'TIRAGEM TOTAL':25000,'TIRAGEM COLETADA':5000,Coleta_TP:'2026-10-10',
    _estado:{pendente:true,parcial:true,saldo:20000},
    _eventos:[{categoria:'Vencida',volume:20000,dias:0}]
  })],{pos:true});
  assert.equal(linhasMaster(r.html)[0][12],'20,00%');
  assert.equal(detalheSku(r,'ACABADORA')[9],'20,00%');
});

test('tiragem total zero nao soma coleta bruta e nao aparece nem na planilha', () => {
  const r=tela([pendente('VALIDO'),pendente('ZERO',{'TIRAGEM TOTAL':0,TIRAGEM:1000,
    'TIRAGEM COLETADA':500,Coleta_TP:'2026-10-10'})]);
  assert.deepEqual(Array.from(r.linhas,x=>x.sku),['VALIDO']);
  assert.deepEqual(linhasMaster(r.html)[0].slice(7,13),['1','0','50','100','0','0,00%']);
  assert.doesNotMatch(r.html,/ZERO/);
});

test('Giro mantém 99,99% em amarelo quando falta um livro e preserva as anotações existentes', () => {
  const chaveMaster = 'LOGPRINT|COC|Série nova|V1|CD JDI';
  const chaveSku = 'LOGPRINT|COC|UM-LIVRO|V1|CD JDI';
  const r = tela([pendente('UM-LIVRO',{
    TIRAGEM:26192,'TIRAGEM TOTAL':26192,'TIRAGEM COLETADA':26191,Coleta_TP:'2026-10-10',
    'COD KIT':'KIT-PCP-01',
    _estado:{pendente:true,parcial:true,saldo:1},
    _eventos:[{categoria:'Tiragem vencida',volume:1,dias:0}],
    _mapas:['MP-01','MP-02']
  })],{pos:true,historico:{
    master:{[chaveMaster]:[{obs:'Prazo geral registrado',data:'10/10/2026 12:00'}]},
    sku:{[chaveSku]:[{obs:'Prazo do SKU registrado',data:'10/10/2026 12:00'}]}
  }});
  assert.deepEqual(linhasMaster(r.html)[0].slice(6,13),['1','1','0','1','26192','26191','99,99%']);
  assert.deepEqual(detalheSku(r,'UM-LIVRO').slice(6,11),['1','26192','26191','99,99%','KIT-PCP-01']);
  assert.deepEqual(detalheSku(r,'UM-LIVRO')[11].match(/MP-0[12]/g),['MP-01','MP-02']);
  assert.match(celulasMaster(r.html)[0][12].atributos,/\btext-amber-800\b/);
  assert.match(celulasDetalhe(r,'UM-LIVRO')[9].atributos,/\btext-amber-800\b/);
  assert.equal(r.linhas[0].chaveMaster,chaveMaster);
  assert.equal(r.linhas[0].chaveSku,chaveSku);
  assert.match(r.html,/value="Prazo geral registrado"/);
  assert.match(r.html,/value="Prazo do SKU registrado"/);
});

test('Giro aplica as cores do percentual ao grupo e ao SKU nos limites', () => {
  for (const [coletada,total,percentual,cor] of [
    [899999,1000000,'89,99%','text-red-700'],
    [9000,10000,'90,00%','text-amber-800'],
    [10000,10000,'100,00%','text-emerald-700']
  ]) {
    const saldo = total - coletada;
    const r = tela([pendente('LIMITE',{
      TIRAGEM:total,'TIRAGEM TOTAL':total,'TIRAGEM COLETADA':coletada,Coleta_TP:'2026-10-10',
      _estado:{pendente:saldo>0,parcial:saldo>0,concluida:saldo===0,saldo},
      _eventos:saldo ? [{categoria:'Tiragem vencida',volume:saldo,dias:0}] : [],
      _mapas:['MP-LIMITE']
    })],{pos:true,concluido:true});
    for (const celula of [celulasMaster(r.html)[0][12],celulasDetalhe(r,'LIMITE')[9]]) {
      assert.equal(celula.texto,percentual);
      assert(celula.atributos.includes(cor));
    }
    assert.equal(detalheSku(r,'LIMITE')[11],'MP-LIMITE');
  }
});
