# Fluxo de trabalho do PGPORTAL

- Altere somente o que o usuario solicitar. Preserve calculos e telas fora do pedido.
- Quando implementar uma alteracao solicitada, envie o commit para `main` no GitHub, salvo se o usuario pedir outro destino ou pedir para nao enviar. O usuario nao deve precisar abrir VS Code ou executar o push manualmente.
- Use verificacoes locais proporcionais a alteracao. Nao abra navegador de teste ou previa, a menos que o usuario solicite.
- A atualizacao automatica do ambiente de testes e feita pelo workflow `.github/workflows/atualizar-testes.yml`, quando configurado e ativado.
- Nunca crie versao, publique ou atualize implantacao de producao sem um pedido explicito do usuario. Nao execute `publicar.cmd` como parte das alteracoes.
- Credenciais devem ficar em GitHub Secrets ou nos arquivos locais de autenticacao. Nunca as adicione ao repositorio, mensagens ou logs.
- Ao terminar, informe de forma curta o commit enviado e, quando houver acesso ao resultado do workflow, se o ambiente de testes foi atualizado. Nao declare a atualizacao dos testes apenas porque o push GitHub passou.
