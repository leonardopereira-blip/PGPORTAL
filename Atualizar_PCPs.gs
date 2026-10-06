/**
 * ATUALIZADOR DE PCPs — rotina independente no projeto PGPORTAL, apontando diretamente para a planilha PCPs.
 *
 * PCP_PGBM         -> PCP
 * ACABADORAS_PGBM  -> PCP_ACABADORAS
 *
 * REGRA DE SEGURANCA:
 * 1. Valida as chaves preenchidas (coluna A) e o volume de ambas as origens.
 * 2. Nao bloqueia por erros temporarios em outras colunas (ex.: DN69).
 * 3. Se ambas aprovadas, apaga TODO o conteudo dos destinos
 *    e escreve as novas bases como valores (sem copiar formulas IMPORTRANGE).
 * 4. Preserva nomes, IDs das abas e formatacao. Nao recria as abas.
 *
 * Publique este arquivo pelo fluxo GitHub Desktop + publicar.cmd do PGPORTAL.
 * Programe um gatilho baseado em tempo para a funcao atualizarPCPs.
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

/** Funcao principal: esta e a funcao a selecionar no gatilho agendado. */
function atualizarPCPs() {
  const bloqueio = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!bloqueio.tryLock(CONFIG_ATUALIZAR_PCPS.esperaBloqueioMs)) {
    throw new Error('Atualizacao cancelada: ja existe outra execucao em andamento.');
  }

  let iniciouEscrita = false;
  try {
    // Nao usa a planilha ativa do portal: acessa exclusivamente a planilha PCPs.
    const ss = SpreadsheetApp.openById(CONFIG_ATUALIZAR_PCPS.planilhaId);
    const propriedades = PropertiesService.getScriptProperties();

    SpreadsheetApp.flush();

    // FASE 1: conferir as chaves em A e guardar os dados de AMBAS as origens.
    // NENHUM destino e apagado ou alterado nesta fase.
    const pacotes = CONFIG_ATUALIZAR_PCPS.abas.map(cfg =>
      prepararEValidarOrigem_(ss, propriedades, cfg)
    );

    Logger.log('VALIDACAO APROVADA DAS DUAS ORIGENS. Iniciando substituicao.');

    // FASE 2: ambos os conjuntos de dados ja estao em memoria e validados.
    // Primeiro, garante dimensoes suficientes dos destinos.
    pacotes.forEach(p => ajustarTamanhoDestino_(p.destino, p.linhas, p.colunas));

    // Apaga TODO o conteudo de cada destino e so entao cola a base validada.
    // clearContents preserva a formatacao e a identidade da aba.
    for (const p of pacotes) {
      iniciouEscrita = true;
      p.destino.clearContents();
      for (let inicio = 0; inicio < p.linhas; inicio += CONFIG_ATUALIZAR_PCPS.tamanhoLote) {
        const lote = p.valores.slice(inicio, inicio + CONFIG_ATUALIZAR_PCPS.tamanhoLote);
        p.destino.getRange(inicio + 1, 1, lote.length, p.colunas).setValues(lote);
      }
      Logger.log('%s atualizada: %s linhas x %s colunas.', p.destino.getName(), p.linhas, p.colunas);
    }

    SpreadsheetApp.flush();

    // Grava a referencia de volume apenas apos as duas escritas terminarem.
    pacotes.forEach(p => {
      propriedades.setProperty(chaveVolume_(p.origem), String(p.linhasComDados));
    });

    Logger.log('SUCESSO: PCP e PCP_ACABADORAS atualizadas apos validacao das linhas de origem.');
  } catch (erro) {
    if (iniciouEscrita) {
      Logger.log('ERRO DURANTE A GRAVACAO: a operacao no Sheets nao e atomica. ' +
        'Confira os destinos antes de executar novamente. Detalhe: ' + erro.message);
    } else {
      Logger.log('ATUALIZACAO BLOQUEADA: nenhum conteudo dos destinos foi apagado. ' + erro.message);
    }
    throw erro;
  } finally {
    bloqueio.releaseLock();
  }
}

/** Valida somente as linhas de origem pela coluna A (Chave) e seu volume. */
function prepararEValidarOrigem_(ss, propriedades, cfg) {
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
    Math.ceil(ultimaExecucao * CONFIG_ATUALIZAR_PCPS.percentualMinimoDaUltimaAtualizacao)
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