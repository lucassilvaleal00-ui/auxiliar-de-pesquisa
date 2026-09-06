# Auxiliar de Pesquisa — Fase 1

Aplicativo local (PWA) de biblioteca de citações com geração automática de
referências em Turabian (9ª ed.) e ABNT (NBR 6023). Sem login e sem servidor:
tudo é gravado no aparelho do usuário, via IndexedDB.

**Leia o `COMO_COMECAR.pdf`** — ele explica o projeto inteiro, com um capítulo
detalhado sobre o banco de dados local.

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
    js/app.js        telas e comportamento
    vendor/          Dexie 4.4.5 (local, para funcionar offline)
    teste/           testes automáticos (Playwright)

## Testes

    npm install playwright
    node teste/teste.js       # 32 verificações na interface
    node teste/teste-api.js   # 19 verificações na busca automática
