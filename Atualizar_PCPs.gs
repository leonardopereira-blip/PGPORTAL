/**
 * ATUALIZADOR DE PCPs — rotina independente no projeto PGPORTAL, apontando diretamente para a planilha PCPs.
 *
 * PCP_PGBM         -> PCP
 * ACABADORAS_PGBM  -> PCP_ACABADORAS
 *
 * SEGURANCA:
 * 1. Valida chaves, volume e percentual coletado de ambas as origens.
 * 2. O gatilho atualizarPCPs so substitui as bases quando nenhuma coleta diminui.
 * 3. atualizarPCPsManual permite aplicar ajustes intencionais, com validacao basica.
 * 4. A checagem bloqueada fica no log/propriedades DEV; o fluxo normal retorna Atualizado.
 * 5. Mantem nomes, IDs das abas e formatacao. Nao recria as abas.
 *
 * O fluxo GitHub -> main publica no /dev; nao modifica a implantacao de producao.
 */

const CONFIG_ATUALIZAR_PCPS = {
  planilhaId: '1M0NOlNfABSI7BByc7fG8VEF6xDG9Joh5FVJa8IwOO1c',
  // Piso de seguranca para a primeira execucao. Ajuste se a base encolher legitimamente.
  // No arquivo de referencia: PCP_PGBM ~7,8 mil linhas; ACABADORAS_PGBM ~1 mil.
  abas: [
    {
      origem: 'PCP_PGBM',
      destino: 'PCP',
      minLinhasDados: 6000
    },
    {
      origem: 'ACABADORAS_PGBM',
      destino: 'PCP_ACABADORAS',
      minLinhasDados: 700
    }
  ],
  // Apos uma execucao bem-sucedida, rejeita quedas superiores a 15% no
  // numero de linhas com dados da origem. Evita copiar carga parcial.
  percentualMinimoDaUltimaAtualizacao: 0.85,
  tamanhoLote: 500,
  esperaBloqueioMs: 30000
};

/** Mantem o nome do gatilho existente: a rotina automatica nunca aceita queda de coleta. */
function atualizarPCPs() {
  return executarAtualizacaoPCPs_(false);
}

/** Execute MANUALMENTE quando a reducao de coleta for uma correcao intencional. */
function atualizarPCPsManual() {
  return executarAtualizacaoPCPs_(true);
}

/** Alias explicito para quem configurar gatilhos novos. */
function atualizarPCPsAutomatico() {
  return atualizarPCPs();
}

function executarAtualizacaoPCPs_(manual) {
  const bloqueio = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!bloqueio.tryLock(CONFIG_ATUALIZAR_PCPS.esperaBloqueioMs)) {
    throw new Error('Atualizacao cancelada: ja existe outra execucao em andamento.');
  }

  const propriedades = PropertiesService.getScriptProperties();
  const prefixo = 'ATUALIZAR_PCPS_';
  const verificadoEm = new Date().toISOString();
  let iniciouEscrita = false;
  try {
    // "Atualizado" para o fluxo habitual; diagnostico de protecao fica so no DEV.
    propriedades.setProperty(prefixo + 'ULTIMA_VERIFICACAO', verificadoEm);
    const ss = SpreadsheetApp.openById(CONFIG_ATUALIZAR_PCPS.planilhaId);
    SpreadsheetApp.flush();

    // Nunca altera uma aba antes de ler e validar as DUAS bases.
    const pacotes = CONFIG_ATUALIZAR_PCPS.abas.map(cfg =>
      prepararEValidarOrigem_(ss, propriedades, cfg, manual)
    );
    const comparacoes = pacotes.map(p => {
      const origem = resumoColetasPCPs_(p.valores, p.origem);
      const destino = resumoColetasPCPsDestino_(p.destino, p.origem);
      return {aba:p.origem,origem:origem,destino:destino};
    });
    const quedas = comparacoes.filter(c =>
      c.destino.total>0 &&
      (c.origem.coletado<c.destino.coletado ||
       c.origem.percentual + 1e-9<c.destino.percentual)
    );

    if (quedas.length && !manual) {
      // A tentativa automatica foi verificada, mas as bases continuam intactas.
      // Sem popup, mensagem ou erro para o usuario final.
      propriedades.setProperty(prefixo + 'ULTIMO_STATUS_DEV', 'QUEDA_BLOQUEADA');
      propriedades.setProperty(prefixo + 'ULTIMO_DIAGNOSTICO_DEV',
        JSON.stringify({verificadoEm:verificadoEm,comparacoes:comparacoes}));
      Logger.log('[DEV] Atualizacao automatica conferida e protegida: %s. Bases anteriores mantidas.',
        JSON.stringify(quedas));
      return {status:'Atualizado',atualizouBase:false};
    }

    // Modo manual ignora SOMENTE a queda de coletas; as validacoes basicas
    // de origem, cabecalho e volume continuam obrigatorias.
    pacotes.forEach(p => ajustarTamanhoDestino_(p.destino, p.linhas, p.colunas));
    for (const p of pacotes) {
      iniciouEscrita = true;
      p.destino.clearContents();
      for (let inicio = 0; inicio < p.linhas; inicio += CONFIG_ATUALIZAR_PCPS.tamanhoLote) {
        const lote = p.valores.slice(inicio, inicio + CONFIG_ATUALIZAR_PCPS.tamanhoLote);
        p.destino.getRange(inicio + 1, 1, lote.length, p.colunas).setValues(lote);
      }
      Logger.log('%s atualizada: %s linhas x %s colunas.',p.destino.getName(),p.linhas,p.colunas);
    }
    SpreadsheetApp.flush();
    pacotes.forEach(p =>
      propriedades.setProperty(chaveVolume_(p.origem),String(p.linhasComDados))
    );
    propriedades.setProperty(prefixo + 'ULTIMO_STATUS_DEV',manual?
      'APLICADO_MANUALMENTE':'APLICADO_AUTOMATICAMENTE');
    propriedades.setProperty(prefixo + 'ULTIMA_APLICACAO',new Date().toISOString());
    propriedades.setProperty(prefixo + 'ULTIMO_DIAGNOSTICO_DEV',
      JSON.stringify({verificadoEm:verificadoEm,comparacoes:comparacoes}));
    Logger.log('[DEV] Bases aplicadas com sucesso. Modo: %s.',manual?'MANUAL':'AUTOMATICO');
    return {status:'Atualizado',atualizouBase:true};
  } catch (erro) {
    propriedades.setProperty(prefixo + 'ULTIMO_STATUS_DEV',
      iniciouEscrita?'ERRO_DURANTE_GRAVACAO':'ERRO_ANTES_DE_GRAVAR');
    Logger.log('[DEV] %s: %s',iniciouEscrita?
      'FALHA APOS INICIO DE GRAVACAO; conferir destinos':
      'FALHA NA VALIDACAO; destinos preservados',erro.message);
    throw erro;
  } finally {
    bloqueio.releaseLock();
  }
}

/** Total e coleta por linha, limitando o excesso a 100% daquele registro. */
function resumoColetasPCPs_(valores,nomeAba) {
  if (!valores.length)throw new Error(nomeAba+': cabecalho ausente.');
  const colunas = indicesColetasPCPs_(valores[0],nomeAba);
  let total=0,coletado=0,linhas=0;
  for (let i=1;i<valores.length;i++) {
    const linha=valores[i];
    if (!chavePreenchidaPCPs_(linha[0]))continue;
    const t=numeroColetaPCPs_(linha[colunas.total],nomeAba,i+1,'TIRAGEM TOTAL');
    const c=numeroColetaPCPs_(linha[colunas.coleta],nomeAba,i+1,'TIRAGEM COLETADA');
    total+=t;coletado+=Math.min(t,c);linhas++;
  }
  return {total:total,coletado:coletado,percentual:total?coletado/total:0,linhas:linhas};
}

/** Le apenas chave, tiragem coletada e tiragem total do destino atual. */
function resumoColetasPCPsDestino_(aba,nomeAba) {
  const ultima=aba.getLastRow();
  const largura=aba.getLastColumn();
  if (ultima<2 || largura<2) return {total:0,coletado:0,percentual:0,linhas:0};
  const cabecalho=aba.getRange(1,1,1,largura).getValues()[0];
  const colunas=indicesColetasPCPs_(cabecalho,nomeAba+' (destino)');
  let total=0,coletado=0,linhas=0;
  for (let inicio=2;inicio<=ultima;inicio+=CONFIG_ATUALIZAR_PCPS.tamanhoLote) {
    const quantidade=Math.min(CONFIG_ATUALIZAR_PCPS.tamanhoLote,ultima-inicio+1);
    const chaves=aba.getRange(inicio,1,quantidade,1).getValues();
    const tiragens=aba.getRange(inicio,colunas.total+1,quantidade,1).getValues();
    const coletas=aba.getRange(inicio,colunas.coleta+1,quantidade,1).getValues();
    for(let j=0;j<quantidade;j++) {
      if(!chavePreenchidaPCPs_(chaves[j][0]))continue;
      const t=numeroColetaPCPs_(tiragens[j][0],nomeAba,inicio+j,'TIRAGEM TOTAL');
      const c=numeroColetaPCPs_(coletas[j][0],nomeAba,inicio+j,'TIRAGEM COLETADA');
      total+=t;coletado+=Math.min(t,c);linhas++;
    }
  }
  return {total:total,coletado:coletado,percentual:total?coletado/total:0,linhas:linhas};
}

function indicesColetasPCPs_(cabecalho,aba) {
  const normalizar=s=>String(s==null?'':s).normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
  const nomes=cabecalho.map(normalizar);
  const coleta=nomes.indexOf('TIRAGEM COLETADA');
  // A medida da acabadora e a tiragem total por destino, nunca o total geral do SKU.
  const total=aba.indexOf('ACAB')>=0?
    (nomes.indexOf('TIRAGEM A ENTREGAR (TOTAL POR CD)')>=0?
      nomes.indexOf('TIRAGEM A ENTREGAR (TOTAL POR CD)'):nomes.indexOf('TIRAGEM TOTAL')):
    nomes.indexOf('TIRAGEM TOTAL');
  if (coleta<0||total<0)
    throw new Error(aba+': cabecalho de TIRAGEM COLETADA / TIRAGEM TOTAL indisponivel.');
  return {coleta:coleta,total:total};
}

function numeroColetaPCPs_(valor,aba,linha,campo) {
  if(valor===null||valor===undefined||valor==='')return 0;
  if(typeof valor==='number') {
    if(!isFinite(valor)||valor<0)throw new Error(aba+' linha '+linha+': '+campo+' invalido.');
    return valor;
  }
  const texto=String(valor).trim();
  if(!texto)return 0;
  const normalizado=texto.indexOf(',')>=0?texto.replace(/\./g,'').replace(',','.'):texto;
  const n=Number(normalizado);
  if(!isFinite(n)||n<0)throw new Error(aba+' linha '+linha+': '+campo+' nao numerico.');
  return n;
}

/** Valida somente as linhas de origem pela coluna A (Chave) e seu volume. */
function prepararEValidarOrigem_(ss, propriedades, cfg, manual) {
  const origem = ss.getSheetByName(cfg.origem);
  const destino = ss.getSheetByName(cfg.destino);
  if (!origem) throw new Error('Aba de origem nao encontrada: ' + cfg.origem);
  if (!destino) throw new Error('Aba de destino nao encontrada: ' + cfg.destino);
  if (origem.getSheetId() === destino.getSheetId()) {
    throw new Error('Origem e destino sao a mesma aba: ' + cfg.origem);
  }

  const linhas = origem.getLastRow();
  const colunas = origem.getLastColumn();
  if (linhas <= 1 || colunas < 1) {
    throw new Error(cfg.origem + ': origem vazia ou ainda sem linhas de dados.');
  }

  // Os dados sao lidos integralmente para a copia, mas a validacao considera
  // APENAS a chave da coluna A. Erros ou "Carregando..." em outras colunas
  // nao causam o bloqueio da atualizacao.
  const valores = [];
  let linhasComDados = 0;
  for (let inicio = 1; inicio <= linhas; inicio += CONFIG_ATUALIZAR_PCPS.tamanhoLote) {
    const quantidade = Math.min(CONFIG_ATUALIZAR_PCPS.tamanhoLote, linhas - inicio + 1);
    const lote = origem.getRange(inicio, 1, quantidade, colunas).getValues();
    for (let i = 0; i < lote.length; i++) {
      const linha = lote[i];
      if (inicio + i > 1 && chavePreenchidaPCPs_(linha[0])) {
        linhasComDados++;
      }
      valores.push(linha);
    }
  }

  if (!valores.length || !chavePreenchidaPCPs_(valores[0][0])) {
    throw new Error(cfg.origem + ': cabecalho da coluna A nao carregado.');
  }

  const ultimaExecucao = Number(propriedades.getProperty(chaveVolume_(cfg.origem))) || 0;
  const minimoExigido = Math.max(
    cfg.minLinhasDados,
    manual?0:Math.ceil(ultimaExecucao * CONFIG_ATUALIZAR_PCPS.percentualMinimoDaUltimaAtualizacao)
  );
  if (linhasComDados < minimoExigido) {
    throw new Error(cfg.origem + ': apenas ' + linhasComDados +
      ' linhas com chave na coluna A; minimo seguro: ' + minimoExigido +
      '. Nada foi apagado nos destinos.');
  }

  Logger.log('%s validada: %s linhas com chave na coluna A; %s colunas; minimo exigido: %s.',
    cfg.origem, linhasComDados, colunas, minimoExigido);

  return {
    origem: cfg.origem,
    destino: destino,
    valores: valores,
    linhas: linhas,
    colunas: colunas,
    linhasComDados: linhasComDados
  };
}

/** A coluna A deve conter chaves reais, nao um erro ou indicador de carga. */
function chavePreenchidaPCPs_(valor) {
  if (valor === '' || valor === null || valor === undefined) return false;
  const chave = String(valor).trim();
  if (!chave) return false;
  return !/^#(?:REF!|N\/A|VALUE!|ERROR!|NAME\?|DIV\/0!|NUM!|NULL!|SPILL!|CALC!)/i.test(chave)
    && !/^(?:carregando|loading|erro ao carregar)(?:[. ]|$)/i.test(chave);
}

/** Expande a grade, se necessario. Nao remove linhas/colunas e nao recria a aba. */
function ajustarTamanhoDestino_(aba, linhas, colunas) {
  if (aba.getMaxRows() < linhas) {
    aba.insertRowsAfter(aba.getMaxRows(), linhas - aba.getMaxRows());
  }
  if (aba.getMaxColumns() < colunas) {
    aba.insertColumnsAfter(aba.getMaxColumns(), colunas - aba.getMaxColumns());
  }
}

function chaveVolume_(origem) {
  return 'ATUALIZAR_PCPS_ULTIMO_VOLUME_' + origem;
}