# Atualizacao automatica dos testes

Fluxo: pedido no projeto PGPORTAL -> alteracao solicitada -> commit na main do GitHub -> workflow Atualizar ambiente de testes -> codigo do Apps Script usado nos testes.

O envio ao Apps Script e executado no GitHub. Nao depende do VS Code ou do computador ligado. O workflow usa o clasp ja presente no repositorio e executa somente `push`, sem criar versao ou atualizar implantacoes.

## Configuracao inicial

Confirme o projeto usado para os testes antes de ativar. Em GitHub Settings > Secrets and variables > Actions, configure:

- Segredo `CLASPRC_JSON`: credencial do clasp de uma conta autorizada a editar o projeto de testes. O valor nunca deve ser publicado no codigo ou em conversas.
- Variavel `PGPORTAL_TESTES_SCRIPT_ID`: ID do projeto Apps Script confirmado como destino de testes.
- Variavel `PGPORTAL_TESTES_ATIVO`: `true`, somente depois de confirmar o destino e configurar a credencial. Sem essa variavel, o envio fica desativado.

O workflow atualiza o HEAD do projeto escolhido. Se o ambiente de testes for o link `/dev`, ele passa a usar o codigo salvo mais recente. Se testes e producao usam o mesmo projeto, a producao deve usar uma implantacao versionada para manter sua versao ate uma publicacao solicitada.

Depois de configurar, execute uma vez o workflow em GitHub Actions para enviar o codigo atual. As proximas alteracoes dos arquivos do portal na main acionam o envio automaticamente. O resultado e o commit enviado aparecem no resumo da execucao.

Para pausar os envios, defina `PGPORTAL_TESTES_ATIVO` como `false`.

## Pedidos pelo ChatGPT

Use o Codex com o repositorio PGPORTAL conectado, localmente ou em um ambiente de nuvem. As instrucoes de trabalho ficam em `AGENTS.md`. A automacao comeca quando a alteracao chega a main do GitHub; uma conversa sem acesso ao repositorio nao envia codigo por si so.

## Producao

Publicar uma versao do portal de producao exige um pedido explicito do usuario. Este workflow nao executa deploy, redeploy ou criacao de versao.
