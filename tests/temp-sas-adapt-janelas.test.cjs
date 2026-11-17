const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'TempSasAdapt.js'), 'utf8');
const contexto = vm.createContext({ Date });
vm.runInContext(source, contexto);


const header=['Pedido','Cod Kit','Descricao Kit','Série','Segmento','Componente','Descrição componente','Sub-componente','Descrição','LA X LP','Qtde','SISTEMA','Manuseio','LOCAL MANUSEIO','CAIXA KIT','CÓDIGO CAIXA DE CONTENÇÃO','DESCRIÇÃO CAIXA DE CONTENÇÃO','FATOR CAIXA DE CONTENÇÃO','LOTE','ENVIO','OBSERVAÇÃO','INSTRUÇÕES','CD'];
const linha=(p,k,s,q,d='Jundiaí - SP')=>{const a=Array(23).fill('');a[0]=p;a[1]=k;a[5]=s;a[10]=q;a[22]=d;return a;};
const janela=(id,rows,titulo='Janela '+id)=>({id,titulo,valores:[header.slice(),...rows]});
const mapa=(kit,sku,coletado,rest={})=>({kit,sku,coletado,destino:'CD JDI',codigoMapa:'MP1',linhaMapa:2,...rest});
const calcular=(janelas,saidas=[])=>contexto.pgTempSasAdaptEntregasJanelas_(janelas,saidas);
const resumo=rs=>Array.from(rs,r=>[r.titulo,r.total,r.entregue,r.aConferir,r.saldo]);

test('soma coluna K por linha, não por pedido nem por kit finalizado',()=>{
  const [r]=calcular([janela('1',[linha('A','K','S',100),linha('A','K','T',100),linha('A','K','S',40)])],[mapa('K','S',120)]);
  assert.deepEqual([r.total,r.entregue,r.saldo,r.aConferir],[240,120,120,0]);
});
test('classifica as sete abas físicas em três janelas, com 13/10 em duas abas distintas',()=>{
  const ids=['0','676724057','1073453236','1744242808','1214924467','1546857491','1758854262'];
  const titles=['Janela_1 - 25-08','Janela_1 - 29-09','Janela_1 - 13-10 ','Janela-1 - 15-10','Janela_1 - 29-10','Janela_2 - 13-10 ','Janela_3 - 28-10'];
  const r=calcular(ids.map((id,i)=>janela(id,[linha('P'+i,'KIT'+i,'SKU',10*(i+1))],titles[i])));
  assert.deepEqual(resumo(r),[['Janela 1',100,0,0,100],['Janela 2',110,0,0,110],['Janela 3',70,0,0,70]]);
  assert.deepEqual(Array.from(r[0].fonteIds),ids.slice(0,4));
  assert.deepEqual(Array.from(r[1].fonteIds),ids.slice(4,6));
});
test('mesma chave em pedidos e abas da mesma janela não zera coleta',()=>{
  const [r]=calcular([janela('0',[linha('A','K','S',100),linha('B','K','S',50)],'Janela_1 - 25-08'),janela('676724057',[linha('C','K','S',20)],'Janela_1 - 29-09')],[mapa('K','S',90),mapa('K','S',95),mapa('K','S',20,{codigoMapa:'MP2'})]);
  assert.deepEqual([r.total,r.entregue,r.saldo,r.aConferir],[170,115,55,0]);
});
test('confirma mínimo comprovável em janela compartilhada e conserva saldo potencial',()=>{
  const js=[janela('1',[linha('A','K','S',100)]),janela('2',[linha('B','K','S',40)])];
  assert.deepEqual(resumo(calcular(js,[mapa('K','S',110)])),[['Janela 1',100,70,30,30],['Janela 2',40,10,30,30]]);
  assert.deepEqual(resumo(calcular(js,[mapa('K','S',150)])),[['Janela 1',100,100,0,0],['Janela 2',40,40,0,0]]);
  assert.deepEqual(resumo(calcular(js)),[['Janela 1',100,0,0,100],['Janela 2',40,0,0,40]]);
});
test('não compensa SKU, kit ou CD; excedente não ultrapassa tiragem',()=>{
  const [r]=calcular([janela('1',[linha('A','K','S',100),linha('A','K','T',50)])],[mapa('K','S',150),mapa('K','T',50,{destino:'CD FOR'}),mapa('K2','T',50),mapa('K','T',-10)]);
  assert.deepEqual([r.total,r.entregue,r.saldo,r.aConferir],[150,100,50,0]);
});
test('sem mapa usa linha física para deduplicar a parcela',()=>{
  const [r]=calcular([janela('1',[linha('A','K','S',100)])],[mapa('K','S',12,{codigoMapa:'',linhaMapa:30}),mapa('K','S',15,{codigoMapa:'',linhaMapa:30}),mapa('K','S',7,{codigoMapa:'',linhaMapa:31})]);
  assert.equal(r.entregue,22);
});
test('valida coluna K e referências sem alterar dados da fonte',()=>{
  const j=janela('1',[[],linha('A','K','S',10),[]]);
  const saidas=[mapa('K','S',5)];
  const antes=JSON.stringify({j,saidas});assert.equal(calcular([j],saidas)[0].entregue,5);
  assert.equal(JSON.stringify({j,saidas}),antes);
  j.valores[0][10]='Outro';assert.throws(()=>calcular([j]),/Coluna K/);
});

test('leitor mantém sheetId, títulos com espaço final e linhas físicas em intervalos limitados', () => {
  const requests = [];
  const titulos = ['Janela_1 - 13-10 ', "Janela_2 - d'água "];
  const ids = [1073453236, 1546857491];
  const values = [[header.slice(), [], linha('P-3', 'KIT-1', 'SKU-A', 10)],
    [header.slice(), linha('P-2', 'KIT-2', 'SKU-B', 20)]];
  const api = vm.createContext({ Date, Sheets: { Spreadsheets: {
    get(id, options) {
      requests.push({ type: 'metadata', id, options });
      return { sheets: titulos.map((title, i) => ({ properties: { sheetId: ids[i], title,
        gridProperties: { rowCount: i ? 9 : 7, columnCount: 26 } } })) };
    },
    Values: { batchGet(id, options) {
      requests.push({ type: 'values', id, options });
      assert.deepEqual(Array.from(options.ranges), ["'Janela_1 - 13-10 '!A1:Y7", "'Janela_2 - d''água '!A1:Y9"]);
      return { valueRanges: values.map((rows, i) => ({ range: options.ranges[i], values: rows })) };
    } }
  } } });
  vm.runInContext(source, api);
  const rs = api.pgTempSasAdaptLerJanelas_();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].type, 'metadata');
  assert.equal(requests[1].type, 'values');
  assert.equal(requests[0].id, '1vBqSFyKqv8Ttco5LkfQm4SBLOU2EX7FWkOw3maBndIQ');
  assert.equal(requests[1].id, requests[0].id);
  assert.deepEqual(Array.from(rs, r => String(r.id)), ids.map(String));
  assert.deepEqual(Array.from(rs, r => r.titulo), titulos);
  assert.equal(rs[0].valores.length, 3);
  assert.equal(rs[0].valores[1].length, 0, 'linha física vazia permanece no índice original');
  assert.equal(rs[0].valores[2][0], 'P-3');
});


test('conciliação por janela e CD mantém tiragem K, volumes reais e notas sem duplicar',()=>{
 const js=[janela('1',[linha('P','K','S',100),linha('P','K','T',50)]),janela('2',[linha('Q','K','S',40)])];
 const ms=[mapa('K','S',110,{tiragem:110,dataColeta:'2026-10-15',dataEntrega:'2026-10-16',nfVenda:'123'}),mapa('K','T',60,{destino:'CD FOR',tiragem:60,dataColeta:'2026-10-15',codigoMapa:'MP2'})];
 const r=contexto.pgTempSasAdaptConciliarJanelas_(js,ms,{});
 assert.equal(r.tiragemJanelas,190);assert.equal(r.coletadoAthos,110);assert.equal(r.entregueAthos,110);
 assert.equal(r.entregasPorJanela[0].coletado,70);assert.equal(r.entregasPorJanela[1].coletado,10);
 assert.equal(r.expedicoesAthos.find(x=>x.destino==='CD JDI').coletaSemJanela,30);
 assert.equal(r.expedicoesAthos.find(x=>x.destino==='CD FOR').coletaFora,60);
 assert.equal(r.athosPorSku.find(x=>x.janela==='A conferir').nfs,'123');
 assert.equal(r.athosPorSku.filter(x=>x.total>0).reduce((s,x)=>s+x.total,0),190);
});
