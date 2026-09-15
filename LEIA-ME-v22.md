# Auxiliar de Pesquisa — v22 (só os arquivos alterados)

Correção pequena em cima da v21: **faltava o título "Fichamento"** acima da
página escaneada.

Copie estes arquivos por cima dos que já estão no repositório:

    sw.js                   ← versão v22
    js/app.js               ← versão v22
    js/anexos.js            ← o título novo
    teste/teste-anexos.js   ← bateria atualizada

`js/config-app.js` não está aqui, como sempre.

**Importante:** se você ainda não publicou a v21, instale **o zip da v21
primeiro** (ele traz os dois arquivos novos, `js/anexos.js` e
`vendor/pdf-lib.min.js`) e depois este por cima. Se a v21 já está publicada,
basta este.

---

## O que mudou

A primeira folha das páginas escaneadas agora abre assim, como no modelo do
professor:

                        Fichamento              ← centralizado, em negrito
    Print ou Xerox da Obra                      ← à esquerda, em negrito

    ┌──────────────────────────────────┐
    │                                  │
    │      a página escaneada          │
    │                                  │
    └──────────────────────────────────┘

                            1               ← centralizado no pé

O título sai só na primeira folha, não se repete nas seguintes, e a imagem desce
o tanto necessário para ele caber — nada foi cortado.

---

## Publicar

Copie os arquivos e publique. O `sw.js` já está na `v22`.

Se o celular teimar com a versão velha: **Configurações → Versão → "Buscar
atualização agora"**. A caixa acima do botão tem que dizer **v22**.

---

## Conferido antes de entregar

13 baterias, **511 verificações, todas passando**. Quatro verificações novas na
`teste/teste-anexos.js`, todas lidas do PDF gerado:

- o título "Fichamento" está na primeira página;
- ele vem **acima** de "Print ou Xerox da Obra";
- ele **não se repete** nas outras páginas escaneadas;
- ele está **centralizado** — o teste mede, em pixels, a sobra de cada lado da
  folha e exige que sejam praticamente iguais.
