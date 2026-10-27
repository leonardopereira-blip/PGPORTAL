const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','Scripts_EntregasCD_Modelo.html'),'utf8');
const linha=(extra={})=>({_SOURCE:'PCP',MARCA_FINAL:'SAS',GRAFICA_FINAL:'LOGPRINT',CD_FINAL:'CD FOR',
  SKU_REAL:'SKU-01',serie_corrigida:'2ª',TIPO:'Aluno',TIRAGEM:100,plano:'2026-10-28',coletas:[],entregas:[],...extra});
function portal(linhas,regs={},config={}){
  const dia=(s,n)=>{if(!s)return '';const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const window={pgCampoColeta:(l,n)=>l[n],pgLinhasUnicas:x=>x,pgEhFonteAcabadora:l=>l._SOURCE.includes('ACAB'),
    pgDataPlanoColetaLinha:l=>l.plano,pgDataPlanoEntregaSLA:(l,d)=>l.semSLA?'':dia(d===undefined?l.plano:d,2),
    pgVolumesColetaUnificadosV37:l=>({eventosColetaTP:l.coletas,eventosEntregaTP:l.entregas}),pgSerieCorrigidaFunil:l=>l.serie_corrigida};
  const ctx=vm.createContext({window,Date,Intl,console});vm.runInContext(html.replace(/^<script>/,'').replace(/<\/script>\s*$/,''),ctx);
  const m=window.pgEntregasCDModelo,itens=m.montar(linhas,regs,'2026-10-27');
  return {m,itens,c:(f={})=>m.calendario(itens,{hoje:'2026-10-27',fim:'2026-12-02',...config},f)};
}
const vol=p=>p.reduce((s,x)=>s+x.volume,0);
const plain=x=>JSON.parse(JSON.stringify(x));

test('conserva plano entre entregue, parcelas datadas e backlog sem duplicar parcial',()=>{
  const a=portal([linha({plano:'2026-10-20',coletas:[{data:'2026-10-24',volume:30},{data:'2026-10-26',volume:40}],
    entregas:[{data:'2026-10-25',volume:20},{data:'2026-10-27',volume:5}]})]);
  const c=a.c();assert.equal(c.total.total,100);assert.equal(c.total.entregue,20);
  assert.equal(vol(c.total.dias['2026-10-27']),5);
  assert.equal(c.total.backlog,35);assert.equal(vol(c.total.dias['2026-10-28']),40);
  assert.equal(c.total.entregue+Object.values(c.total.dias).reduce((s,p)=>s+vol(p),0)+c.total.backlog,100);
  for(const g of [...c.marcaCD,...c.marcaSerieCD])assert.equal(g.entregue+Object.values(g.dias).reduce((s,p)=>s+vol(p),0)+g.backlog,g.total);
  assert(c.backlog.every(p=>!p.dia));assert(c.parcelas.filter(p=>p.dia).every(p=>!p.backlog));
});

test('previsão manual mantém atraso original como histórico e libera todo saldo no calendário',()=>{
  const l=linha({plano:'2026-10-20',coletas:[{data:'2026-10-24',volume:30}]});
  const a=portal([l]);const chave=a.m.chave(l);
  const b=portal([l],{[chave]:{dataEntrega:'2026-10-30',versao:1}});const c=b.c();
  assert.equal(c.total.backlog,0);assert.equal(vol(c.total.dias['2026-10-30']),100);
  assert.equal(b.itens[0].dtColetaPCP,'2026-10-20');
  assert.equal(c.parcelas.filter(p=>p.status==='TRANSITO')[0].volume,30);
  assert.equal(c.parcelas.filter(p=>p.status==='AGUARDANDO')[0].volume,70);
});

test('coleta real atualiza automaticamente o SLA de cada parcela e data manual permanece',()=>{
  const l=linha({coletas:[{data:'2026-10-26',volume:25},{data:'2026-10-27',volume:25}]});
  const a=portal([l]);const c=a.c();assert.equal(vol(c.total.dias['2026-10-28']),25);assert.equal(vol(c.total.dias['2026-10-29']),25);
  const chave=a.m.chave(l),b=portal([l],{[chave]:{dataEntrega:'2026-11-04'}}).c();
  assert.equal(vol(b.total.dias['2026-11-04']),100);assert(b.parcelas.every(p=>p.fonteEntrega==='Manual'));
});

test('domingo não aparece e feriados ficam sem previsões, preservando data informada',()=>{
  const l=linha();const a=portal([l]),chave=a.m.chave(l);
  for(const original of ['2026-11-01','2026-11-02']){
    const c=portal([l],{[chave]:{dataEntrega:original}}).c();
    assert(!c.dias.some(d=>new Date(d.data+'T12:00:00Z').getUTCDay()===0));
    assert(c.dias.find(d=>d.data==='2026-11-02').feriado);
    assert.equal(vol(c.total.dias['2026-11-02']||[]),0);assert.equal(vol(c.total.dias['2026-11-03']),100);
    assert(c.parcelas.every(p=>p.dataOriginal===original));
  }
});

test('status filtra parcelas e plano na mesma base, sem entregue na coluna inicial',()=>{
  const a=portal([linha({coletas:[{data:'2026-10-26',volume:60}],entregas:[{data:'2026-10-25',volume:20}]})]);
  const c=a.c({status:'TRANSITO'});assert.equal(c.total.total,40);assert.equal(c.total.entregue,0);
  assert.equal(c.parcelas.length,1);assert.equal(c.marcaSerieCD[0].total,40);
  assert.equal(a.c({status:'AGUARDANDO'}).total.total,40);
});

test('todos os recortes conciliam quadro detalhado, por marca e exportação por parcela',()=>{
  const a=portal([linha(),linha({SKU_REAL:'SKU-02',MARCA_FINAL:'COC',CD_FINAL:'CD JDI',TIRAGEM:70}),
    linha({SKU_REAL:'SKU-03',serie_corrigida:'3ª',TIRAGEM:50})]);
  for(const filtro of [{},{marca:'SAS'},{cd:'CD JDI'},{serie:'3ª'},{status:'AGUARDANDO',marca:'SAS'}]){
    const c=a.c(filtro),abas=a.m.exportarCalendario(c);
    assert.equal(c.marcaCD.reduce((s,g)=>s+g.total,0),c.total.total);
    assert.equal(c.marcaSerieCD.reduce((s,g)=>s+g.total,0),c.total.total);
    assert.equal(abas[2].linhas.reduce((s,r)=>s+r[15],0),c.total.total);
    assert(abas.every(aba=>aba.linhas.every(r=>r.length===aba.cabecalho.length)));
    assert.deepEqual(plain(abas.map(aba=>aba.nome)),['Quadro_Marca_CD','Quadro_Marca_Serie_CD','Base_SKUs']);
  }
});

test('item sem SLA e item após ciclo permanecem visíveis nas pendências e no denominador',()=>{
  const a=portal([linha({semSLA:true}),linha({SKU_REAL:'SKU-02',plano:'2026-12-03'})]);
  const c=a.c();assert.equal(c.total.backlog,200);assert.equal(c.total.total,200);
  assert(c.backlog.some(p=>p.motivo==='Sem previsão'));assert(c.backlog.some(p=>p.motivo==='Após o fim do ciclo'));
});

test('chave compartilhada com Giro coincide com a chave montada e distingue CD e OP',()=>{
  const a=portal([linha(),linha({CD_FINAL:'CD JDI'}),linha({OP:'OP-2'})]);
  a.itens.forEach(i=>assert.equal(a.m.chave(i.linha),i.chave));assert.equal(new Set(a.itens.map(i=>i.chave)).size,3);
});

test('nova visão usa TIRAGEM da mesma base canônica, preserva zero e limita parcelas ao plano',()=>{
  const linhas=[linha({TIRAGEM:100}),linha({_SOURCE:'PCP_ACABADORAS',SKU_REAL:'SKU-02',TIRAGEM:70,
    'TIRAGEM A ENTREGAR (total por CD)':400,coletas:[{data:'2026-10-26',volume:50}],entregas:[{data:'2026-10-25',volume:20}]}),
    linha({_SOURCE:'PCP_ACABADORAS',SKU_REAL:'SKU-03',TIRAGEM:0,'TIRAGEM A ENTREGAR (total por CD)':99,
      coletas:[{data:'2026-10-26',volume:80}],entregas:[{data:'2026-10-25',volume:20}]})];
  const a=portal(linhas),itens=a.m.montar(linhas,{},'2026-10-27',{volumeCanonico:true});
  assert.equal(itens.reduce((s,i)=>s+i.total,0),170);assert.equal(itens[2].total,0);
  const c=a.m.calendario(itens,{hoje:'2026-10-27',fim:'2026-12-02'});
  assert.equal(c.total.total,linhas.reduce((s,l)=>s+l.TIRAGEM,0));assert.equal(c.total.entregue,20);
  assert.equal(c.total.entregue+Object.values(c.total.dias).reduce((s,p)=>s+vol(p),0)+c.total.backlog,170);
  assert.equal(c.parcelas.filter(p=>p.item===itens[1]).reduce((s,p)=>s+p.volume,0),70);
  assert.equal(c.parcelas.filter(p=>p.item===itens[2]).length,0);
  assert.equal(a.itens[1].total,400,'contrato legado mantido para consumidores anteriores');
});

test('exportação associa coleta real por identidade do mapa e não inventa data de parcela ambígua',()=>{
  const comVinculo=linha({coletas:[{data:'2026-10-24',volume:30,linhaMapa:101},{data:'2026-10-26',volume:30,linhaMapa:102}],
    entregas:[{data:'2026-10-27',volume:20,linhaMapa:102}]});
  const a=portal([comVinculo]);let base=a.m.exportarCalendario(a.c())[2].linhas;
  const entregue=base.find(r=>r[8]==='Coletado e entregue');assert.equal(entregue[9],'2026-10-26');assert.equal(entregue[12],'TP');
  const semVinculo=linha({coletas:[{data:'2026-10-24',volume:30},{data:'2026-10-26',volume:30}],
    entregas:[{data:'2026-10-27',volume:20}]});
  const b=portal([semVinculo]);base=b.m.exportarCalendario(b.c())[2].linhas;
  const ambiguo=base.find(r=>r[8]==='Coletado e entregue');assert.equal(ambiguo[9],'');assert.equal(ambiguo[12],'TP (sem vínculo de parcela)');
  assert.match(ambiguo[18],/2026-10-24: 30/);assert.match(ambiguo[18],/2026-10-26: 30/);
  const unica=portal([linha({coletas:[{data:'2026-10-24',volume:30}],entregas:[{data:'2026-10-27',volume:20}]})]);
  assert.equal(unica.m.exportarCalendario(unica.c())[2].linhas.find(r=>r[8]==='Coletado e entregue')[9],'2026-10-24');
});

test('entrega real de hoje domingo fecha no Entregue, sem ocultar volume ou alterar data real exportada',()=>{
  const linhas=[linha({coletas:[{data:'2026-10-30',volume:60}],entregas:[{data:'2026-11-01',volume:40}]})];
  const a=portal(linhas),itens=a.m.montar(linhas,{},'2026-11-01');
  const c=a.m.calendario(itens,{hoje:'2026-11-01',fim:'2026-12-02'});
  assert.equal(c.incluiHojeEntregue,true);assert.equal(c.total.entregue,40);assert(!c.dias.some(d=>d.data==='2026-11-01'));
  assert.equal(c.total.entregue+Object.values(c.total.dias).reduce((s,p)=>s+vol(p),0)+c.total.backlog,100);
  assert.equal(a.m.exportarCalendario(c)[2].linhas.find(r=>r[8]==='Coletado e entregue')[10],'2026-11-01');
});

test('exportação envia índices de formato percentual e mantém valores como razões numéricas',()=>{
  const a=portal([linha({coletas:[{data:'2026-10-24',volume:30}],entregas:[{data:'2026-10-25',volume:30}]})]);
  const abas=a.m.exportarCalendario(a.c());
  for(const aba of abas.slice(0,2)){
    const indices=aba.cabecalho.map((t,i)=>t.startsWith('%')?i:-1).filter(i=>i>=0);
    assert.deepEqual(plain(aba.colunasPercentual),plain(indices));
    assert.equal(aba.linhas.at(-1)[aba.cabecalho.indexOf('% entregue')],0.3);
  }
});

test('download mantém painel por marca primeiro e base com histórico PCP, manual e TP completo',()=>{
  const l=linha({OP:'OP-123',ENVIO:'V1',KIT:'KIT-A',DESCRIÇÃO:'Material aluno',CLIENTE_PERSONALIZADO:'Sim',
    coletas:[{data:'2026-10-26',volume:60}],entregas:[{data:'2026-10-25',volume:20}]});
  const inicial=portal([l]),chave=inicial.m.chave(l);
  const a=portal([l],{[chave]:{dataColeta:'2026-10-29',dataEntrega:'2026-10-31',observacao:'Confirmado',
    versao:3,usuario:'analista@exemplo.com',atualizadoEm:'2026-10-27T10:00:00Z'}});
  const c=a.c(),abas=a.m.exportarCalendario(c),base=abas[2];
  const valor=(row,nome)=>row[base.cabecalho.indexOf(nome)];
  assert.equal(abas[0].nome,'Quadro_Marca_CD');
  assert.equal(abas[0].linhas.at(-1)[abas[0].cabecalho.indexOf('Entregue')],c.total.entregue);
  for(const row of base.linhas){
    assert.equal(row.length,base.cabecalho.length);
    assert.equal(valor(row,'OP'),'OP-123');assert.equal(valor(row,'Kit'),'KIT-A');
    assert.equal(valor(row,'Coleta PCP original'),'2026-10-28');
    assert.equal(valor(row,'Entrega PCP + SLA original'),'2026-10-30');
    assert.equal(valor(row,'Coleta manual'),'2026-10-29');
    assert.equal(valor(row,'Entrega manual'),'2026-10-31');
    assert.equal(valor(row,'Observação'),'Confirmado');assert.equal(valor(row,'Versão da previsão'),3);
    assert.equal(valor(row,'Usuário da previsão'),'analista@exemplo.com');
    assert.equal(valor(row,'Coletas TP do item (auditoria)'),'2026-10-26: 60');
    assert.equal(valor(row,'Entregas TP do item (auditoria)'),'2026-10-25: 20');
    assert(row.every(v=>v!==undefined&&v!==null));
  }
  assert.equal(base.linhas.reduce((s,row)=>s+valor(row,'Quantidade'),0),c.total.total);
  for(const nome of ['Coleta PCP original','Entrega PCP + SLA original','Coleta manual','Entrega manual'])
    assert(base.colunasData.includes(base.cabecalho.indexOf(nome)),nome);
});
