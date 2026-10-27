const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','Scripts_Meta_Armazem_Realizado.html'),'utf8')
  .match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];

function portal(rows){
  const counts={index:0,events:0};
  const w={dadosGlobais:rows,MAPA_SAIDA_CACHE:{},PG_MAPA_TP_CARGA_CONCLUIDA:true,
    pgNumeroPrazoV35:Number,pgNormalizarDataColeta:v=>v||'',pgCampoColeta:(l,n)=>l[n],
    pgEhFonteAcabadora:()=>false,pgLinhasUnicas:l=>l,
    pgUnirTotalSemDuplicidade:l=>{counts.index++;return l;},
    pgIdentidadeOperacionalTPLinha:l=>({chave:l.group}),
    pgVolumesColetaUnificadosV37(l){counts.events++;return {
      eventosEntregaTP:[{data:'2026-10-20',volume:l.entregue||0,linhaMapa:l.ID+2}],
      eventosColetaTP:[{data:'2026-10-19',volume:l.coletado||0,linhaMapa:l.ID+2}]};}};
  vm.runInNewContext(source,{window:w});
  const prepare=(base,corte='2026-10-21')=>w.pgMAPrepararLinhas(base,w.dadosGlobais,corte);
  return {w,counts,prepare};
}
const row=(ID,group,extra={})=>({_SOURCE:'PCP',_ROW_ID:'PCP:'+ID,ID,group,CD_MAPA:'CD JDI',
  MARCA_FINAL:'SAS',TIPO:'ALUNO',TIRAGEM:100,...extra});
const plain=x=>JSON.parse(JSON.stringify(x));

test('trocar Tipo reaproveita índice e movimentos e mantém os valores de cada recorte',()=>{
  const aluno=row(1,'A',{entregue:40,coletado:60});
  const professor=row(2,'P',{TIPO:'PROFESSOR',entregue:50,coletado:70});
  const rows=[aluno,professor],p=portal(rows),before=plain(rows);
  const all=p.prepare(rows);
  assert.equal(p.counts.index,1);
  assert.equal(p.counts.events,4);
  const alunoOnly=p.prepare([aluno]),professorOnly=p.prepare([professor]);
  assert.deepEqual(plain(alunoOnly),plain([all[0]]));
  assert.deepEqual(plain(professorOnly),plain([all[1]]));
  assert.equal(p.counts.index,1,'não reconstrói o universo ao trocar os filtros');
  assert.equal(p.counts.events,4,'não recalcula as mesmas parcelas TP');
  assert.deepEqual(plain(rows),before,'não altera o payload de origem');
});

test('grupo parcial preserva o volume inteiro e o diagnóstico muda apenas no recorte',()=>{
  const a=row(1,'A',{entregue:40}),b=row(2,'A',{TIPO:'PROFESSOR'}),p=portal([a,b]);
  const complete=p.prepare([a,b]);
  const partial=p.prepare([b]);
  assert.equal(partial[0].TIRAGEM,200);
  assert.equal(partial[0]._PG_MA.entregueBruto,40);
  assert.equal(partial[0]._PG_MA.filtroParcial,true);
  assert.equal(complete[0]._PG_MA.filtroParcial,false,'não contamina a chamada anterior');
  assert.equal(p.prepare([a,b])[0]._PG_MA.filtroParcial,false);
});

test('novo mapa, corte, carga e fatias invalidam o que depende de dados atualizados',()=>{
  const rows=[row(1,'A'),row(2,'B'),row(3,'C')],p=portal(rows);
  p.prepare(rows);const first=p.counts.events;
  p.w.MAPA_SAIDA_CACHE={};p.prepare(rows);
  assert.equal(p.counts.events,first+6,'novo mapa rele as parcelas');
  const before=p.counts.events;
  const historical=p.prepare(rows,'2026-10-18');
  assert.equal(p.counts.events,before+6,'novo corte refaz os movimentos filtrados');
  assert.equal(historical.reduce((s,l)=>s+l._PG_MA.coletadoBruto,0),0);
  p.w.PG_MAPA_TP_CARGA_CONCLUIDA=false;p.prepare(rows,'2026-10-18');
  assert.equal(p.counts.events,before+12,'estado da carga invalida o cache');
  rows[1]=row(20,'B',{TIRAGEM:250});p.prepare(rows);
  assert.equal(p.counts.index,2,'substituição no meio do array atualiza o índice');
  rows.push(row(4,'D'));assert.equal(p.prepare(rows).length,4);
  assert.equal(p.counts.index,3,'fatia anexada atualiza o índice');
  rows[0].TIRAGEM=350;rows[0].TIPO='PROFESSOR';rows[0].entregue=45;
  const changed=p.prepare(rows);
  assert.equal(p.counts.index,4,'edição no mesmo objeto atualiza o índice');
  assert.equal(changed.find(l=>l.ID===1).TIRAGEM,350);
  assert.equal(changed.find(l=>l.ID===1)._PG_MA.entregueBruto,45);
  assert.equal(changed.find(l=>l.ID===1).TIPO,'PROFESSOR');
});
