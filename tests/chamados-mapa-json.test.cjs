const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({pgChTexto_:v=>String(v==null?'':v).trim()});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','ChamadosPortal.js'),'utf8'),ctx);
const validate=ctx.pgChMapaValido_;
const rows=(n)=>Array.from({length:n},(_,i)=>({map:'MP-'+i,row:i+2,sku:'SKU-'+i}));
test('grade maior que dados não impede a publicação; linhas vazias não contam',()=>{
  const a=rows(100);assert.equal(validate([...a,{row:102}],a,100).length,100);
});
test('primeira carga protege contra mapa vazio ou muito abaixo da referência real',()=>{
  assert.throws(()=>validate(rows(1000),rows(1000),null),/mínimo de segurança/);
  const a=rows(16923);assert.equal(validate(a,a,null).length,16923);
});
test('reposição parcial e mudança de conteúdo com contagem igual bloqueiam a publicação',()=>{
  assert.throws(()=>validate(rows(100),rows(80),100),/mínimo de segurança/);
  const a=rows(100),b=rows(100);b[30].sku='OUTRO';assert.throws(()=>validate(a,b,100),/mudou durante a leitura/);
});
