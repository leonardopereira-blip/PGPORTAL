const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'EntregasCDPrevisoes.js'), 'utf8');
const chave = (sku='SKU-001', extra={}) => JSON.stringify(['ECD1', 'PCP', 'COC', 'LOGPRINT', sku,
  'CD FOR', 'V1', extra.join || '', '', extra.op || '']);
const payload = (extra={}) => ({chave: chave(), dataColeta: '2026-10-27', dataEntrega: '2026-10-29',
  observacao: 'Transportadora confirmou', versaoEsperada: 0, requestId: 'request-001', ...extra});

function portal(estado={rows:null}, opcoes={}) {
  let locks=0, releases=0, writes=0, exportado;
  const now = new Date('2026-10-26T15:00:00Z');
  class Relogio extends Date { constructor(...args){super(...(args.length?args:[now]));} }
  const range = (row, col, nr, nc) => {
    const obj = {
      getValues:()=>Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>estado.rows?.[row+r-1]?.[col+c-1] ?? '')),
      setValues(values) { writes++; if(opcoes.failWrite)throw Error('Gravação indisponível');
        values.forEach((r,i)=>{while(estado.rows.length<row+i)estado.rows.push([]);
          r.forEach((v,j)=>estado.rows[row+i-1][col+j-1]=v);});return obj;},
      setFontWeight:()=>obj,setBackground:()=>obj,setFontColor:()=>obj
    }; return obj;
  };
  const sheet={getLastRow:()=>estado.rows.length,getRange:range,setFrozenRows(){}};
  const ss={getSheetByName:()=>estado.rows?sheet:null,insertSheet(){estado.rows=[];return sheet;}};
  const c={Date:Relogio,console,pgArquivoObservacoesGiro_:()=>ss,
    LockService:{getScriptLock:()=>({waitLock(){if(opcoes.failLock)throw Error('Ocupado');locks++;},releaseLock(){releases++;}})},
    Session:{getActiveUser:()=>({getEmail:()=>opcoes.email===undefined?'analista@exemplo.com':opcoes.email})},
    Utilities:{formatDate:(d,t,p)=>{assert.equal(t,'America/Sao_Paulo');assert.equal(p,'yyyy-MM-dd');return opcoes.hoje||'2026-10-26';}},
    SpreadsheetApp:{flush(){}},gerarPlanilhaReportExecutiva:p=>{exportado=p;return {success:true,url:'https://docs.google.com/spreadsheets/d/teste'};}};
  vm.createContext(c);vm.runInContext(source,c);
  return {c,estado,locks:()=>locks,releases:()=>releases,writes:()=>writes,exportado:()=>exportado};
}

test('primeira leitura vazia não cria aba e primeira gravação persiste após recarregar',()=>{
  const a=portal();assert.equal(Object.keys(a.c.getPrevisoesEntregaCDPortal().previsoes).length,0);
  assert.equal(a.estado.rows,null);
  const salvo=a.c.salvarPrevisaoEntregaCDPortal(payload());assert(salvo.success);assert.equal(salvo.previsao.versao,1);
  assert.equal(a.locks(),1);assert.equal(a.releases(),1);assert.equal(a.estado.rows.length,2);
  const b=portal(a.estado);assert.equal(b.c.getPrevisoesEntregaCDPortal().previsoes[chave()].dataColeta,'2026-10-27');
  assert.equal(b.c.getPrevisoesEntregaCDPortal().previsoes[chave()].dataEntrega,'2026-10-29');
});

test('versão esperada impede sobrescrever edição de outra pessoa e preserva chaves diferentes',()=>{
  const a=portal();a.c.salvarPrevisaoEntregaCDPortal(payload());
  a.c.salvarPrevisaoEntregaCDPortal(payload({chave:chave('SKU-002'),requestId:'request-002'}));
  assert.throws(()=>a.c.salvarPrevisaoEntregaCDPortal(payload({dataEntrega:'2026-10-30',requestId:'request-003'})),/outra pessoa/);
  assert.equal(a.estado.rows.length,3);assert.equal(a.locks(),3);assert.equal(a.releases(),3);
  const resultado=a.c.getPrevisoesEntregaCDPortal().previsoes;
  assert.equal(Object.keys(resultado).length,2);assert.equal(resultado[chave()].dataEntrega,'2026-10-29');
});

test('atualização e limpeza criam novas versões sem apagar histórico',()=>{
  const a=portal();a.c.salvarPrevisaoEntregaCDPortal(payload());
  a.c.salvarPrevisaoEntregaCDPortal(payload({dataEntrega:'2026-10-30',versaoEsperada:1,requestId:'request-002'}));
  const limpo=a.c.salvarPrevisaoEntregaCDPortal(payload({dataColeta:'',dataEntrega:'',observacao:'',versaoEsperada:2,requestId:'request-003'}));
  assert.equal(limpo.previsao.versao,3);assert.equal(limpo.previsao.dataColeta,'');assert.equal(limpo.previsao.dataEntrega,'');
  assert.equal(a.estado.rows.length,4);assert.equal(JSON.parse(a.estado.rows[1][8]).dataEntrega,'2026-10-29');
  assert.equal(portal(a.estado).c.getPrevisoesEntregaCDPortal().previsoes[chave()].versao,3);
});

test('mesma requisição é idempotente mesmo no dia seguinte; reuso diferente falha',()=>{
  const a=portal();const original=a.c.salvarPrevisaoEntregaCDPortal(payload());
  const b=portal(a.estado,{hoje:'2026-11-01'});const repetida=b.c.salvarPrevisaoEntregaCDPortal(payload());
  assert.equal(JSON.stringify(repetida),JSON.stringify(original));assert.equal(a.estado.rows.length,2);
  assert.throws(()=>b.c.salvarPrevisaoEntregaCDPortal(payload({observacao:'Outro texto'})),/já foi usado/);
  assert.throws(()=>b.c.salvarPrevisaoEntregaCDPortal(payload({chave:chave('OUTRO')})),/já foi usado/);
});

test('valida datas do calendário, passado São Paulo e ordem coleta-entrega',()=>{
  for(const campos of [{dataColeta:'2026-02-30'},{dataEntrega:'2026-11-31'},
    {dataColeta:'27/10/2026'},{dataEntrega:'2026-10-25'},
    {dataColeta:'2026-10-30',dataEntrega:'2026-10-29'}]){
    const a=portal();assert.throws(()=>a.c.salvarPrevisaoEntregaCDPortal(payload(campos)),/data válida|hoje|anterior/);
    assert.equal(a.estado.rows,null);
  }
  const a=portal();assert(a.c.salvarPrevisaoEntregaCDPortal(payload({dataColeta:'2026-10-26',dataEntrega:'2026-10-26'})).success);
});

test('permite somente uma previsão, apenas nota e sessão sem e-mail',()=>{
  for(const campos of [{dataColeta:'',dataEntrega:'2026-10-29'}, {dataColeta:'2026-10-27',dataEntrega:''},
    {dataColeta:'',dataEntrega:'',observacao:'Em negociação'}]) {
    const a=portal(undefined,{email:''});const r=a.c.salvarPrevisaoEntregaCDPortal(payload(campos));
    assert.equal(r.previsao.usuario,'Anônimo');
  }
  assert.throws(()=>portal().c.salvarPrevisaoEntregaCDPortal(payload({dataColeta:'',dataEntrega:'',observacao:''})),/Preencha/);
});

test('chave é canônica e preserva lotes, origem e CD sem volume ou índice físico',()=>{
  const a=portal();const raw=JSON.stringify(['ECD1','pcp',' cóc ',' Logprint ',' sku-001 ','cd  for','v1','','','']);
  assert.equal(a.c.salvarPrevisaoEntregaCDPortal(payload({chave:raw})).previsao.chave,chave());
  a.c.salvarPrevisaoEntregaCDPortal(payload({chave:chave('SKU-001',{op:'OP2'}),requestId:'request-002'}));
  assert.equal(Object.keys(a.c.getPrevisoesEntregaCDPortal().previsoes).length,2);
  for(const invalida of ['ECD1','[]',JSON.stringify(['ECD1','PCP','','G','SKU','CD','','','','']),
    JSON.stringify(['ECD1','PCP','M','G','','CD','','','','']), 'x'.repeat(2001)]) {
    assert.throws(()=>portal().c.salvarPrevisaoEntregaCDPortal(payload({chave:invalida})),/Chave|Informe/);
  }
});

test('observação é limitada, texto exibido não injeta fórmula e leitura mantém original',()=>{
  const a=portal();const texto='=HYPERLINK("https://example.com")';
  a.c.salvarPrevisaoEntregaCDPortal(payload({observacao:texto}));
  assert.equal(a.estado.rows[1][3],"'"+texto);assert.equal(a.estado.rows[1][8][0],'{');
  assert.equal(portal(a.estado).c.getPrevisoesEntregaCDPortal().previsoes[chave()].observacao,texto);
  assert.throws(()=>portal().c.salvarPrevisaoEntregaCDPortal(payload({observacao:'a'.repeat(501)})),/500/);
});

test('histórico corrompido e falha de lock não confirmam nem sobrescrevem dados',()=>{
  const a=portal();a.c.salvarPrevisaoEntregaCDPortal(payload());a.estado.rows[1][8]='{inválido';
  assert.throws(()=>a.c.getPrevisoesEntregaCDPortal(),/ilegível/);
  assert.throws(()=>a.c.salvarPrevisaoEntregaCDPortal(payload({versaoEsperada:1,requestId:'request-002'})),/ilegível/);
  assert.equal(a.estado.rows.length,2);assert.equal(a.locks(),2);assert.equal(a.releases(),2);
  const b=portal(undefined,{failLock:true});assert.throws(()=>b.c.salvarPrevisaoEntregaCDPortal(payload()),/Ocupado/);
  assert.equal(b.estado.rows,null);assert.equal(b.releases(),0);
});

test('exportação mantém duas abas ordenadas e ativa datas, números e validação do gerador existente',()=>{
  const a=portal();const spec={nome:'Entregas',abas:[
    {nome:'Quadro',cabecalho:['CD','Entregue'],linhas:[['CD FOR',100]],colunasNumero:[1]},
    {nome:'Base_SKUs',cabecalho:['SKU','Entrega TP'],linhas:[['001','2026-10-26']],colunasData:[1]}
  ]};
  assert(a.c.gerarPlanilhaEntregasCD(spec).success);
  assert.equal(a.exportado().auditoriaPortal,true);assert.equal(spec.auditoriaPortal,undefined);
  assert.equal(a.exportado().abas[0].nome,'Quadro');assert.equal(a.exportado().abas[1].nome,'Base_SKUs');
  assert.deepEqual(a.exportado().abas[1].colunasData,[1]);
  assert.throws(()=>a.c.gerarPlanilhaEntregasCD({abas:spec.abas.slice().reverse()}),/Quadro e Base_SKUs/);
});
