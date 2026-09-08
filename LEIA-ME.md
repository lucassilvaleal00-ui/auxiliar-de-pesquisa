# Auxiliar de Pesquisa — Fases 1 e 3

Aplicativo (PWA) de biblioteca de citações com geração automática de
referências em Turabian (9ª ed.) e ABNT (NBR 6023). As obras e citações ficam
sempre no aparelho do usuário, via IndexedDB — nunca em servidor.

Leia os dois guias:
- **`COMO_COMECAR.pdf`** — o projeto inteiro, com um capítulo detalhado sobre o
  banco de dados local (IndexedDB).
- **`COMO_LIGAR_O_LOGIN.pdf`** — passo a passo do Supabase: contas, licenças e
  painel de usuários.

Enquanto `js/config-app.js` estiver vazio, o app roda **sem login**, como na
Fase 1. Preencheu, o login entra em vigor.

## Rodar

Não abra o index.html com dois cliques (file:// quebra o service worker).
Sirva a pasta por http:

    python -m http.server 8080
    # depois: http://localhost:8080

## Publicar

Repositório público no GitHub → Settings → Pages → main / (root).
**A cada nova publicação, mude `const VERSAO` no `sw.js`.**

## Arquivos

    index.html     estrutura das telas
    style.css      visual (claro/escuro, celular/computador)
    manifest.json  dados de instalação do PWA
    sw.js          service worker (offline + instalar)
    js/db.js         banco local: tabelas, CRUD, exportar/importar
    js/referencias.js 5 formatos × 6 tipos de obra
    js/api.js        Google Books + Open Library
    js/auth.js       login e licença (Supabase)
    js/config-app.js as duas chaves do Supabase (você preenche)
    js/app.js        telas e comportamento
    painel/          painel de usuários (só administrador)
    supabase/        schema.sql + Edge Function admin (colar no Supabase)
    vendor/          Dexie 4.4.5 (local, para funcionar offline)
    teste/           testes automáticos (Playwright)

## Testes

    npm install playwright
    node teste/teste.js       # 32 verificações na interface
    node teste/teste-api.js   # 23 verificações na busca automática
    node teste/teste-login.js # 31 verificações em login, licença e painel
