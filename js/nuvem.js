/* ==========================================================================
   nuvem.js — A biblioteca nos dois lugares ao mesmo tempo
   --------------------------------------------------------------------------
   O aparelho continua sendo o dono do que é usado: tudo é lido e escrito no
   IndexedDB, e o app abre sem internet como sempre abriu. Este arquivo só faz
   uma coisa, de tempos em tempos: comparar o aparelho com a nuvem e acertar
   os dois lados.

   COMO A CONVERSA FUNCIONA

   Cada registro tem duas datas, e a diferença entre elas é o coração disto:

     atualizado_em — relógio do APARELHO que editou. É quem decide o vencedor
                     quando a mesma obra foi mexida em dois lugares: a edição
                     mais recente sobrepõe a antiga.
     servidor_em   — relógio do SERVIDOR, escrito por gatilho no banco. Serve
                     só de marcador: "me dê o que mudou depois disto".

   Por que não usar uma data só? Porque o relógio do celular pode estar
   errado. Se o marcador dependesse dele, um aparelho adiantado gravaria um
   marcador no futuro e nunca mais receberia nada. O relógio do servidor é o
   mesmo para todos os aparelhos — por isso é ele que marca o lugar.

   EXCLUIR É UM PROBLEMA PRÓPRIO

   Some a obra daqui, mas o outro celular ainda a tem: na próxima conversa ele
   a mandaria de volta e ela ressuscitaria. Por isso apagar deixa uma LÁPIDE
   (tabela `excluidos` no aparelho, coluna `apagado_em` no servidor). A lápide
   viaja como qualquer outro registro, e é o que faz a exclusão pegar nos dois
   aparelhos.

   ORDEM: ENVIAR, DEPOIS RECEBER

   Enviar primeiro deixa o servidor com a nossa versão mais nova antes de a
   gente pedir a dele — assim, se houver disputa, a comparação já acontece com
   as duas versões na mesa.
   ========================================================================== */

(function () {

const { db, Config, agora, gravarDaNuvem, apagarDaNuvem } = window.DB;

const TABELAS = ['categorias', 'livros', 'citacoes'];

/* Lote de envio. Precisa ser MENOR que a página de leitura (abaixo): todas as
   linhas de um mesmo lote recebem o mesmo `servidor_em`, e a leitura pagina
   por essa data. Se um lote coubesse inteiro numa página, a paginação poderia
   ficar rodando no mesmo ponto para sempre. */
const LOTE = 100;
const PAGINA = 500;

const CHAVE_CURSOR  = t => `nuvem_cursor_${t}`;   // último servidor_em recebido
const CHAVE_ENVIADO = 'nuvem_enviado';            // até quando já mandamos
const CHAVE_PRIMEIRA = 'nuvem_primeira_vez';      // já perguntamos sobre o acervo local?

const LIGADA = !!(window.Auth && window.Auth.LIGADO);

/* --------------------------------------------------------------- estado
   Uma única fonte de verdade sobre o que está acontecendo, para a tela poder
   mostrar sem ter que adivinhar. */
const estado = {
  ligada: LIGADA,
  rodando: false,
  ultimo: null,        // ISO da última sincronização que deu certo
  erro: '',            // mensagem da última falha (vazio = tudo bem)
  enviados: 0,
  recebidos: 0
};

const ouvintes = new Set();
function avisar() { ouvintes.forEach(f => { try { f(estado); } catch { /* nada */ } }); }
function aoMudar(f) { ouvintes.add(f); return () => ouvintes.delete(f); }

/* ------------------------------------------------------------- transporte */

function base() { return window.Auth.BASE; }

/** Chamada crua: devolve a resposta inteira, para dar conta de imagem também. */
async function bruto(caminho, opcoes = {}, token) {
  const resp = await fetch(`${base()}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: window.Auth.ANON,
      Authorization: `Bearer ${token}`,
      ...(opcoes.headers || {})
    }
  });
  if (!resp.ok) {
    let detalhe = '';
    try { detalhe = (await resp.text()).slice(0, 300); } catch { /* nada */ }
    throw new Error(explicar(resp.status, detalhe));
  }
  return resp;
}

async function json(caminho, opcoes = {}, token) {
  const resp = await bruto(caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  }, token);
  const texto = await resp.text();
  return texto ? JSON.parse(texto) : null;
}

// As mensagens cruas do PostgREST não dizem nada a quem está usando o app.
function explicar(status, detalhe) {
  const d = String(detalhe || '').toLowerCase();
  if (status === 401 || status === 403) {
    if (d.includes('row-level security') || d.includes('violates'))
      return 'O servidor recusou a gravação. Falta rodar o arquivo ' +
             'supabase/schema-nuvem.sql no seu projeto do Supabase.';
    return 'Sua sessão expirou. Entre de novo.';
  }
  if (status === 404) {
    if (d.includes('bucket'))
      return 'A pasta das capas não existe no Supabase. Rode o arquivo ' +
             'supabase/schema-nuvem.sql — ele cria o balde "capas".';
    return 'As tabelas da nuvem ainda não existem. Rode o arquivo ' +
           'supabase/schema-nuvem.sql no SQL Editor do Supabase.';
  }
  if (status === 413) return 'Uma capa ficou grande demais para o servidor aceitar.';
  if (status >= 500)  return 'O servidor do Supabase não respondeu agora. Vou tentar de novo depois.';
  return `O servidor respondeu ${status}.`;
}

/* ------------------------------------------------------ conversão de forma
   No aparelho a obra é um objeto solto com dezenas de campos. No banco, o que
   vira coluna é só o que precisa ser filtrado; o resto vai junto num `dados`
   em JSON. É o que permite acrescentar um campo novo no cadastro sem ter que
   mexer no banco e republicar tudo na ordem certa — como já aconteceu com
   "estado" e "colaboradores".
--------------------------------------------------------------------------*/

// `capa` é imagem (vai para o Storage) e `busca`/`incompleta` são calculados
// na hora de gravar — nenhum dos três precisa trafegar.
const FORA = ['capa', 'busca', 'incompleta'];

function paraNuvem(tabela, r, uid) {
  const comum = {
    id: r.id,
    usuario_id: uid,
    apagado_em: null,
    criado_em: r.criado_em || r.atualizado_em,
    atualizado_em: r.atualizado_em
  };
  if (tabela === 'categorias') {
    return { ...comum, titulo: r.titulo || '', tema: r.tema || '', ordem: r.ordem ?? 0 };
  }
  const dados = {};
  for (const [k, v] of Object.entries(r)) {
    if (FORA.includes(k)) continue;
    if (['id', 'criado_em', 'atualizado_em', 'capa_caminho', 'capa_sync'].includes(k)) continue;
    dados[k] = v;
  }
  if (tabela === 'livros') {
    return {
      ...comum,
      // No aparelho, "sem categoria" é texto vazio; a coluna do banco é uuid,
      // e uuid vazio não existe — ali o vazio se chama null.
      categoria_id: r.categoria_id || null,
      titulo: r.titulo || '',
      capa_caminho: r.capa_caminho || null,
      dados
    };
  }
  return { ...comum, livro_id: r.livro_id || null, dados };
}

function daNuvem(tabela, linha) {
  if (tabela === 'categorias') {
    return {
      id: linha.id, titulo: linha.titulo || '', tema: linha.tema || '',
      ordem: linha.ordem ?? 0,
      criado_em: linha.criado_em, atualizado_em: linha.atualizado_em
    };
  }
  const r = { ...(linha.dados || {}), id: linha.id,
              criado_em: linha.criado_em, atualizado_em: linha.atualizado_em };
  if (tabela === 'livros') {
    r.categoria_id = linha.categoria_id || '';
    r.titulo = linha.titulo || r.titulo || '';
    r.capa_caminho = linha.capa_caminho || '';
  } else {
    r.livro_id = linha.livro_id || '';
  }
  return r;
}

/* ------------------------------------------------------------------ capas */

const caminhoCapa = (uid, id) => `${uid}/${id}.jpg`;

async function enviarCapa(livro, uid, token) {
  if (!(livro.capa instanceof Blob)) return livro.capa_caminho || null;
  // Já mandamos esta versão? A marca é a data da última edição da obra.
  if (livro.capa_caminho && livro.capa_sync === livro.atualizado_em) return livro.capa_caminho;

  const caminho = caminhoCapa(uid, livro.id);
  await bruto(`/storage/v1/object/capas/${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': livro.capa.type || 'image/jpeg', 'x-upsert': 'true' },
    body: livro.capa
  }, token);

  // Grava direto na tabela, sem passar por `Livros.salvar`: salvar carimbaria
  // um `atualizado_em` novo, a obra pareceria alterada e voltaria à fila de
  // envio na próxima rodada — um vaivém que nunca acabaria.
  const atual = await db.livros.get(livro.id);
  if (atual) {
    atual.capa_caminho = caminho;
    atual.capa_sync = livro.atualizado_em;
    await db.livros.put(atual);
  }
  return caminho;
}

async function baixarCapa(livro, token) {
  if (!livro.capa_caminho) return;
  const resp = await bruto(`/storage/v1/object/capas/${livro.capa_caminho}`, { method: 'GET' }, token);
  livro.capa = await resp.blob();
  livro.capa_sync = livro.atualizado_em;
}

/* ----------------------------------------------------------------- enviar */

async function enviar(uid, token) {
  // Marca o começo ANTES de ler: o que for editado enquanto isto roda tem
  // data maior e entra na próxima rodada, em vez de se perder.
  const comeco = agora();
  const desde = await Config.ler(CHAVE_ENVIADO, '');
  let total = 0;

  for (const tabela of TABELAS) {
    const mudados = await db.table(tabela)
      .filter(r => (r.atualizado_em || '') > desde && (r.atualizado_em || '') <= comeco)
      .toArray();

    for (let i = 0; i < mudados.length; i += LOTE) {
      const pedaco = mudados.slice(i, i + LOTE);

      if (tabela === 'livros') {
        for (const l of pedaco) {
          try { l.capa_caminho = await enviarCapa(l, uid, token); }
          catch (e) {
            // Capa que não sobe não pode segurar a obra: o texto é o que
            // importa. A capa tenta de novo na próxima edição.
            console.warn('Capa não enviada:', e.message);
          }
        }
      }

      await json(`/rest/v1/${tabela}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(pedaco.map(r => paraNuvem(tabela, r, uid)))
      }, token);
      total += pedaco.length;
    }
  }

  // as lápides
  const lapides = await db.excluidos
    .filter(x => (x.atualizado_em || '') > desde && (x.atualizado_em || '') <= comeco).toArray();
  for (const tabela of TABELAS) {
    const minhas = lapides.filter(x => x.tabela === tabela);
    for (let i = 0; i < minhas.length; i += LOTE) {
      const pedaco = minhas.slice(i, i + LOTE);
      await json(`/rest/v1/${tabela}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(pedaco.map(x => ({
          id: x.id, usuario_id: uid,
          apagado_em: x.atualizado_em, atualizado_em: x.atualizado_em,
          // O conteúdo vai embora junto: guardar o texto de uma obra apagada
          // seria ocupar espaço com o que ninguém vai mais ler.
          ...(tabela === 'categorias' ? { titulo: null } : { dados: {} })
        })))
      }, token);
      total += pedaco.length;
    }
  }

  await Config.gravar(CHAVE_ENVIADO, comeco);
  return total;
}

/* ---------------------------------------------------------------- receber */

async function receber(token) {
  let total = 0;

  for (const tabela of TABELAS) {
    let cursor = await Config.ler(CHAVE_CURSOR(tabela), '1970-01-01T00:00:00Z');

    for (;;) {
      const linhas = await json(
        `/rest/v1/${tabela}?select=*` +
        `&servidor_em=gt.${encodeURIComponent(cursor)}` +
        `&order=servidor_em.asc&limit=${PAGINA}`,
        { method: 'GET' }, token);

      if (!linhas || !linhas.length) break;

      for (const linha of linhas) {
        if (linha.apagado_em) {
          await apagarDaNuvem(tabela, linha.id);
          continue;
        }
        const local = await db.table(tabela).get(linha.id);
        // Quem venceu? A edição mais recente. Empate mantém o que já está
        // aqui — trocar por igual só geraria escrita à toa.
        if (local && (local.atualizado_em || '') >= (linha.atualizado_em || '')) continue;

        const registro = daNuvem(tabela, linha);
        if (tabela === 'livros') {
          // A capa do aparelho é reaproveitada quando já é desta versão;
          // senão, busca a de lá.
          if (local && local.capa instanceof Blob && local.capa_sync === registro.atualizado_em) {
            registro.capa = local.capa;
            registro.capa_sync = local.capa_sync;
          } else if (registro.capa_caminho) {
            try { await baixarCapa(registro, token); }
            catch (e) { console.warn('Capa não baixada:', e.message); }
          }
        }
        await gravarDaNuvem(tabela, registro);
        total++;
      }

      cursor = linhas[linhas.length - 1].servidor_em;
      await Config.gravar(CHAVE_CURSOR(tabela), cursor);
      if (linhas.length < PAGINA) break;
    }
  }
  return total;
}

/* ------------------------------------------------------------ o comandante */

let rodando = null;   // a promessa da rodada em andamento, se houver

async function sincronizar({ silencioso = true } = {}) {
  if (!LIGADA) return { pulou: 'sem-login' };
  if (rodando) return rodando;               // já tem uma rodando: use aquela

  rodando = (async () => {
    const sessao = await window.Auth.renovarSePreciso();
    if (!sessao) return { pulou: 'sem-sessao' };

    estado.rodando = true; estado.erro = ''; avisar();
    try {
      const uid = sessao.usuario.id;
      const token = sessao.access_token;
      const enviados = await enviar(uid, token);
      const recebidos = await receber(token);

      estado.enviados = enviados;
      estado.recebidos = recebidos;
      estado.ultimo = agora();
      await Config.gravar('nuvem_ultimo', estado.ultimo);
      return { enviados, recebidos };

    } catch (e) {
      estado.erro = e.message || String(e);
      if (!silencioso) throw e;
      return { erro: estado.erro };
    } finally {
      estado.rodando = false;
      rodando = null;
      avisar();
    }
  })();

  return rodando;
}

/* Chamada a cada alteração. Espera um pouco de propósito: quem cadastra uma
   obra costuma cadastrar a citação logo em seguida, e não faz sentido abrir
   uma conversa com o servidor a cada tecla. */
let relogio = null;
function agendar(ms = 4000) {
  if (!LIGADA) return;
  clearTimeout(relogio);
  relogio = setTimeout(() => sincronizar().then(depoisDeSincronizar), ms);
}

let aoTerminar = null;
function depoisDeSincronizar(r) {
  if (r && r.recebidos && aoTerminar) aoTerminar(r);
}

/* ------------------------------------------------- primeira vez do aparelho
   Havia obras aqui antes de a nuvem existir. Elas não têm dono ainda: a
   primeira sincronização é que as adota. Perguntar antes é de propósito —
   num aparelho emprestado, o acervo de outra pessoa iria parar na sua conta
   sem você perceber.
--------------------------------------------------------------------------*/

async function acervoLocalOrfao() {
  if (await Config.ler(CHAVE_PRIMEIRA, false)) return 0;
  if (await Config.ler(CHAVE_ENVIADO, '')) return 0;   // já sincronizou alguma vez
  return db.livros.count();
}

async function marcarPrimeiraResolvida() {
  await Config.gravar(CHAVE_PRIMEIRA, true);
}

/** Recomeça do zero: esquece o que já foi conversado e rebaixa tudo de novo. */
async function esquecerMarcadores() {
  for (const t of TABELAS) await Config.gravar(CHAVE_CURSOR(t), '1970-01-01T00:00:00Z');
  await Config.gravar(CHAVE_ENVIADO, '');
}

/** O acervo local passa a pertencer a esta conta, sem reenviar o que já foi. */
async function adotarAcervoLocal() {
  await Config.gravar(CHAVE_ENVIADO, '');
  await marcarPrimeiraResolvida();
}

/** Descarta o local e fica só com o que houver na conta. */
async function descartarAcervoLocal() {
  await db.transaction('rw', db.categorias, db.livros, db.citacoes, db.excluidos, async () => {
    await Promise.all([db.categorias.clear(), db.livros.clear(),
                       db.citacoes.clear(), db.excluidos.clear()]);
  });
  await esquecerMarcadores();
  await Config.gravar(CHAVE_ENVIADO, agora());   // nada local para enviar
  await marcarPrimeiraResolvida();
}

/** Sair da conta: os dados ficam no aparelho (decisão P12), mas os marcadores
    somem — a próxima conta que entrar aqui começa a conversa do zero. */
async function aoSair() {
  await esquecerMarcadores();
  await Config.gravar(CHAVE_PRIMEIRA, false);
  estado.ultimo = null; estado.erro = ''; avisar();
}

async function carregarUltimo() {
  estado.ultimo = await Config.ler('nuvem_ultimo', null);
  avisar();
}

window.Nuvem = {
  LIGADA, estado, aoMudar,
  sincronizar, agendar, carregarUltimo,
  acervoLocalOrfao, adotarAcervoLocal, descartarAcervoLocal,
  marcarPrimeiraResolvida, esquecerMarcadores, aoSair,
  set aoReceber(f) { aoTerminar = f; }
};

})();
