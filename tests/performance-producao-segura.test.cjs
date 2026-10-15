const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'Main.html'), 'utf8');
const global = fs.readFileSync(path.join(root, 'Scripts_Globais_2.html'), 'utf8');

test('somente uma carga de Chart.js e do plugin permanece no HTML principal', () => {
  assert.equal((main.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js"><\/script>/g) || []).length, 1);
  assert.equal((main.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chartjs-plugin-datalabels@2\.0\.0"><\/script>/g) || []).length, 1);
  const tags = [...main.matchAll(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/(?:chart\.js|chartjs-plugin-datalabels@2\.0\.0)">([\s\S]*?)<\/script>/g)];
  assert.equal(tags.length, 2);
  tags.forEach(match => assert.equal(match[1].trim(), '', 'biblioteca nao deve carregar script inline'));
});

test('SLA nao dispara calculo da Meta Armazem enquanto a aba esta oculta', () => {
  const inicio = main.indexOf("if (chave === 'PG_MATRIZ_SLA'");
  const fim = main.indexOf("if (chave === 'PG_FORECAST_COLETA'", inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  const evento = main.slice(inicio, fim);
  assert.match(evento, /getElementById\('abaMetaArmazem'\)\?\.classList\.contains\('hidden'\)/);
  assert.match(evento, /window\.processarMetaArmazem\(\)/);
});

test('WIP, backlog e cards de eficiencia usam prazo operacional sem trocar motores do Funil', () => {
  const matriz = global.slice(global.indexOf('function processarMatriz()'), global.indexOf('function processarEficiencia()'));
  const eficiencia = global.slice(global.indexOf('function processarEficiencia()'), global.indexOf('function processarMetaCD()'));
  const backlog = global.slice(global.indexOf('function renderTabelaPlan()'), global.indexOf('function processarFalhasPlan()'));
  assert.match(matriz, /pgPrazoWIPAtual\(l, proxFase, tRef\)/);
  assert.match(backlog, /pgPrazoWIPAtual\(l, fObj, tRef\)/);
  assert.match(eficiencia, /pgPrazoWIPAtual\(l, f, tRef\)/);
  assert.match(eficiencia, /pgEficienciaAgingPrazo/);
  assert.match(eficiencia, /pgEficienciaAgingDataReal/);
  assert.match(global, /function calcAtraso\(linha, fObj, tRef, dataHoje\)/);
});
