/* ==========================================================================
   sw.js — Service worker
   --------------------------------------------------------------------------
   É ele que faz o app (1) poder ser instalado e (2) abrir sem internet.

   >>> REGRA DE OURO: toda vez que você publicar uma correção, MUDE o número
   >>> da VERSAO abaixo. Sem isso o navegador continua servindo os arquivos
   >>> velhos que guardou, e o cliente não vê a sua correção.
   ========================================================================== */

const VERSAO = 'v8';
const CACHE = `auxiliar-pesquisa-${VERSAO}`;

// Tudo o que o app precisa para abrir sem internet.
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './vendor/dexie.min.js',
  './vendor/jspdf.umd.min.js',
  './js/config-app.js',
  './js/db.js',
  './js/auth.js',
  './js/fichamento.js',
  './js/referencias.js',
  './js/api.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 1. Instalação: guarda os arquivos no cache.
self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

// 2. Ativação: joga fora os caches das versões anteriores.
self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// 3. Cada pedido do app passa por aqui.
self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Chamadas ao Google Books / Open Library e download de capas NUNCA entram
  // no cache: são de outros servidores e precisam de internet de verdade.
  if (url.origin !== self.location.origin) return;

  // Navegação (abrir o app): tenta a rede, cai para o cache quando offline.
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Demais arquivos do app: cache primeiro (rápido), rede como reserva.
  evento.respondWith(
    caches.match(req).then(resp => resp || fetch(req).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return r;
    }))
  );
});
