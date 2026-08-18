import os
import re

def particionar_index_agressivo():
    nome_arquivo = "Index.html"
    pasta_saida = "views_separadas"

    if not os.path.exists(nome_arquivo):
        print(f"Erro: Arquivo '{nome_arquivo}' não encontrado na pasta atual!")
        return

    with open(nome_arquivo, 'r', encoding='utf-8') as f:
        html = f.read()

    if not os.path.exists(pasta_saida):
        os.makedirs(pasta_saida)

    # 1. Busca Agressiva (Lê tags em múltiplas linhas)
    # Procuramos todas as <div> e <script>
    padrao_tag = re.compile(r'<(div|script)\b([^>]*)>', re.IGNORECASE | re.DOTALL)
    
    cortes = []
    script_contador = 1

    for match in padrao_tag.finditer(html):
        tag_name = match.group(1).lower()
        attrs = match.group(2)
        
        if tag_name == 'div':
            # Se a div tiver a classe aba-conteudo, nós pegamos!
            if 'aba-conteudo' in attrs:
                # Extrai o ID, mesmo que tenha aspas simples ou duplas
                id_match = re.search(r'id=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
                aba_id = id_match.group(1) if id_match else f"aba_sem_id_{match.start()}"
                cortes.append((match.start(), aba_id, 'div'))
                
        elif tag_name == 'script':
            # Vamos extirpar o JavaScript gigante do index também
            cortes.append((match.start(), f"Scripts_Globais_{script_contador}", 'script'))
            script_contador += 1

    if not cortes:
        print("Nenhuma aba ou script encontrado. O arquivo já está limpo?")
        return

    print(f"🔪 Encontrados {len(cortes)} blocos gigantes (Abas e Scripts). Fatiando...")

    html_final = html
    
    # 2. Processamos de trás pra frente (para os índices do texto não mudarem enquanto cortamos)
    cortes.sort(key=lambda x: x[0], reverse=True)
    ids_vistos = {}

    for start_idx, nome_bloco, tag_name in cortes:
        # Resolve nomes duplicados para não sobrescrever arquivo
        if nome_bloco in ids_vistos:
            ids_vistos[nome_bloco] += 1
            nome_arquivo_bloco = f"{nome_bloco}_{ids_vistos[nome_bloco]}"
        else:
            ids_vistos[nome_bloco] = 0
            nome_arquivo_bloco = nome_bloco

        # Matemática para encontrar onde a tag fecha </div> ou </script>
        padrao_fechamento = re.compile(rf'</?{tag_name}\b[^>]*>', re.IGNORECASE)
        count = 0
        end_idx = -1
        
        for tag_match in padrao_fechamento.finditer(html_final, start_idx):
            tag_str = tag_match.group(0).lower()
            if tag_str.startswith(f'<{tag_name}'):
                count += 1
            elif tag_str.startswith(f'</{tag_name}'):
                count -= 1
            
            # Encontrou o fechamento exato da div principal!
            if count == 0:
                end_idx = tag_match.end()
                break

        if end_idx != -1:
            conteudo = html_final[start_idx:end_idx]
            
            # Salva o bloco fatiado no arquivo isolado
            caminho_bloco = os.path.join(pasta_saida, f"{nome_arquivo_bloco}.html")
            with open(caminho_bloco, 'w', encoding='utf-8') as f_out:
                f_out.write(conteudo)
            
            print(f" ✅ Isolado com sucesso: {nome_arquivo_bloco}.html")

            # Substitui o textão gigante por 1 linha do Google Apps Script
            placeholder = f"\n    <?!= include('{nome_arquivo_bloco}'); ?>"
            html_final = html_final[:start_idx] + placeholder + html_final[end_idx:]

    # 3. Aplica a limpeza final no Index.html original
    with open(nome_arquivo, 'w', encoding='utf-8') as f:
        f.write(html_final)

    print(f"\n🚀 BOOM! Arquivo '{nome_arquivo}' completamente zerado e reduzido!")
    print(f"Foram criados {len(cortes)} arquivos menores na pasta '{pasta_saida}/'.")

if __name__ == "__main__":
    particionar_index_agressivo()