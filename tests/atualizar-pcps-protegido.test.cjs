const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname,'..');
const source = fs.readFileSync(path.join(repo,'Atualizar_PCPs.gs'),'utf8');
const main = fs.readFileSync(path.join(repo,'Main.html'),'utf8');

function sheet(name, rows, sheetId) {
  const plan = {
    name, sheetId, rows: rows.map(row => row.slice()),writes:0,clears:0,
    getName(){return this.name;},
    getSheetId(){return this.sheetId;},
    getLastRow(){return this.rows.length;},
    getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));},
    getMaxRows(){return 20;},
    getMaxColumns(){return 20;},
    insertRowsAfter(){},
    insertColumnsAfter(){},
    clearContents(){this.clears++;this.rows=[];},
    getRange(startRow,startColumn,numRows,numColumns){
      return {
        getValues:()=>Array.from({length:numRows},(_,i)=>
          Array.from({length:numColumns},(_,j)=>
            this.rows[startRow+i-1]?.[startColumn+j-1]??'')),
        setValues:values=>{
          this.writes++;
          values.forEach((row,i)=>{this.rows[startRow+i-1]=row.slice();});
        }
      };
    }
  };
  return plan;
}

function portal({pcpOrigem=80,pcpDestino=100,acabOrigem=80,acabDestino=100,
  pcpTotalOrigem=100,pcpTotalDestino=100,erroCabecalho=false}={}) {
  const propriedades=new Map(), logs=[];
  const headers=['Chave','TIRAGEM COLETADA','TIRAGEM TOTAL'];
  const linhas=(coleta,total)=>[headers,['ID-A',coleta,total],['ID-B',coleta,total]];
  const sheets={
    PCP_PGBM:sheet('PCP_PGBM',linhas(pcpOrigem,pcpTotalOrigem),1),
    PCP:sheet('PCP',linhas(pcpDestino,pcpTotalDestino),2),
    ACABADORAS_PGBM:sheet('ACABADORAS_PGBM',linhas(acabOrigem,100),3),
    PCP_ACABADORAS:sheet('PCP_ACABADORAS',linhas(acabDestino,100),4)
  };
  if (erroCabecalho) sheets.PCP_PGBM.rows[0][1]='Coluna desconhecida';
  const lock={tryLock:()=>true,releaseLock(){}};
  const context=vm.createContext({
    LockService:{getDocumentLock:()=>lock},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:key=>propriedades.get(key),
      setProperty:(key,value)=>propriedades.set(key,value)
    })},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>sheets[name]||null}),flush(){}},
    Logger:{log:(...a)=>logs.push(a)}
  });
  vm.runInContext(source,context,{filename:'Atualizar_PCPs.gs'});
  vm.runInContext(
    'CONFIG_ATUALIZAR_PCPS.abas.forEach(a=>a.minLinhasDados=1);'+
    'CONFIG_ATUALIZAR_PCPS.tamanhoLote=2;',context
  );
  return {context,propriedades,logs,sheets};
}

test('automatico registra verificacao, mas nao escreve se a coleta cair',()=>{
  const app=portal({pcpOrigem:40,pcpDestino:50,acabOrigem:50,acabDestino:50});
  const resultado=app.context.atualizarPCPs();
  assert.equal(resultado.status,'Atualizado');
  assert.equal(resultado.atualizouBase,false);
  assert.equal(app.sheets.PCP.clears,0);
  assert.equal(app.sheets.PCP_ACABADORAS.clears,0);
  assert.equal(app.sheets.PCP.writes,0);
  assert.equal(app.propriedades.get('ATUALIZAR_PCPS_ULTIMO_STATUS_DEV'),'QUEDA_BLOQUEADA');
  assert(app.propriedades.get('ATUALIZAR_PCPS_ULTIMA_VERIFICACAO'));
});

test('queda em apenas uma origem bloqueia ambas as substituicoes',()=>{
  const app=portal({pcpOrigem:90,pcpDestino:50,acabOrigem:40,acabDestino:50});
  assert.equal(app.context.atualizarPCPs().atualizouBase,false);
  assert.equal(app.sheets.PCP.clears,0);
  assert.equal(app.sheets.PCP_ACABADORAS.clears,0);
});

test('automatico escreve ambas quando a coleta nao cai',()=>{
  const app=portal({pcpOrigem:90,pcpDestino:50,acabOrigem:70,acabDestino:50});
  const resultado=app.context.atualizarPCPs();
  assert.equal(resultado.atualizouBase,true);
  assert.equal(app.sheets.PCP.clears,1);
  assert.equal(app.sheets.PCP_ACABADORAS.clears,1);
  assert.equal(app.sheets.PCP.rows[1][1],90);
  assert.equal(app.propriedades.get('ATUALIZAR_PCPS_ULTIMO_STATUS_DEV'),
    'APLICADO_AUTOMATICAMENTE');
});

test('a reducao percentual com o mesmo volume coletado tambem bloqueia',()=>{
  const app=portal({pcpOrigem:50,pcpDestino:50,pcpTotalOrigem:120,
    pcpTotalDestino:100,acabOrigem:50,acabDestino:50});
  assert.equal(app.context.atualizarPCPs().atualizouBase,false);
  assert.equal(app.sheets.PCP.clears,0);
});

test('manual aceita queda, mas continua validando cabecalho',()=>{
  const app=portal({pcpOrigem:40,pcpDestino:50,acabOrigem:40,acabDestino:50});
  assert.equal(app.context.atualizarPCPsManual().atualizouBase,true);
  assert.equal(app.sheets.PCP.rows[1][1],40);
  assert.equal(app.propriedades.get('ATUALIZAR_PCPS_ULTIMO_STATUS_DEV'),
    'APLICADO_MANUALMENTE');
  const invalido=portal({erroCabecalho:true});
  assert.throws(()=>invalido.context.atualizarPCPsManual(),/cabecalho/i);
  assert.equal(invalido.sheets.PCP.clears,0);
});

test('aviso do portal nao empilha, e reaparece em blocos de duas horas',()=>{
  const inicio=main.indexOf('<!-- Aviso nao bloqueante:');
  assert(inicio>=0);
  const tag=main.indexOf('<script>',inicio);
  const fim=main.indexOf('</script>',tag);
  assert(tag>inicio&&fim>tag);
  const script=main.slice(tag+8,fim);
  let hora=0,recargas=0;
  const visibilidade=new Set(['hidden']);
  const elemento={classList:{
    add:key=>visibilidade.add(key),remove:key=>visibilidade.delete(key),
    contains:key=>visibilidade.has(key)
  }};
  const mensagem={textContent:''},eventos={};
  const window={
    setInterval:(callback,ms)=>{assert.equal(ms,60000);eventos.tick=callback;},
    addEventListener:(nome,callback)=>{eventos[nome]=callback;},
    location:{reload:()=>{recargas++;}}
  };
  const document={
    getElementById:id=>id==='pgAvisoPortalDesatualizado'?elemento:mensagem,
    addEventListener:(nome,callback)=>{eventos[nome]=callback;}
  };
  vm.runInNewContext(script,{window,document,Date:{now:()=>hora*3600000}});
  eventos.DOMContentLoaded();
  assert(visibilidade.has('hidden'));
  hora=2;eventos.tick();
  assert(!visibilidade.has('hidden'));
  assert.match(mensagem.textContent,/há 2 horas/);
  window.pgIgnorarAvisoPortal();
  hora=3;eventos.tick();
  assert(visibilidade.has('hidden'));
  hora=4;eventos.focus();
  assert(!visibilidade.has('hidden'));
  assert.match(mensagem.textContent,/há 4 horas/);
  hora=5;eventos.tick();
  assert.match(mensagem.textContent,/há 5 horas/);
  window.pgAtualizarPortalTudo();
  assert.equal(recargas,1);
});
