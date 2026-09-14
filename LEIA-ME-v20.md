# Auxiliar de Pesquisa — v20 (só os arquivos alterados)

Este zip **não é o app inteiro** — são só os arquivos que mudaram. Copie-os por
cima dos que já estão no repositório, mantendo as pastas.

    index.html                    ← cor da barra do navegador
    manifest.json                 ← cor e ícones do app instalado
    sw.js                         ← versão v20
    style.css                     ← caminho clicável + paleta nova
    js/app.js                     ← caminho clicável + versão v20
    icons/icon-192.png            ← logo novo
    icons/icon-512.png            ← logo novo
    icons/icon-512-mascara.png    ← logo novo (versão para o Android recortar)
    teste/teste-caminho-e-marca.js   ← bateria nova
    teste/teste-lista-e-tema.js      ← ajuste pequeno

`js/config-app.js` não está aqui, como sempre: é o arquivo com as suas chaves
do Supabase, e o que está publicado continua valendo.

---

## 1. O caminho no alto virou a navegação

Antes:

    📂 Miqueias › Morte   [‹ voltar para Miqueias]

Agora:

    📂 Miqueias › 📁 Morte

O **nome da pasta de cima é o botão**. Apertar em "Miqueias" sobe um nível. O
botão "‹ voltar para Miqueias" deixou de existir — o caminho já fazia esse
trabalho, e um botão a mais só ocupava espaço.

Três detalhes de propósito:

- **A pasta em que você está agora não é botão.** "Morte", no exemplo, continua
  texto simples. Ela não leva a lugar nenhum, e virar botão só faria você
  apertar à toa.
- **Parece texto até o mouse chegar perto.** Só no passar do mouse é que
  "Miqueias" ganha fundo azul-claro. Quem já entendeu aperta; quem não entendeu
  não estranha uma tela cheia de botões.
- **Funciona pelo teclado**, com Tab e Enter, e o leitor de tela anuncia qual é
  a pasta atual.

Voltar pelo caminho também encerra a seleção de citações, igual ao botão antigo
— assim você não sai de uma pasta com coisas marcadas sem perceber.

## 2. O logo novo

Os três ícones do aplicativo foram refeitos com a imagem que você mandou (livro
aberto com a pena):

- `icon-192.png` e `icon-512.png` — o ícone comum, com margem folgada.
- `icon-512-mascara.png` — a versão "maskable". O Android recorta o ícone em
  círculo ou losango conforme o aparelho, e só garante os 80% do meio. Por isso
  nesta o desenho ocupa bem menos espaço: sem essa folga, a ponta da pena seria
  cortada. Há um teste que mede a distância do canto do desenho até o centro e
  reprova se ele passar do limite.

### A cor do aplicativo acompanhou o logo

O azul do app era `#1b4f72`, um azul-marinho que não existia no logo. Passou a
ser `#00628f` — o azul do próprio logo, um pouco aprofundado para continuar
legível como texto. É a cor dos botões, das pastas ativas e da barrinha do
navegador no celular. No tema escuro, o azul-claro do logo (`#74c4e9`).

**Se você só queria trocar o ícone e prefere a cor antiga de volta, é só me
dizer** — dá dois minutos.

### Um defeito que apareceu no caminho

Ao conferir as cores, achei um problema que já existia antes desta versão: no
**tema escuro**, o botão principal ("+ Nova citação", "Exportar arquivo") era
texto branco sobre azul-claro. Isso dá 2,5:1 de contraste, e o mínimo aceitável
para texto é 4,5:1 — ficava difícil de ler, especialmente no celular sob luz do
dia. Agora o texto em cima do azul escurece sozinho quando o tema é escuro
(8,4:1) e continua branco no tema claro (6,7:1). Está nas fotos que mandei.

---

## Publicar

Copie os arquivos, publique, e pronto — o `sw.js` já está na `v20` e os
aparelhos se atualizam sozinhos. Nada mudou no Supabase.

Se o celular teimar com a versão velha: **Configurações → Versão → "Buscar
atualização agora"**. A caixa acima do botão tem que dizer **v20**.

Um aviso sobre o ícone: o Android e o iPhone guardam o ícone de um app já
instalado com bastante teimosia. Se o logo antigo continuar na tela inicial
depois de atualizar, **desinstale e instale de novo** — é a única forma
garantida de trocar.

---

## Conferido antes de entregar

12 baterias de teste automático, **460 verificações, todas passando**, incluindo
a nova `teste/teste-caminho-e-marca.js` (38 verificações) que mede, entre outras
coisas:

- que apertar no nome da pasta de cima muda mesmo de pasta — não só a aparência:
  as subpastas reaparecem, a citação da mestra volta a aparecer e a da subpasta
  some;
- que a pasta atual não é botão e que o botão "voltar para..." sumiu mesmo;
- que dá para voltar pelo teclado;
- que as cores do logo estão de fato dentro dos PNGs e que o desenho do ícone
  maskable cabe no círculo que o Android recorta;
- **o contraste de cada texto sobre o azul, calculado pela fórmula da WCAG, nos
  dois temas** — é o teste que pegou o defeito do botão no escuro, e é o que
  impede que ele volte se algum dia a cor mudar de novo.
