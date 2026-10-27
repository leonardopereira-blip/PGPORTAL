const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','ExportadorExcel.html'),'utf8');
function exportador(){
  const window={},ctx=vm.createContext({window,Blob,TextEncoder,console});
  vm.runInContext(source.replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,''),ctx);
  return window;
}
async function unzip(blob){
  const bytes=Buffer.from(await blob.arrayBuffer()),files=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0,'ZIP preserva o método sem compressão do gerador');
    const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extra;
    files.set(name,bytes.subarray(start,start+size).toString('utf8'));offset=start+size;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50,'diretório central ZIP presente');
  assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50,'fim do ZIP presente');
  return files;
}
test('XLSX de três abas preserva ordem, datas, números, percentuais e congelamento até Entregue',async()=>{
  const w=exportador(),abas=[
    {nome:'Quadro_Marca_CD',cabecalho:['Marca','CD','Plano','Backlog','Entregue','% entregue','2026-10-27'],
      linhas:[['COC','CD FOR',24910000,0,22120080,0.888,100]],colunasNumero:[2,3,4,5,6],colunasPercentual:[5],colunasCongeladas:5},
    {nome:'Quadro_Marca_Serie_CD',cabecalho:['Marca','Série','CD','Plano','Backlog','Entregue','% entregue'],
      linhas:[['COC','1º ANO','CD FOR',100,0,50,0.5]],colunasNumero:[3,4,5,6],colunasPercentual:[6],colunasCongeladas:6},
    {nome:'Base_SKUs',cabecalho:['SKU','Data TP','Quantidade','Nota'],
      linhas:[['001','2026-10-27',250,'=HYPERLINK("https://example.com")'],['+SKU&<2>','',0,'_x000D_']],
      colunasData:[1],colunasNumero:[2]}
  ];
  const blob=w.pgGerarExcelAbas(abas);assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files=await unzip(blob),book=files.get('xl/workbook.xml');
  assert.deepEqual([...book.matchAll(/<sheet name="([^"]+)"/g)].map(m=>m[1]),abas.map(a=>a.nome));
  assert.match(book,/<bookViews><workbookView\/><\/bookViews>/);
  const rels=files.get('xl/_rels/workbook.xml.rels');
  for(let n=1;n<=3;n++)assert(rels.includes(`Id="rId${n}"`)&&rels.includes(`Target="worksheets/sheet${n}.xml"`));
  assert.match(rels,/Id="rId4"[^>]+Target="styles\.xml"/);
  const types=files.get('[Content_Types].xml');
  for(let n=1;n<=3;n++)assert(types.includes(`/xl/worksheets/sheet${n}.xml`));
  const sheet1=files.get('xl/worksheets/sheet1.xml'),sheet2=files.get('xl/worksheets/sheet2.xml'),base=files.get('xl/worksheets/sheet3.xml');
  assert.match(sheet1,/<pane xSplit="5" ySplit="1" topLeftCell="F2" activePane="bottomRight" state="frozen"\/>/);
  assert.match(sheet2,/<pane xSplit="6" ySplit="1" topLeftCell="G2" activePane="bottomRight" state="frozen"\/>/);
  assert.match(base,/<pane xSplit="2" ySplit="1" topLeftCell="C2"/);
  assert.match(sheet1,/<c r="C2" s="4"><v>24910000<\/v><\/c>/);
  assert.match(sheet1,/<c r="F2" s="7"><v>0\.888<\/v><\/c>/,'percentual tem prioridade sobre colunasNumero');
  assert.match(sheet2,/<c r="G2" s="7"><v>0\.5<\/v><\/c>/);
  const serial=Date.UTC(2026,9,27)/86400000+25569;
  assert(base.includes(`<c r="B2" s="3"><v>${serial}</v></c>`));
  assert.match(base,/<c r="C2" s="4"><v>250<\/v><\/c>/);
  assert.match(base,/<c r="A2" s="2" t="inlineStr"><is><t xml:space="preserve">001<\/t>/);
  assert(base.includes('=HYPERLINK(&quot;https://example.com&quot;)'));assert(!base.includes('<f>'));
  assert(base.includes('+SKU&amp;&lt;2&gt;'));assert(base.includes('_x005F_x000D_'));
  const styles=files.get('xl/styles.xml');assert.match(styles,/<numFmt numFmtId="168" formatCode="0\.0%"\/>/);
  assert.match(styles,/<cellXfs count="8">/);assert.match(styles,/<numFmt numFmtId="166" formatCode="0%"\/>/);
});
test('exportações legadas mantêm seus estilos e congelamento padrão',async()=>{
  const w=exportador(),base={nome:'Legado',cabecalho:['SKU','Aderência Realizado / Planejado','Tiragem total'],linhas:[['=SKU',0.888,100]]};
  const files=await unzip(w.pgGerarExcelAbas([base])),sheet=files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/<pane xSplit="2" ySplit="1" topLeftCell="C2"/);
  assert.match(sheet,/<c r="B2" s="5"><v>0\.888<\/v><\/c>/);
  assert.match(sheet,/<c r="C2" s="4"><v>100<\/v><\/c>/);
  const single=await unzip(w.pgGerarExcelAuditoria(base));
  assert.match(single.get('xl/worksheets/sheet1.xml'),/<c r="B2" s="5"><v>0\.888<\/v><\/c>/);
});
test('congelamento explícito zero congela apenas o cabeçalho e valida estrutura',async()=>{
  const w=exportador(),files=await unzip(w.pgGerarExcelAbas([{nome:'Livre',cabecalho:['SKU'],linhas:[['001']],colunasCongeladas:0}]));
  assert.match(files.get('xl/worksheets/sheet1.xml'),/<pane xSplit="0" ySplit="1" topLeftCell="A2" activePane="bottomLeft"/);
  assert.throws(()=>w.pgGerarExcelAbas([]),/Nenhuma aba/);
  assert.throws(()=>w.pgGerarExcelAbas([{nome:'Inválida',cabecalho:[],linhas:[]}]),/inválida/);
});
