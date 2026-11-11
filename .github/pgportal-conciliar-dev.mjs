// Conciliação segura: HEAD do Apps Script + alterações locais do GitHub.
// Não sobrescreve modificações externas concorrentes nem resolve conflitos no chute.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {initAuth} from '../node_modules/@google/clasp/build/src/auth/auth.js';
import {initClaspInstance} from '../node_modules/@google/clasp/build/src/core/clasp.js';

const basePath='.github/pgportal-base-google.json';
const hash=s=>createHash('sha256').update(String(s||'').replace(/\r\n/g,'\n')).digest('hex');
const key=f=>f.type+':'+f.remotePath;
const hashes=files=>Object.fromEntries(files.map(f=>[key(f),hash(f.source)]));
const equal=(a,b)=>isDeepStrictEqual(hashes(a),hashes(b));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const log=s=>{console.log(s);fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,s+'\n');};
let etapa='autenticação';
try {
  const {credentials}=await initAuth({});
  if(!credentials)throw Error('AUTH_MISSING');
  const clasp=await initClaspInstance({credentials});
  const {files:locais}=await clasp.files.collectLocalFiles();
  if(!locais.length)throw Error('FILES_MISSING');
  const base=JSON.parse(fs.readFileSync(basePath,'utf8'));
  if(base.scriptId!==clasp.options.project.scriptId)throw Error('BASE_TARGET_MISMATCH');
  etapa='leitura atual do Google';
  const remotos=await clasp.files.fetchRemote();
  const mapaLocal=new Map(locais.map(f=>[key(f),f]));
  const mapaRemoto=new Map(remotos.map(f=>[key(f),f]));
  const universo=new Set([...Object.keys(base.files),...mapaLocal.keys(),...mapaRemoto.keys()]);
  const externos=[],conflitos=[];
  for(const k of Array.from(universo).sort()) {
    const local=mapaLocal.get(k),remoto=mapaRemoto.get(k);
    const referencia=base.files[k]||null;
    const hLocal=local?hash(local.source):null;
    const hRemoto=remoto?hash(remoto.source):null;
    if(hLocal===hRemoto)continue;
    const mudouGit=hLocal!==referencia, mudouGoogle=hRemoto!==referencia;
    if(mudouGit&&mudouGoogle) {conflitos.push(k);continue;}
    if(mudouGoogle) {
      // Exclusões externas precisam de verificação humana, nunca apagar arquivos silenciosamente.
      if(!remoto){conflitos.push(k+' (exclusão externa)');continue;}
      externos.push(remoto);
    }
  }
  const integrados=[];
  if(conflitos.length) {
    // Conciliacao de tres vias SOMENTE para o arquivo das visoes e somente
    // se a base exata que foi lida do Google existir no historico Git.
    // Os demais conflitos seguem bloqueados: nunca sobrescrever no chute.
    const pendentes=[];
    for(const k of conflitos) {
      const local=mapaLocal.get(k),remoto=mapaRemoto.get(k);
      const registro=base.files[k];
      if(k!=='HTML:Scripts_Globais_2'||!local||!remoto||!registro) {
        pendentes.push(k);continue;
      }
      etapa='localizar base comprovada de Scripts_Globais_2';
      const arquivo=path.relative(path.resolve('.'),path.resolve(local.localPath));
      const objetos=git('rev-list','--objects','HEAD','--',arquivo).split('\n')
        .map(s=>s.split(' ')).filter(a=>a.length>=2&&a.slice(1).join(' ')===arquivo);
      let comum=null;
      for(const [oid] of objetos) {
        const src=execFileSync('git',['cat-file','-p',oid],{encoding:'utf8',maxBuffer:4*1024*1024});
        if(hash(src)===registro){comum=src;break;}
      }
      if(comum===null){
        console.error('Base de Scripts_Globais_2 nao encontrada no historico Git. Nenhuma sobreposicao foi permitida.');
        pendentes.push(k);continue;
      }
      const pasta=process.env.RUNNER_TEMP||'/tmp';
      const caminhoGoogle=path.join(pasta,'pgportal-conflito-google.html');
      const caminhoBase=path.join(pasta,'pgportal-conflito-base.html');
      const caminhoGit=path.join(pasta,'pgportal-conflito-git.html');
      fs.writeFileSync(caminhoGoogle,remoto.source,'utf8');
      fs.writeFileSync(caminhoBase,comum,'utf8');
      fs.writeFileSync(caminhoGit,local.source,'utf8');
      etapa='mescla sem conflitos de Scripts_Globais_2';
      const merge=spawnSync('git',['merge-file','-p','--diff3',caminhoGoogle,caminhoBase,caminhoGit],
        {encoding:'utf8',maxBuffer:5*1024*1024});
      if(merge.status!==0){
        console.error('Conflito real na mescla de Scripts_Globais_2; enviar foi bloqueado. Trecho: '+
          String(merge.stdout||merge.stderr||'').slice(0,3000));
        pendentes.push(k);continue;
      }
      const unido=String(merge.stdout);
      if(unido.includes('<<<<<<<')||unido.includes('>>>>>>>')) {
        pendentes.push(k);continue;
      }
      fs.writeFileSync(local.localPath,unido,'utf8');
      integrados.push(arquivo);
      console.log('Scripts_Globais_2 mesclado sem conflitos a partir da base Google verificada. Google SHA-256='+
        hash(remoto.source)+' GitHub SHA-256='+hash(local.source)+' Mescla SHA-256='+hash(unido));
    }
    if(pendentes.length) {
      console.error('Conflitos nao conciliados: '+pendentes.join(', '));
      throw Error('MERGE_CONFLICT');
    }
  }

  etapa='preservação das alterações externas no GitHub';
  const stage=[...integrados];
  for(const f of externos) {
    const destino=path.resolve(f.localPath);
    const raiz=path.resolve('.');
    if(destino===raiz||!destino.startsWith(raiz+path.sep))throw Error('INVALID_PATH');
    fs.mkdirSync(path.dirname(destino),{recursive:true});
    fs.writeFileSync(destino,f.source,'utf8');
    stage.push(path.relative(raiz,destino));
  }
  if(integrados.length) {
    etapa='testes direcionados apos mescla de Globais';
    const testes=spawnSync('node',['--test',
      'tests/report-executiva-coleta-manual-quadro.test.cjs',
      'tests/coleta-manual-pcp.test.cjs',
      'tests/entrega-manual-pcp.test.cjs',
      'tests/volumes-tp-cache-manual.test.cjs'],
      {encoding:'utf8',maxBuffer:8*1024*1024});
    if(testes.status!==0) {
      console.error('Testes direcionados falharam; Google nao alterado. '+
        String(testes.stdout||testes.stderr||'').slice(-6500));
      throw Error('TESTS_FAILED');
    }
    console.log('Testes de conciliação e Report passaram após mescla do Google e GitHub.');
  }
  const {files:mesclados}=await clasp.files.collectLocalFiles();
  if(mesclados.length!==new Set(mesclados.map(key)).size)throw Error('DUPLICATE_FILES');
  // A revalidação impede sobrepor uma edição feita no Google enquanto conciliávamos.
  etapa='conferência final antes do envio';
  const ultimoGoogle=await clasp.files.fetchRemote();
  if(!equal(remotos,ultimoGoogle))throw Error('GOOGLE_CHANGED_AGAIN');

  // Confirma que nosso checkout ainda é exatamente a main corrente.
  const remoteHead=git('ls-remote','origin','refs/heads/main').split(/\s+/)[0];
  if(remoteHead!==process.env.GITHUB_SHA)throw Error('GITHUB_CHANGED_AGAIN');

  etapa='envio do conjunto conciliado';
  await clasp.files.push();
  etapa='leitura e verificação do envio';
  const confirmados=await clasp.files.fetchRemote();
  const ok=mesclados.length===confirmados.length &&
    mesclados.every(f=>{
      const g=confirmados.find(v=>key(v)===key(f));
      return !!g && (f.type==='JSON'
        ? isDeepStrictEqual(JSON.parse(f.source),JSON.parse(g.source))
        : String(f.source).replace(/\r\n/g,'\n')===String(g.source).replace(/\r\n/g,'\n'));
    });
  if(!ok)throw Error('VERIFY_MISMATCH');

  // Base é sempre o HEAD RELIDO do Google, não hashes locais inventados.
  const baseAtual={scriptId:base.scriptId,lido_em:new Date().toISOString(),files:hashes(confirmados)};
  fs.writeFileSync(basePath,JSON.stringify(baseAtual,null,2)+'\n');
  stage.push(basePath);

  etapa='registro das alterações externas na main';
  git('config','user.name','github-actions[bot]');
  git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
  git('add','--',...stage);
  if(git('diff','--cached','--name-only')) {
    git('commit','-m','Conciliar alterações do Apps Script preservando trabalho de outros usuários');
    git('push','origin','HEAD:main');
  }
  log('Concluído: código mesclado enviado e relido no Apps Script DEV ('+confirmados.length+' arquivos). Arquivos externos preservados no GitHub: '+(externos.map(key).join(', ')||'nenhum')+'. Produção não alterada.');
}catch(e) {
  const mensagem=String(e?.message||e);
  const problemas={
    MERGE_CONFLICT:'Edições concorrentes nos mesmos arquivos. Nenhuma alteração foi enviada ao Google.',
    GOOGLE_CHANGED_AGAIN:'O Apps Script mudou durante a conciliação. Nenhum envio foi feito; repetir a leitura.',
    GITHUB_CHANGED_AGAIN:'A main recebeu commit concorrente. Nenhum envio foi feito.',
    VERIFY_MISMATCH:'O envio não pôde ser confirmado pela leitura posterior.',
    BASE_TARGET_MISMATCH:'Destino Apps Script não corresponde à base de proteção.',
    AUTH_MISSING:'Credencial ausente.'
  };
  const seguro=problemas[mensagem]||('Falha na etapa de '+etapa+'. Verifique o log protegido e a autorização.');
  console.error('::error::'+seguro);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'Envio DEV não confirmado. '+seguro+'\n');
  process.exitCode=1;
}
