# Auxiliar de Pesquisa — v21 (só os arquivos alterados)

Copie estes arquivos por cima dos que já estão no repositório, mantendo as
pastas. **Há dois arquivos novos** — eles precisam mesmo ir para o repositório,
senão o recurso não funciona:

    index.html                      ← passou a carregar o js/anexos.js
    sw.js                           ← versão v21 + os dois arquivos novos
    style.css                       ← visual da lista de anexos
    js/app.js                       ← o campo novo na janela do fichamento
    js/fichamento.js                ← a numeração pode começar depois do 1
    js/anexos.js                    ← NOVO — monta as páginas escaneadas
    vendor/pdf-lib.min.js           ← NOVO — lê e junta PDFs
    teste/teste-anexos.js           ← bateria nova
    teste/teste-caminho-e-marca.js  ← ajuste pequeno

`js/config-app.js` não está aqui, como sempre.

---

## Anexar página(s) escaneada(s)

Na janela **Gerar fichamento**, acima de "Modelo", há agora o campo
**"Anexar página(s) escaneada(s)"**.

O que ele aceita:

- **Print ou foto** da página do livro — JPG, PNG (e o HEIC do iPhone, no
  próprio iPhone).
- **PDF do scanner** — que é o que o scanner do celular e a copiadora costumam
  entregar. Se o PDF tiver várias páginas, todas entram, em ordem.

Você pode anexar **vários arquivos**, e apertar "Escolher" de novo **acrescenta**
à lista em vez de trocar — no celular raramente dá para mandar as três fotos de
uma vez só. A lista mostra a ordem numerada, e as setas ↑ ↓ mudam essa ordem: é
exatamente a ordem em que as páginas vão sair no PDF. O ✕ tira um arquivo.

### A contagem, que era o ponto do pedido

As páginas escaneadas são as **primeiras** do arquivo, e a contagem começa nelas:

- **Uma página escaneada só** → ela é a página **1**, com o "1" embaixo,
  centralizado, na própria folha do scan. O fichamento começa na **2**.
- **Quatro páginas escaneadas** → elas são as páginas **1 a 4**, e o fichamento
  começa na **5**.

Sai **um arquivo só**, com a numeração correndo do começo ao fim, como no modelo
do professor. A primeira folha traz o rótulo **"Print ou Xerox da Obra"** em
negrito no alto, também como no modelo.

### Por que cada página escaneada é redesenhada numa folha nova

Seria mais curto carimbar o número por cima do scan e pronto. Só que um scan que
sangra até a borda engoliria o número, e um PDF em tamanho carta ou ofício
deixaria o arquivo com folhas de tamanhos diferentes — feio de imprimir e de
entregar. Encaixando o escaneado dentro de uma folha A4 nossa, com o rodapé
reservado, **o número sempre aparece e o arquivo inteiro sai em A4**. A imagem é
encaixada sem distorcer: proporção preservada, centralizada.

### No Word não vai

As páginas escaneadas entram **só no PDF**. Se você escolher Word com arquivos
anexados, o app avisa na hora, em vermelho, logo abaixo da lista — o fichamento
sai, mas sem os scans. O modelo do professor é PDF, então imagino que seja por
ali que você vai entregar; se precisar disso no Word também, me diga que eu vejo.

---

## Um aviso sobre o tamanho do app

Para ler o PDF do scanner foi preciso trazer uma biblioteca nova
(`vendor/pdf-lib.min.js`, 512 KB). Duas decisões para isso não pesar:

- Ela **só é carregada quando você anexa alguma coisa**. Quem gera o fichamento
  sem anexo nunca paga por ela.
- Mas ela **fica guardada junto com o resto do app**, então anexar funciona
  também **sem internet**.

Na prática, a primeira atualização depois de publicar vai baixar meio megabyte a
mais. Depois disso, nada.

---

## Publicar

Copie os arquivos — **inclusive os dois novos** — e publique. O `sw.js` já está
na `v21`.

Se o celular teimar com a versão velha: **Configurações → Versão → "Buscar
atualização agora"**. A caixa acima do botão tem que dizer **v21**.

Nada mudou no Supabase.

---

## Conferido antes de entregar

13 baterias, **507 verificações, todas passando**. A nova
`teste/teste-anexos.js` (47 verificações) **gera PDFs de verdade e lê o arquivo
de volta** com as mesmas ferramentas que você usaria para conferir — não confia
no que a tela mostra. Entre outras coisas, ela prova que:

- com 2 imagens + um PDF de 2 páginas, o arquivo sai com as 4 escaneadas na
  frente, **na ordem da lista**, e o fichamento começando na página 5;
- **toda página tem número no pé, começando em 1 e sem pular nem repetir** — o
  teste lê os números um a um do arquivo gerado;
- anexar 1 página acrescenta exatamente 1 folha, e anexar 4 acrescenta exatamente
  4 — nem folha em branco sobrando, nem página do fichamento comida;
- com um scan só, o "1" está **na própria folha do scan**, não numa folha à
  parte;
- **a imagem não é distorcida**: o teste mede a proporção da mancha na folha e
  compara com a proporção original, com uma imagem em pé e outra deitada;
- um PDF em tamanho carta sai **convertido para A4** como todo o resto;
- **sem anexo nenhum, o fichamento sai exatamente como antes**, começando na
  página 1;
- anexar um arquivo que não é imagem nem PDF mostra um recado em português e
  deixa a janela aberta para corrigir, em vez de travar.
