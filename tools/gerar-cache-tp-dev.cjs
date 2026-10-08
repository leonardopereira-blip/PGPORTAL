// Atualiza exclusivamente cache_mapa_tp_dev.json; nao publica Apps Script nem altera planilhas.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { google } = require('googleapis');
const root = path.resolve(__dirname, '..');

async function main() {
  const credentials = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8')).tokens.default;
  const auth = new google.auth.OAuth2(credentials.client_id, credentials.client_secret);
  auth.setCredentials(credentials);
  const scripts = google.script({ version: 'v1', auth });
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });
  const scriptId = process.env.TEST_SCRIPT_ID || JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8')).scriptId;
  const parentId = (await scripts.projects.get({ scriptId })).data.parentId;
  if (!parentId) throw new Error('Projeto DEV sem planilha vinculada para conferir Forecast.');
  const sourceId = /var PG_ARQUIVO_PCPS\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(root, 'LeituraCacheSheets.js'), 'utf8'))?.[1];
  const folderId = /const PASTA_CACHE_ID\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(root, 'SalvaJson.js'), 'utf8'))?.[1];
  if (!sourceId || !folderId) throw new Error('Fonte ou pasta do cache nao configurada.');
  const meta = id => sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets(properties(title))' });
  const [sourceMeta, parentMeta] = await Promise.all([meta(sourceId), meta(parentId)]);
  const names = sourceMeta.data.sheets.map(s => s.properties.title);
  const sourceName = ['MAPA DE SAÍDA', 'MAPA DE SAIDA', 'MAPA DE SAIDA '].find(n => names.includes(n));
  if (!sourceName) throw new Error('MAPA DE SAIDA ausente na fonte configurada.');
  const quoted = "'" + sourceName.replace(/'/g, "''") + "'!";
  // Apenas as colunas utilizadas; mantem os numeros das linhas fisicas.
  const blocks = [[0,'A1:C'], [4,'E1:E'], [11,'L1:L'], [14,'O1:O'], [39,'AN1:AN'],
    [41,'AP1:AP'], [43,'AR1:AU'], [49,'AX1:AX']];
  const parentNames = parentMeta.data.sheets.map(s => s.properties.title);
  const forecastPromise = parentNames.includes('Forecast_Coleta_Portal')
    ? sheets.spreadsheets.values.batchGet({ spreadsheetId: parentId,
      ranges: ["'Forecast_Coleta_Portal'!K2:K", "'Forecast_Coleta_Portal'!T2:T"], valueRenderOption: 'UNFORMATTED_VALUE' })
    : Promise.resolve({ data: { valueRanges: [] } });
  const [mapResponse, forecast] = await Promise.all([
    sheets.spreadsheets.values.batchGet({ spreadsheetId: sourceId, ranges: blocks.map(b => quoted + b[1]),
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }), forecastPromise]);
  const ranges = mapResponse.data.valueRanges || [];
  if (ranges.length !== blocks.length) throw new Error('Leitura incompleta das parcelas do mapa.');
  const count = Math.max(0, ...ranges.map(r => (r.values || []).length));
  const rows = Array.from({ length: count }, () => Array(50).fill(''));
  ranges.forEach((range, i) => (range.values || []).forEach((values, row) =>
    values.forEach((value, col) => { rows[row][blocks[i][0] + col] = value; })));
  let output, generated;
  const ctx = vm.createContext({ console, Date, PASTA_CACHE_ID: folderId,
    pgLerAbaCache_: () => rows,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => parentId }) },
    pgMetadadosPlanilhaCache_: () => ({ nomes: parentNames }),
    Sheets: { Spreadsheets: { Values: { batchGet: () => forecast.data } } },
    DriveApp: { getFolderById: id => id },
    pgGravarArquivoDrive_: (folder, filename, json) => { output = { folder, filename, json }; },
    Utilities: { formatDate(date, zone) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone,
        year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type,p.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    } }
  });
  for (const file of ['Code.js', 'EventosTPMapa.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), ctx, { filename:file });
  generated = ctx.atualizarCacheMapaTPDev();
  if (!output || output.filename !== 'cache_mapa_tp_dev.json' || output.folder !== folderId) throw new Error('Destino DEV invalido.');
  const listed = await drive.files.list({ q: `'${folderId}' in parents and trashed=false and name='cache_mapa_tp_dev.json'`,
    fields: 'files(id,name)', pageSize: 100 });
  if (listed.data.files.length > 1) throw new Error('Mais de um cache TP do DEV; atualizacao interrompida.');
  const media = { mimeType: 'application/json', body: Readable.from([output.json]) };
  const existing = listed.data.files[0];
  const written = existing ? await drive.files.update({ fileId: existing.id, media, fields:'id,name,size,modifiedTime' })
    : await drive.files.create({ requestBody: { name: output.filename, parents:[folderId] }, media, fields:'id,name,size,modifiedTime' });
  console.log(JSON.stringify({ ...generated, bytes: Buffer.byteLength(output.json), arquivoId: written.data.id }));
}
main().catch(error => { console.error('Cache TP do DEV: ' + error.message.split('\n')[0]); process.exitCode=1; });
