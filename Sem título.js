function exportarHTMLs() {
  const files =  ['Index','Main','Cockpit', 'PreProducao'];

  files.forEach(nome => {
    const conteudo = HtmlService.createHtmlOutputFromFile(nome).getContent();
    DriveApp.createFile(nome + '.html', conteudo, MimeType.HTML);
  });
}