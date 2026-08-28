import re
import os

def atualizar_projeto():
    arquivo = "ValidaInterface.html"
    
    if not os.path.exists(arquivo):
        print(f"Erro: Arquivo {arquivo} não encontrado.")
        return

    with open(arquivo, 'r', encoding='utf-8') as f:
        conteudo = f.read()

    # 1. Substituir o HTML do campo de SKU
    padrao_html = re.compile(
        r'<div class="vc-field" style="margin-top:0;">\s*<label class="vc-lbl">4\. SKU\(s\)</label>\s*<input type="text" id="txtBuscaSku" placeholder="Pesquisar SKU\.\.\." onkeyup="filtrarListaSkuUI\(\)" style="margin-bottom: 6px; font-size: 12px; padding: 6px;">\s*<div class="scroll-box" id="boxSkus" style="max-height: 100px;">\s*<span style="font-size:11px; color:#888;">Aguardando filtros\.\.\.</span>\s*</div>\s*</div>',
        re.DOTALL
    )
    
    novo_html = """<div class="vc-field" style="margin-top:0;">
          <label class="vc-lbl" style="display:flex; justify-content:space-between; align-items:center;">
            <span>4. SKU(s)</span>
            <button onclick="selecionarSkusVisiveis()" style="font-size:10px; padding:2px 8px; border-radius:4px; border:1px solid #d3d9e6; background:#eef1f7; color:#284081; cursor:pointer; font-weight:bold;">Selecionar Visíveis</button>
          </label>
          <input type="text" id="txtBuscaSku" placeholder="Cole SKUs com vírgula ou espaço..." onkeyup="filtrarListaSkuUI()" style="margin-bottom: 6px; font-size: 12px; padding: 6px;">
          <div class="scroll-box" id="boxSkus" style="max-height: 100px;">
            <span style="font-size:11px; color:#888;">Aguardando filtros...</span>
          </div>
        </div>"""

    # 2. Substituir o JS do filtro
    padrao_js = re.compile(
        r'function filtrarListaSkuUI\(\) \{\s*const busca = document\.getElementById\(\'txtBuscaSku\'\)\.value\.toLowerCase\(\);\s*document\.querySelectorAll\(\'\.chk-sku-item\'\)\.forEach\(lbl => \{\s*lbl\.style\.display = lbl\.textContent\.toLowerCase\(\)\.includes\(busca\) \? \'block\' : \'none\';\s*\}\);\s*\}',
        re.DOTALL
    )

    novo_js = """function filtrarListaSkuUI() {
    const buscaRaw = document.getElementById('txtBuscaSku').value.toLowerCase();
    const termos = buscaRaw.split(/[,;\\n\\t\\s]+/).map(t => t.trim()).filter(t => t !== '');

    document.querySelectorAll('.chk-sku-item').forEach(lbl => {
      const textoSku = lbl.textContent.toLowerCase().trim();
      let mostrar = false;
      
      if (termos.length === 0) {
        mostrar = true;
      } else {
        mostrar = termos.some(termo => textoSku.includes(termo));
      }
      
      lbl.style.display = mostrar ? 'block' : 'none';
    });
  }

  function selecionarSkusVisiveis() {
    let mudou = false;
    document.querySelectorAll('.chk-sku-item').forEach(lbl => {
      if (lbl.style.display !== 'none') {
        let chk = lbl.querySelector('.chk-sku');
        if (chk && !chk.checked) {
          chk.checked = true;
          mudou = true;
        }
      }
    });
    if (mudou) updateFilters(4); 
  }"""

    # Aplicando as substituições
    se_alterou_html = False
    se_alterou_js = False

    if padrao_html.search(conteudo):
        conteudo = padrao_html.sub(novo_html, conteudo)
        se_alterou_html = True
    
    if padrao_js.search(conteudo):
        conteudo = padrao_js.sub(novo_js, conteudo)
        se_alterou_js = True

    if se_alterou_html or se_alterou_js:
        with open(arquivo, 'w', encoding='utf-8') as f:
            f.write(conteudo)
        print(f"✅ ValidaInterface.html atualizado com sucesso!")
        if se_alterou_html: print("   - Campo de SKUs atualizado (Botão Selecionar Visíveis adicionado).")
        if se_alterou_js: print("   - Lógica de filtro avançado (múltiplos valores) aplicada.")
    else:
        print("⚠️ Os blocos não foram encontrados. O arquivo já pode estar atualizado.")

if __name__ == "__main__":
    atualizar_projeto()