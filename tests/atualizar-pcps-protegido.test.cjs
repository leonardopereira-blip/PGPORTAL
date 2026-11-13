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


function avisoPortalTeste() {
  const inicio=main.indexOf('<!-- Aviso nao bloqueante:');
  assert(inicio>=0);
  const tag=main.indexOf('<script>',inicio);
  const fim=main.indexOf('</script>',tag);
  assert(tag>inicio&&fim>tag);
  const script=main.slice(tag+8,fim);
  let hora=0,recargas=0,chamadas=0;
  const visibilidade=new Set(['hidden']),loadingVisivel=new Set();
  const classe=colecao=>({
    add:key=>colecao.add(key),remove:key=>colecao.delete(key),
    contains:key=>colecao.has(key)
  });
  const aviso={classList:classe(visibilidade)};
  const loading={classList:classe(loadingVisivel)};
  const botao={disabled:false,textContent:'Atualizar tudo'};
  const mensagem={textContent:''},eventos={};
  const window={
    PG_PERFORMANCE:{inicialCompletoMs:2},
    setInterval:(callback,ms)=>{assert.equal(ms,60000);eventos.tick=callback;},
    addEventListener:(nome,callback)=>{eventos[nome]=callback;},
    location:{reload:()=>{recargas++;}},
    pgRecarregarDadosPortal:async()=>{
      chamadas++;
      window.PG_PERFORMANCE={fontesMs:{},inicialCompletoMs:75};
    }
  };
  const document={
    getElementById:id=>id==='pgAvisoPortalDesatualizado'?aviso:
      id==='pgAvisoPortalTempo'?mensagem:
      id==='pgAvisoPortalBotaoAtualizar'?botao:
      id==='globalLoading'?loading:null,
    addEventListener:(nome,callback)=>{eventos[nome]=callback;}
  };
  vm.runInNewContext(script,{window,document,Date:{now:()=>hora*3600000},
    console:{error(){}},Promise});
  eventos.DOMContentLoaded();
  return {window,eventos,visibilidade,loadingVisivel,botao,mensagem,
    setHora:h=>{hora=h;},getRecargas:()=>recargas,getChamadas:()=>chamadas,
    incrementarChamadas:()=>{chamadas++;}};
}

test('aviso do portal nao empilha e se renova a cada duas horas sem navegar',async()=>{
  assert.match(main,/window\.pgRecarregarDadosPortal\s*=\s*carregarSistema/);
  const app=avisoPortalTeste();
  assert(app.visibilidade.has('hidden'));
  app.setHora(2);app.eventos.tick();
  assert(!app.visibilidade.has('hidden'));
  assert.match(app.mensagem.textContent,/há 2 horas/);
  app.window.pgIgnorarAvisoPortal();
  app.setHora(3);app.eventos.tick();
  assert(app.visibilidade.has('hidden'));
  app.setHora(4);app.eventos.focus();
  assert(!app.visibilidade.has('hidden'));
  app.setHora(5);app.eventos.tick();
  assert.match(app.mensagem.textContent,/há 5 horas/);
  assert.equal(await app.window.pgAtualizarPortalTudo(),true);
  assert.equal(app.getChamadas(),1);
  assert.equal(app.getRecargas(),0,'não recarregar iframe Apps Script');
  assert(app.visibilidade.has('hidden'));
  assert.equal(app.botao.disabled,false);
  assert.equal(app.botao.textContent,'Atualizar tudo');
  app.setHora(6);app.eventos.tick();
  assert(app.visibilidade.has('hidden'),'aviso não reaparece uma hora após refresh');
  app.setHora(7);app.eventos.focus();
  assert(!app.visibilidade.has('hidden'),'aviso volta duas horas após refresh');
  assert.match(app.mensagem.textContent,/há 2 horas/);
});

test('falha de atualização não deixa portal branco, bloqueado ou escondido',async()=>{
  const app=avisoPortalTeste();
  app.setHora(2);app.eventos.tick();
  const anterior=app.window.PG_PERFORMANCE;
  app.window.pgRecarregarDadosPortal=async()=>{
    app.incrementarChamadas();
    app.window.PG_PERFORMANCE={fontesMs:{}};
    // Simula carregador original, que absorve a exceção e retorna sem sucesso.
  };
  assert.equal(await app.window.pgAtualizarPortalTudo(),false);
  assert.notEqual(app.window.PG_PERFORMANCE,anterior);
  assert.equal(app.getRecargas(),0);
  assert(app.loadingVisivel.has('hidden'),'sobreposição de carregamento removida');
  assert(!app.visibilidade.has('hidden'),'aviso oferece nova tentativa');
  assert.match(app.mensagem.textContent,/A tela continua disponível/);
  assert.equal(app.botao.disabled,false,'botão liberado para retry');
  app.window.pgRecarregarDadosPortal=async()=>{
    app.incrementarChamadas();
    app.window.PG_PERFORMANCE={fontesMs:{},inicialCompletoMs:99};
  };
  assert.equal(await app.window.pgAtualizarPortalTudo(),true);
  assert(app.visibilidade.has('hidden'));
  assert.equal(app.getChamadas(),2);
});

test('clique duplo em Atualizar tudo não dispara duas leituras em paralelo',async()=>{
  const app=avisoPortalTeste();
  let liberar;
  const pendente=new Promise(resolve=>{liberar=resolve;});
  app.window.pgRecarregarDadosPortal=async()=>{
    app.incrementarChamadas();
    await pendente;
    app.window.PG_PERFORMANCE={fontesMs:{},inicialCompletoMs:70};
  };
  app.setHora(2);app.eventos.tick();
  const primeira=app.window.pgAtualizarPortalTudo();
  assert.equal(app.botao.disabled,true);
  assert.equal(app.botao.textContent,'Atualizando...');
  assert.equal(await app.window.pgAtualizarPortalTudo(),false);
  assert.equal(app.getChamadas(),1);
  liberar();
  assert.equal(await primeira,true);
  assert.equal(app.botao.disabled,false);
  assert.equal(app.getRecargas(),0);
});

test('carregador que retorna sem gerar nova performance não conta como atualização',async()=>{
  const app=avisoPortalTeste();
  app.setHora(2);app.eventos.tick();
  app.window.pgRecarregarDadosPortal=async()=>{app.incrementarChamadas();};
  assert.equal(await app.window.pgAtualizarPortalTudo(),false);
  assert(!app.visibilidade.has('hidden'));
  assert(app.loadingVisivel.has('hidden'));
});
