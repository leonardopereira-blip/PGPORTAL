import os

arquivos_alvo = ('.js', '.html', '.json')

with open('projeto_completo_portal.txt', 'w', encoding='utf-8') as f_out:
    for arquivo in os.listdir('.'):
        if arquivo.endswith(arquivos_alvo):
            f_out.write(f'\n\n==== {arquivo} ====\n\n')
            with open(arquivo, 'r', encoding='utf-8') as f_in:
                f_out.write(f_in.read())

print("Arquivo projeto_completo.txt criado! Clique com o botão direito nele e faça o download.")