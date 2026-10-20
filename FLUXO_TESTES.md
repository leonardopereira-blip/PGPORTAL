# Atualizacao automatica dos testes

Fluxo: pedido no projeto PGPORTAL -> alteracao solicitada -> commit na main do GitHub -> workflow Atualizar ambiente de testes -> codigo do Apps Script usado nos testes.

O envio ao Apps Script e executado no GitHub. Nao depende do Work, do VS Code ou do computador ligado. O workflow usa o clasp ja presente no repositorio para salvar o codigo (`push`) e depois reler o HEAD do Google para conferir os arquivos, sem criar versao ou atualizar implantacoes. Ele publica o commit exato da execucao, mesmo se a main avancar durante a fila.

## Sincronizacao antes de cada trabalho

Antes de editar ou publicar, atualize a main pelo GitHub e leia tambem o HEAD salvo no Apps Script. Um pull do GitHub nao recupera sozinho as edicoes feitas diretamente no editor do Google. Preserve copias das fontes e concilie as diferencas antes de continuar; confira a versao ativa se o HEAD ja tiver sobrescrito uma alteracao publicada.

Registre em `.github/pgportal-base-google.json` o `scriptId`, o horario da leitura e os hashes SHA-256 dos arquivos efetivamente lidos do Google. As chaves sao `TIPO:nome`, sem extensao, e o conteudo deve ter CRLF normalizado para LF antes do hash. O workflow rele o Google imediatamente antes de enviar: se o conteudo tiver mudado, interrompe o envio para permitir nova conciliacao. Uma repeticao que ja coincide integralmente com o resultado esperado e permitida.

## Configuracao do envio automatico

Confirme o projeto usado para os testes antes de ativar. Em GitHub Settings > Secrets and variables > Actions, configure:

- Segredo `CLASPRC_JSON`: conteudo do arquivo de autenticacao do clasp de uma conta autorizada a editar o projeto de testes, incluindo `refresh_token` renovavel no perfil `default`. Um `access_token` avulso expira e nao serve como credencial permanente. O valor nunca deve ser publicado no codigo ou em conversas.
- Variavel `PGPORTAL_TESTES_SCRIPT_ID`: ID do projeto Apps Script confirmado como destino de testes.
- Variavel `PGPORTAL_TESTES_ATIVO`: `true`, somente depois de confirmar o destino e configurar a credencial. Sem essa variavel, o envio fica desativado.

O workflow atualiza o HEAD do projeto escolhido. Se o ambiente de testes for o link `/dev`, ele passa a usar o codigo salvo mais recente. Se testes e producao usam o mesmo projeto, a producao deve usar uma implantacao versionada para manter sua versao ate uma publicacao solicitada.

Depois de configurar, execute uma vez o workflow em GitHub Actions ou atualize `PUBLICAR_DEV.json` na main para enviar o codigo atual. As proximas alteracoes dos arquivos do portal na main acionam o envio automaticamente. O resultado, o commit exato e a conferencia dos arquivos aparecem no resumo da execucao.

Para pausar os envios, defina `PGPORTAL_TESTES_ATIVO` como `false`.

## Pedidos pelo ChatGPT

No ChatGPT comum com a integracao GitHub conectada e ferramentas de escrita disponiveis para este repositorio:

1. Leia `AGENTS.md` e os arquivos envolvidos usando a integracao GitHub.
2. Para uma alteracao no portal, grave os arquivos solicitados na `main` com as ferramentas de escrita da integracao (`update_file`, `create_file` ou equivalentes).
3. Se o pedido for somente publicar o estado atual, atualize `PUBLICAR_DEV.json` na `main`: use um novo horario UTC em `solicitado_em` e descreva o pedido em `motivo`. A mudanca nesse arquivo aciona a publicacao sem precisar alterar o portal ou disparar Actions manualmente. Ele nao vai para o Apps Script.
4. Acompanhe o workflow **Atualizar ambiente de testes** do commit criado. Informe o link da execucao e o resultado. Somente uma execucao concluida com sucesso confirma que esse commit foi salvo e conferido no Google para uso pelo `/dev`.

Exemplo de pedido: "No repositorio PGPORTAL, leia AGENTS.md, publique a main no /dev atualizando PUBLICAR_DEV.json e acompanhe o workflow desse commit ate o resultado."

A integracao precisa disponibilizar escrita nessa conversa. Tente as ferramentas presentes antes de afirmar falta de acesso. Se a escrita for negada ou nao estiver disponivel, informe essa limitacao concreta. Se o resultado do workflow nao puder ser consultado, informe o commit enviado e que a publicacao ainda nao foi confirmada.

## Se o Google recusar a publicacao

O resumo da execucao distingue falha de renovacao OAuth, falta de permissao e divergencia na conferencia. `invalid_grant` indica que a credencial renovavel foi recusada: refaca o login do clasp com a conta editora e substitua `CLASPRC_JSON` em GitHub Secrets. HTTP 401/403 exige conferir a conta, a permissao de edicao do projeto configurado e a Apps Script API habilitada para essa conta. Nenhum token deve ser copiado para o chat ou para arquivos do repositorio.

Depois de corrigir a credencial ou a configuracao, atualize novamente `PUBLICAR_DEV.json` para repetir o envio e confira o resultado. Nao troque o ID de destino nem desative a protecao `PGPORTAL_TESTES_ATIVO` para contornar uma falha de acesso.

## Producao

Publicar uma versao do portal de producao exige um pedido explicito do usuario. Este workflow nao executa deploy, redeploy ou criacao de versao.
