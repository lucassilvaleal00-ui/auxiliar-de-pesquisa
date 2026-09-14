# Auxiliar de Pesquisa — versão v19

Duas coisas nesta entrega: a janela **"Gerar fichamento"** virou lista com
recuos, e a **troca de tema** ganhou lugar visível nas Configurações.

---

## 1. A janela do fichamento agora é uma lista

Antes as pastas ficavam lado a lado e a janela abria uma barra de rolagem
horizontal. Agora tudo desce de cima para baixo, e o recuo mostra quem está
dentro de quem:

    📂 Capítulo 1 — A queda              ← pasta mestra, na margem
        ☑ Abertura do capítulo           ← citação que está direto na mestra
      ↳ 📁 Argumentos centrais           ← subpasta, um degrau à frente
          ☑ A raiz do conflito
          ☑ Perseguição nos primeiros séculos
      ↳ 📁 Citações de apoio
          ☑ Nota de apoio
    📂 Capítulo 2 — A restauração
        ☑ A promessa
    📂 Soltas                            ← o que ainda não foi para pasta nenhuma
        ☑ Sem pasta ainda

Cada citação mostra o assunto, se é direta ou indireta, a página e as duas
primeiras linhas do texto. **Citação comprida é cortada com "…"** — a lista
serve para você reconhecer a citação, não para lê-la inteira ali.

Marcar e desmarcar continua igual: a caixinha da pasta marca ou desmarca tudo
que está dentro dela (incluindo as subpastas), e quando só parte está marcada a
caixinha da pasta fica com o tracinho do meio.

### O que tinha quebrado

A tela estava torta por um motivo específico, e vale registrar para não voltar:
o nome de classe `.sub`, criado na v17 para as subpastas da tela da obra, era
curto demais e batia com o `.sub` que o fichamento já usava. O `display: flex`
de uma vazava para a outra e jogava as citações para o lado. Agora as regras da
tela da obra estão presas ao `#obra-subpastas` e o fichamento usa o nome próprio
`fic-sub`. Há um teste que reprova se alguém criar de novo uma regra `.sub`
solta.

---

## 2. Troca de tema nas Configurações

A opção já existia, mas era uma listinha sem rótulo entre duas seções — por isso
passou despercebida. Agora, em **Configurações → Aparência**, são três botões
lado a lado:

    ☀️ Claro      🌙 Escuro      ⚙️ Automático

O escolhido fica marcado em azul. A troca vale na hora, sem recarregar, e fica
guardada **naquele aparelho** (não viaja pela nuvem: é razoável usar claro no
computador e escuro no celular).

"Automático" acompanha o que o aparelho já usa — se o celular estiver no modo
escuro à noite, o app acompanha sozinho. Escolher "Claro" ou "Escuro" manda no
aparelho: fica como você escolheu, independentemente do que o sistema diz.

---

## Como instalar esta versão

1. Substitua os arquivos do repositório pelos desta pasta.
2. **`js/config-app.js` não está no zip, de propósito** — é o arquivo com as
   suas chaves do Supabase. O que está publicado continua valendo.
3. Publique. O `sw.js` já está na `v19` e o app se atualiza sozinho.

Se o celular teimar em mostrar a versão velha: **Configurações → Versão →
"Buscar atualização agora"**. A caixa logo acima dela diz qual versão aquele
aparelho está rodando — tem que dizer **v19**.

Não é preciso mexer no Supabase desta vez: nada mudou no banco.

---

## Conferido antes de entregar

11 baterias de teste automático, **422 verificações, todas passando**, incluindo
a nova `teste/teste-lista-e-tema.js` (50 verificações) que mede:

- que a lista desce em bloco e não abre rolagem lateral em nenhum ponto;
- que a subpasta recua em relação à mestra, e a citação recua em relação à
  pasta em que está;
- que a citação comprida é cortada em duas linhas com "…" e a curta aparece
  inteira;
- que nenhuma regra `.sub` solta voltou ao CSS;
- que os três botões de tema trocam o visual na hora, guardam a escolha,
  sobrevivem a fechar e abrir o app, e que a escolha manual ganha do aparelho;
- que a janela do fichamento continua legível no tema escuro.
