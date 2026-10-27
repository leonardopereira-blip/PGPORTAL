// Publicacao expressa do /exec, sem push e sem criar nova implantacao.
// Compara GitHub + base da ultima leitura confirmada + HEAD vivo do Google.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {initAuth} from '../node_modules/@google/clasp/build/src/auth/auth.js';
import {initClaspInstance} from '../node_modules/@google/clasp/build/src/core/clasp.js';

const resumo = frase => {
  console.log(frase);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, frase+'\n');
};
const hash = conteudo => createHash('sha256')
  .update(String(conteudo||'').replace(/\r\n/g,'\n')).digest('hex');
const mapa = arquivos => Object.fromEntries(
  arquivos.map(f => [f.type+':'+f.remotePath, hash(f.source)]));
const mesmoMapa = (a,b) => {
  const x=Object.keys(a).sort(), y=Object.keys(b).sort();
  return x.length===y.length && x.every((chave,i)=>chave===y[i]&&a[chave]===b[chave]);
};
const pedido=JSON.parse(fs.readFileSync('PUBLICAR_EXEC.json','utf8'));
const config=JSON.parse(fs.readFileSync('.clasp.json','utf8'));
const base=JSON.parse(fs.readFileSync('.github/pgportal-base-google.json','utf8'));
if (!pedido.autorizado || !/^[A-Za-z0-9_-]{6}$/.test(pedido.deployment_sufixo) ||
    !Number.isInteger(pedido.versao_ativa_esperada) || !pedido.descricao_ativa_esperada)
  throw Error('Pedido de publicacao /exec invalido.');
if (base.scriptId!==config.scriptId)throw Error('Projeto diverge da base Google confirmada.');
if (!/^[0-9a-f]{40}$/.test(pedido.commit_validado))
  throw Error('SHA do commit validado invalido.');
try {execFileSync('git',['merge-base','--is-ancestor',pedido.commit_validado,'HEAD']);}
catch {throw Error('Commit solicitado nao e ancestral da main.');}
const headMain=execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0];
if (headMain!==process.env.GITHUB_SHA)throw Error('Main alterada durante a publicacao; interrompido.');
const {credentials}=await initAuth({});
if (!credentials)throw Error('Autenticacao indisponivel.');
const clasp=await initClaspInstance({credentials});
if (clasp.options.project.scriptId!==base.scriptId)
  throw Error('Projeto autenticado nao corresponde ao pedido.');
const conferir=async ()=>{
  const local=mapa((await clasp.files.collectLocalFiles()).files);
  const google=mapa(await clasp.files.fetchRemote());
  if (!mesmoMapa(base.files,local)||!mesmoMapa(base.files,google))
    throw Error('Conflito: GitHub ou HEAD Google mudou. Nada sera publicado.');
};
await conferir();
const antes=await clasp.project.listDeployments();
const candidatos=(antes.results||[]).filter(d=>
  d.deploymentConfig?.versionNumber===pedido.versao_ativa_esperada &&
  d.deploymentConfig?.description===pedido.descricao_ativa_esperada &&
  String(d.deploymentId||'').endsWith(pedido.deployment_sufixo) &&
  (d.entryPoints||[]).some(e=>e.entryPointType==='WEB_APP'));
if(candidatos.length!==1) {
  for (const d of (antes.results||[]).filter(d=>String(d.deploymentId||'').endsWith(pedido.deployment_sufixo))) {
    resumo('Implantacao observada: '+JSON.stringify({sufixo:pedido.deployment_sufixo,versao:d.deploymentConfig?.versionNumber,descricao:d.deploymentConfig?.description,tipos:(d.entryPoints||[]).map(e=>e.entryPointType)}));
  }
  throw Error('Nenhuma implantacao WEB_APP unica corresponde a versao, descricao e sufixo informados.');
}
const existente=candidatos[0];
const versaoAnterior=existente.deploymentConfig?.versionNumber;
const descricao='PGPORTAL filtros por serie e planejado D-1 · commit '+pedido.commit_validado.slice(0,7);
const novaVersao=await clasp.project.version(descricao);
await conferir(); // Alteracao concorrente apos criar a versao bloqueia o redeploy.
const resultado=await clasp.project.deploy(descricao,existente.deploymentId,novaVersao);
if(resultado.deploymentId!==existente.deploymentId ||
   resultado.deploymentConfig?.versionNumber!==novaVersao)
  throw Error('API nao confirmou a versao e o destino esperado.');
const depois=await clasp.project.listDeployments();
const ativo=(depois.results||[]).find(d=>d.deploymentId===existente.deploymentId);
if(ativo?.deploymentConfig?.versionNumber!==novaVersao)
  throw Error('Implantacao atualizada, mas releitura da versao nao confirmou.');
resumo('Publicado em /exec: versao '+novaVersao+' (anterior '+versaoAnterior+').');
resumo('Implantacao existente preservada. Sem alterar outras implantacoes. Commit '+pedido.commit_validado+'.');
