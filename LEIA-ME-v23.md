# Auxiliar de Pesquisa — v23 (só os arquivos alterados)

    sw.js                  ← versão v23
    js/app.js              ← o campo novo no cadastro
    js/referencias.js      ← o link entrando nas referências
    teste/teste-ebook.js   ← bateria nova
    teste/teste-anexos.js  ← ajuste pequeno

`js/config-app.js` não está aqui, como sempre.

---

## "Disponível em" no livro digital

No cadastro, escolhendo **Livro digital (e-book)**, aparece no fim do formulário:

    Disponível em (link do e-book)
    [                                        ]
    O endereço de onde você leu o livro. Na ABNT sai como
    "Disponível em:"; no Turabian, como o link no fim da referência.

    Data de acesso
    [            ]

O campo **não aparece no Livro impresso** — pedir o link de um livro de papel
só confundiria. E ele não é obrigatório: dá para salvar a obra sem preencher.

Se você trocar o tipo de digital para impresso e voltar, **o link continua lá**.
Ele é guardado no mesmo lugar que o app já usava para endereços de artigos e
sites, então nada se perde no caminho.

### O que sai em cada norma

Com o link preenchido (e a data de acesso, quando houver):

**Turabian — nota de rodapé**

> Walter Kaiser, *Teologia do Antigo Testamento*, 2ª ed. (São Paulo, SP: Vida
> Nova, 2018), 45, https://books.google.com/books?id=ABC123.

**Turabian — bibliografia**

> Kaiser, Walter. *Teologia do Antigo Testamento*. 2ª ed. São Paulo, SP: Vida
> Nova, 2018. https://books.google.com/books?id=ABC123.

**ABNT — referência**

> KAISER, Walter. Teologia do Antigo Testamento. 2. ed. São Paulo, SP: Vida
> Nova, 2018. Disponível em: https://books.google.com/books?id=ABC123. Acesso
> em: 16 set. 2026.

Duas coisas que **não** levam o link, de propósito:

- **A forma abreviada do Turabian** ("Kaiser, *Teologia do Antigo Testamento*,
  45."). Ela existe para encurtar a repetição; repetir o endereço em toda nota
  seguinte desfaria o propósito. A primeira nota já deu o endereço.
- **A chamada no texto da ABNT** — "(KAISER, 2018, p. 45)". No sistema
  autor-data o endereço vive na lista de referências, não no meio do parágrafo.

### Por que a data de acesso veio junto

Não foi pedido, mas a **ABNT NBR 6023 pede "Acesso em:" sempre que há
"Disponível em:"** — sem ela a referência fica incompleta na correção. É
opcional no formulário: se você deixar em branco, sai só o "Disponível em:", sem
um "Acesso em:" vazio. O Turabian 9 não exige data de acesso para e-book com ano
de publicação, então lá ela não aparece mesmo.

### Uma dúvida que vale você conferir com o professor

Algumas faculdades pedem que a referência ABNT de e-book traga a palavra
**"E-book."** antes do "Disponível em:", assim:

> ... Vida Nova, 2018. E-book. Disponível em: ...

A NBR 6023 admite descrever o suporte, mas **não obriga**, e os manuais variam.
Deixei **de fora** porque você pediu o "Disponível em" e não isso. **Se o seu
professor cobrar, me avise que eu acrescento** — é rápido.

---

## Publicar

Copie os arquivos e publique. O `sw.js` já está na `v23`.

Se o celular teimar com a versão velha: **Configurações → Versão → "Buscar
atualização agora"**. A caixa acima do botão tem que dizer **v23**.

Nada mudou no Supabase, e **nenhuma obra que você já cadastrou muda de
referência** — o campo é novo e começa vazio.

---

## Conferido antes de entregar

14 baterias, **552 verificações, todas passando**. A nova
`teste/teste-ebook.js` (41 verificações) confere, entre outras coisas:

- que o campo **aparece no digital e não aparece no impresso**;
- que **trocar o tipo não apaga** o que você já digitou;
- **as cinco referências**, uma a uma: onde o link entra em cada uma, e que a
  vírgula e o ponto caem no lugar certo;
- que o **livro impresso continua exatamente como era** — a comparação é
  literal, caractere por caractere, entre o impresso e um digital sem link;
- que link **sem** data de acesso não gera um "Acesso em:" vazio;
- que o link é gravado e **reaparece ao reabrir a obra**.
