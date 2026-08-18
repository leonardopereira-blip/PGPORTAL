import os
import re

print("🚀 Iniciando particionamento completo e conexão dos motores JS...")

# 1. IDENTIFICA O ARQUIVO FONTE DO INDEX
index_source = None
for candidate in ["Index (1).html", "Index (2).html", "Index.html", "Index_antigo.html"]:
    if os.path.exists(candidate):
        index_source = candidate
        break

if not index_source:
    print("❌ Erro: Nenhum arquivo Index.html encontrado.")
    exit(1)

print(f"📖 Lendo estrutura de: {index_source}")
with open(index_source, "r", encoding="utf-8") as f:
    raw = f.read().replace('\r\n', '\n')

# 2. FIXA O CODE.JS PARA AVALIAR OS INCLUDES NATIVOS DO GOOGLE APPS SCRIPT
for code_file in ["Code.js", "Código.js", "Code_2.js", "Código_2.js"]:
    if os.path.exists(code_file):
        with open(code_file, "r", encoding="utf-8") as f:
            c = f.read()
        c = re.sub(
            r'function include\(filename\)\s*\{[^}]*\}',
            'function include(filename) {\n  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();\n}',
            c
        )
        with open("Code.js", "w", encoding="utf-8") as f:
            f.write(c)
        print("✔ Code.js atualizado com include() em modo Template.")

# HELPER DE EXTRAÇÃO POR DIV / MARCADOR
def extrair_bloco(texto, inicio_str, fim_str):
    p1 = texto.find(inicio_str)
    if p1 == -1: return ""
    p2 = texto.find(fim_str, p1)
    if p2 == -1: return texto[p1:]
    return texto[p1:p2]

# -----------------------------------------------------------------------------
# 3. FATIAMENTO DAS VISÕES E SEUS MOTORES ESPECÍFICOS
# -----------------------------------------------------------------------------

# A) PRÉ-PRODUÇÃO (Falhas de Planejamento, ICP & Acurácia, Evolução)
pre_base = ""
if os.path.exists("PreProducao.html"):
    with open("PreProducao.html", "r", encoding="utf-8") as f:
        pre_base = f.read()

html_pre_extra = (
    extrair_bloco(raw, '<div id="abaFalhasPlan"', '<div id="abaQualidadeReclamacoes"') +
    "\n" +
    extrair_bloco(raw, '<div id="abaQualidade"', '<div id="abaColetas"')
)
js_pre = (
    extrair_bloco(raw, 'function processarFalhasPlan() {', 'function processarQualidade() {') +
    "\n" +
    extrair_bloco(raw, 'function processarQualidade() {', 'function exportarRelatorioFiltros() {') +
    "\n" +
    extrair_bloco(raw, 'window.processarEvolucao =', '// ==========================================\n    // MÓDULO DE QUALIDADE')
)

with open("View_PreProducao.html", "w", encoding="utf-8") as f:
    f.write(f"{pre_base.strip()}\n\n{html_pre_extra.strip()}\n\n<script>\n{js_pre.strip()}\n</script>\n")
print("✔ View_PreProducao.html gerado com sucesso!")

# B) PRODUÇÃO (Giro Semanal, Ritmo/Curva S, Matriz, Funil, Eficiência, Meta CD, OTIF, Pipeline, OKR Q2)
html_prod = (
    extrair_bloco(raw, '<div id="abaGiroSemanal"', '<div id="abaFalhasPlan"') +
    "\n" +
    extrair_bloco(raw, '<div id="abaOKRQ2"', '</div>\n</div>\n</div>\n\n<script>')
)
js_prod = (
    extrair_bloco(raw, 'window.processarGiroSemanal =', 'function processarFalhasPlan() {') +
    "\n" +
    extrair_bloco(raw, '// METAS OKR Q2', '// ==========================================\n    // MÓDULO DE QUALIDADE') +
    "\n" +
    extrair_bloco(raw, 'window.GIRO_DADOS_RAW = [];', 'window.renderizarDashColetas =')
)

with open("View_Producao.html", "w", encoding="utf-8") as f:
    f.write(f"{html_prod.strip()}\n\n<script>\n{js_prod.strip()}\n</script>\n")
print("✔ View_Producao.html gerado com sucesso!")

# C) QUALIDADE (Reclamações 2026, Matriz PPM, Inspeções CDs)
html_qual = extrair_bloco(raw, '<div id="abaQualidadeReclamacoes"', '<div id="abaQualidade"')
js_qual = (
    extrair_bloco(raw, 'window.filtrosInspIniciados = false;', 'function iniciarAbaInspecaoCDs()') +
    "\n" +
    extrair_bloco(raw, '// ==========================================\n    // MÓDULO DE QUALIDADE', '// ==========================================\n    // FUNÇÕES DA TELA INICIAL')
)

with open("View_Qualidade.html", "w", encoding="utf-8") as f:
    f.write(f"{html_qual.strip()}\n\n<script>\n{js_qual.strip()}\n</script>\n")
print("✔ View_Qualidade.html gerado com sucesso!")

# D) REENTRADAS (Alocações, Produção, Pendências, Painel Gerencial)
html_reen = extrair_bloco(raw, '<div id="abaReentradasAlocacao"', '<div id="abaOKRQ2"')
js_reen = extrair_bloco(raw, '// ==========================================\n    // MÓDULO 1: REENTRADAS E ALOCAÇÕES', '// METAS OKR Q2')

with open("View_Reentradas.html", "w", encoding="utf-8") as f:
    f.write(f"{html_reen.strip()}\n\n<script>\n{js_reen.strip()}\n</script>\n")
print("✔ View_Reentradas.html gerado com sucesso!")

# E) PÓS-PRODUÇÃO (Auditoria de Coletas)
html_pos = extrair_bloco(raw, '<div id="abaColetas"', '<div id="abaReentradasAlocacao"')
js_pos = extrair_bloco(raw, 'let divergenciasExport = [];', 'window.processarEvolucao =')

with open("View_PosProducao.html", "w", encoding="utf-8") as f:
    f.write(f"{html_pos.strip()}\n\n<script>\n{js_pos.strip()}\n</script>\n")
print("✔ View_PosProducao.html gerado com sucesso!")

# -----------------------------------------------------------------------------
# 4. RECONSTRUÇÃO DO INDEX.HTML (CONTAINER + MOTOR GLOBAL DE FILTROS E NAVEGAÇÃO)
# -----------------------------------------------------------------------------
header_html = extrair_bloco(raw, '<header id="headerFiltrosProducao"', '<div id="abaGiroSemanal"')
home_html = extrair_bloco(raw, '<div id="abaHome"', '<div id="abaGiroSemanal"')

js_global = (
    extrair_bloco(raw, 'window.alternarAbaDash = function(idAba) {', 'window.processarGiroSemanal =') + "\n\n" +
    extrair_bloco(raw, 'function exportarRelatorioFiltros() {', 'let divergenciasExport = [];') + "\n\n" +
    extrair_bloco(raw, '// ==========================================\n    // FUNÇÕES DA TELA INICIAL', '// ==========================================\n    // MÓDULO 1: REENTRADAS E ALOCAÇÕES') + "\n\n" +
    extrair_bloco(raw, '// ==========================================\n    // MÓDULO DO MODAL DE HISTÓRICO', 'window.GIRO_DADOS_RAW = [];')
)

index_master = f"""<div class="flex flex-col h-full w-full overflow-hidden bg-neutral-100">
{header_html.strip()}
{home_html.strip()}

    <div class="flex-1 overflow-y-auto p-2 scroller bg-neutral-100">
        <div class="w-full mx-auto">
            <?!= include('View_Producao'); ?>
            <?!= include('View_PreProducao'); ?>
            <?!= include('View_Qualidade'); ?>
            <?!= include('View_PosProducao'); ?>
            <?!= include('View_Reentradas'); ?>
        </div>
    </div>
</div>

<script>
{js_global.strip()}
</script>
"""

# Limpeza de possíveis duplicidades de fechamento
index_master = re.sub(r'(</script>\s*)+</script>', '</script>', index_master)

with open("Index.html", "w", encoding="utf-8") as f:
    f.write(index_master)

print("✔ Index.html montado como esqueleto unificado!")
print("\n✨ PARTICIONAMENTO CONCLUÍDO COM SUCESSO!")