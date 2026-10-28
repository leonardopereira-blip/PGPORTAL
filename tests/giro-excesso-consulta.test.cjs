const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const origem=fs.readFileSync(path.join(__dirname,'giro-filtros-excedente-exportacao.test.cjs'),'utf8');
const harness=origem.slice(0,origem.indexOf('\ntest('))
  .replace('pos=false,temCampos=true','pos=false,concluido=false,temCampos=true')
  .replace("checked:id==='chkGiroAberto'||(id==='chkGiroPos'&&pos)",
    "checked:id==='chkGiroAberto'||(id==='chkGiroPos'&&pos)||(id==='chkGiroConcluido'&&concluido)");
const {executarGiro}=vm.runInNewContext(harness+'\n({executarGiro});',{require,__dirname});
test('consulta exibe Coletado a mais como situação concluída, sem pendência nem excedente no saldo',()=>{
  const r=executarGiro({concluido:true,retornarTela:true,
    estado:{ay:'COLETADO A MAIS',coletada:150,pendente:false,saldo:0},
    campos:{'TIRAGEM TOTAL':100,'TIRAGEM COLETADA':150}});
  assert.equal(r.linhas.length,1);
  assert.equal(r.linhas[0].status,'Coletado a mais');
  assert.equal(r.linhas[0].pendencia,'-');
  assert.equal(r.linhas[0].tiragem,0);
  assert.match(r.html,/Coletado a mais/);
  assert.match(r.html,/Excedente de 50 un./);
});
