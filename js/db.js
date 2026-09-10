/* ==========================================================================
   db.js — O banco de dados local (IndexedDB via Dexie)
   Auxiliar de Pesquisa — Fase 1
   --------------------------------------------------------------------------
   Tudo o que o cliente cadastra mora AQUI, dentro do aparelho dele.
   Nada disso vai para servidor nenhum.

   Leia o guia COMO_COMECAR.pdf, capítulo 4, antes de mexer neste arquivo.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Utilidades
   -------------------------------------------------------------------------- */

// Identificador único. NUNCA usar número automático (++id): quando o cliente
// restaurar um backup num aparelho que já tem dados, os números colidiriam e
// as citações grudariam no livro errado. Com UUID isso é impossível.
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Reserva para navegadores antigos (iOS 14, por exemplo)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const agora = () => new Date().toISOString();

// Texto pronto para busca: minúsculo, sem acento e sem pontuação.
// É o que faz "genesis" encontrar "Gênesis" e "sao paulo" encontrar "São Paulo".
function norm(txt) {
  return (txt || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // tira os acentos separados pelo NFD
                                       // (escrito escapado de propósito: escrever
                                       //  o caractere combinante direto no arquivo
                                       //  quebra em alguns editores)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Junta os pedaços pesquisáveis de uma obra num campo só.
function indiceLivro(l) {
  const autores = (l.autores || []).map(a => `${a.nome || ''} ${a.sobrenome || ''}`).join(' ');
  const orgs = (l.organizadores || []).map(a => `${a.nome || ''} ${a.sobrenome || ''}`).join(' ');
  const colabs = (l.colaboradores || []).map(a => `${a.nome || ''} ${a.sobrenome || ''}`).join(' ');
  return norm([l.titulo, l.subtitulo, l.titulo_original, autores, orgs,
               l.editora, l.periodico, l.instituicao, l.isbn, l.ano,
               l.genero, l.sobre, colabs, l.estado].join(' '));
}

function indiceCitacao(c) {
  return norm([c.texto, c.capitulo, c.assunto, c.nota_pessoal].join(' '));
}

/* Avisa a nuvem que houve mudança. Fica aqui, no banco, e não espalhado pelas
   telas: assim nenhum caminho novo de gravação esquece de avisar. A checagem
   é feita na hora da chamada porque o nuvem.js carrega depois deste arquivo. */
function mexeu() {
  if (window.Nuvem && window.Nuvem.LIGADA) window.Nuvem.agendar();
}

/** Anota que um registro foi excluído, para a nuvem levar a notícia adiante. */
async function enterrar(tabela, ids) {
  const lista = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!lista.length) return;
  const quando = agora();
  await db.excluidos.bulkPut(lista.map(id => ({ id, tabela, atualizado_em: quando })));
  mexeu();
}

/* --------------------------------------------------------------------------
   2. O banco
   --------------------------------------------------------------------------
   A string de cada tabela lista SÓ os campos indexados (os que dá para
   filtrar e ordenar rápido). Os outros campos são gravados normalmente,
   só não servem de índice.

   Legenda:
     id            → chave primária (o primeiro campo sempre é)
     categoria_id  → índice comum
     *tags         → índice múltiplo (reservado para o futuro)

   ATENÇÃO: mudar esta string exige subir o número da versão. Veja o
   capítulo 4.6 do guia (migrações).
-------------------------------------------------------------------------- */

const db = new Dexie('auxiliar_pesquisa');

db.version(1).stores({
  categorias: 'id, titulo, ordem, criado_em',
  livros:     'id, categoria_id, tipo, titulo, atualizado_em, criado_em, busca, incompleta',
  citacoes:   'id, livro_id, pagina, atualizado_em, criado_em',
  config:     'chave'
});

/* --------------------------------------------------------------------------
   Versão 2 — o fichamento (setembro de 2026)
   --------------------------------------------------------------------------
   Os índices não mudaram; o que mudou foram os dados:

   • citações: o tipo "parafrase" passou a se chamar "indireta", que é o nome
     usado nas normas e no modelo do professor;
   • citações ganharam "assunto" (a coluna do meio da tabela do fichamento);
   • obras ganharam "formato" (impresso/digital), "genero" (comentário
     bíblico, dicionário…) e "sobre" (de que trata a obra).

   O bloco `upgrade` roda UMA vez no aparelho de cada cliente, dentro de uma
   transação: ou converte tudo, ou não converte nada. Ninguém perde o que já
   tinha cadastrado.
-------------------------------------------------------------------------- */
db.version(2).stores({}).upgrade(async tx => {
  await tx.table('citacoes').toCollection().modify(c => {
    if (c.tipo === 'parafrase' || !c.tipo) c.tipo = 'indireta';
    if (c.assunto === undefined) c.assunto = '';
  });
  await tx.table('livros').toCollection().modify(l => {
    if (l.formato === undefined) l.formato = '';
    if (l.genero === undefined) l.genero = '';
    if (l.sobre === undefined) l.sobre = '';
  });
});

/* --------------------------------------------------------------------------
   Versão 3 — estado e colaboradores (setembro de 2026)
   --------------------------------------------------------------------------
   Duas coisas que as normas pedem e faltavam:

   • `estado` — a sigla que acompanha a cidade quando ela precisa de
     desambiguação: "Belém, PA: ...", "Cambridge, MA: ...";
   • `colaboradores` — pessoas que colaboraram sem serem autoras. Em Turabian
     entram como "com Fulano"; na ABNT, como "Colaboração de Fulano".

   Como os dois são campos novos (e não índices), o upgrade só garante que
   existam nos registros antigos, para o resto do código não precisar ficar
   perguntando se são nulos.
-------------------------------------------------------------------------- */
db.version(3).stores({}).upgrade(async tx => {
  await tx.table('livros').toCollection().modify(l => {
    if (l.estado === undefined) l.estado = '';
    if (!Array.isArray(l.colaboradores)) l.colaboradores = [];
  });
});

/* --------------------------------------------------------------------------
   Versão 4 — a lista de tipos de obra cresceu (setembro de 2026)
   --------------------------------------------------------------------------
   Antes eram seis tipos genéricos; agora são dez, com o nome que aparece no
   fichamento em "Tipo de Obra": Livro impresso, Livro digital (e-book),
   Artigo Científico, Revista acadêmica, Revista, Tese, Dissertação, Página da
   internet, Bíblia e Capítulo de livro.

   Cada obra antiga precisa apontar para um dos nomes novos. Onde havia
   informação para escolher, ela é usada:

   • livro  → livro_digital se `formato` dizia "digital"; senão livro_impresso;
   • artigo → artigo_cientifico (o mais comum na biblioteca do cliente);
   • tese   → dissertacao quando o grau falava em mestrado; senão tese.

   `capitulo`, `site` e `biblia` já tinham o nome certo e ficam como estão.
   O `formato` e o `genero` antigos não são apagados: o tipo passou a dizer o
   que eles diziam, mas jogar dado fora numa migração é o tipo de coisa que
   não tem volta.
-------------------------------------------------------------------------- */
db.version(4).stores({}).upgrade(async tx => {
  await tx.table('livros').toCollection().modify(l => {
    if (l.tipo === 'livro')  l.tipo = l.formato === 'digital' ? 'livro_digital' : 'livro_impresso';
    else if (l.tipo === 'artigo') l.tipo = 'artigo_cientifico';
    else if (l.tipo === 'tese')   l.tipo = /mestrado/i.test(l.grau || '') ? 'dissertacao' : 'tese';
  });
});

/* --------------------------------------------------------------------------
   Versão 5 — "e outros" nos colaboradores (setembro de 2026)
   --------------------------------------------------------------------------
   Uma obra pode ter uma dúzia de colaboradores, e as normas só pedem o
   primeiro seguido de "et al." quando são quatro ou mais. Obrigar a digitar
   os quatro só para chegar a essa forma era trabalho jogado fora; agora uma
   caixinha diz "são muitos, não vou escrever todos" e a referência já sai
   abreviada com um nome só.
-------------------------------------------------------------------------- */
db.version(5).stores({}).upgrade(async tx => {
  await tx.table('livros').toCollection().modify(l => {
    if (l.colaboradores_outros === undefined) l.colaboradores_outros = false;
  });
});

/* --------------------------------------------------------------------------
   Versão 6 — as lápides (setembro de 2026)
   --------------------------------------------------------------------------
   A partir daqui a biblioteca sobe para a nuvem, e apagar passa a ser um
   problema novo: se a obra simplesmente sumisse daqui, o outro aparelho — que
   ainda a tem — a mandaria de volta na próxima sincronização e ela
   ressuscitaria. Por isso toda exclusão deixa uma LÁPIDE: um registrinho
   dizendo "esta morreu, e quando".

   A lápide não atrapalha nada do que já existia: as telas continuam lendo as
   tabelas de sempre, que continuam sendo limpas de verdade.
-------------------------------------------------------------------------- */
db.version(6).stores({
  excluidos: 'id, tabela, atualizado_em'
});

/* --------------------------------------------------------------------------
   Versão 7 — pastas dentro da obra (setembro de 2026)
   --------------------------------------------------------------------------
   Uma obra de mil páginas rende dezenas de citações, e procurá-las numa lista
   corrida cansa. As pastas dividem essa lista POR ASSUNTO, dentro da obra:
   "Autoria", "Datação", "Uso no Novo Testamento".

   Não confundir com as CATEGORIAS, que são outra coisa: categoria agrupa
   OBRAS na biblioteca inteira; pasta agrupa CITAÇÕES dentro de uma obra só.
   Por isso `pastas` tem `livro_id`: uma pasta pertence a uma obra e some com
   ela.

   Citação sem pasta continua valendo — é o estado normal de quem não quiser
   organizar. `pasta_id` vazio significa "solta".
-------------------------------------------------------------------------- */
db.version(7).stores({
  pastas: 'id, livro_id, ordem, atualizado_em',
  // `citacoes` é redeclarada inteira porque ganhou o índice `pasta_id`. Sem o
  // índice, o Dexie recusa `where('pasta_id')` — e é assim que se conta quantas
  // citações há em cada pasta. Redeclarar exige repetir a lista toda: o que
  // não estiver aqui deixa de ser índice.
  citacoes: 'id, livro_id, pasta_id, pagina, atualizado_em, criado_em'
}).upgrade(async tx => {
  await tx.table('citacoes').toCollection().modify(c => {
    if (c.pasta_id === undefined) c.pasta_id = '';
  });
});

/* --------------------------------------------------------------------------
   3. Categorias
   -------------------------------------------------------------------------- */

const Categorias = {
  async listar() {
    const lista = await db.categorias.toArray();
    lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) ||
                          a.titulo.localeCompare(b.titulo, 'pt-BR'));
    return lista;
  },

  async obter(id) { return db.categorias.get(id); },

  async criar({ titulo, tema }) {
    if (!titulo || !titulo.trim()) throw new Error('A categoria precisa de um título.');
    const max = await db.categorias.count();
    const cat = {
      id: uuid(),
      titulo: titulo.trim(),
      tema: (tema || '').trim(),
      ordem: max,
      criado_em: agora(),
      atualizado_em: agora()
    };
    await db.categorias.add(cat);
    mexeu();
    return cat;
  },

  async editar(id, dados) {
    if (dados.titulo !== undefined && !dados.titulo.trim())
      throw new Error('A categoria precisa de um título.');
    await db.categorias.update(id, { ...dados, atualizado_em: agora() });
    mexeu();
  },

  // Excluir NUNCA apaga obra nenhuma (decisão P17). As obras ficam sem
  // categoria e reaparecem em "Sem categoria".
  async excluir(id) {
    return db.transaction('rw', db.categorias, db.livros, db.excluidos, async () => {
      await db.livros.where('categoria_id').equals(id)
                     .modify({ categoria_id: '', atualizado_em: agora() });
      await db.categorias.delete(id);
      await enterrar('categorias', id);
    });
  },

  async contarObras(id) {
    return db.livros.where('categoria_id').equals(id).count();
  }
};

/* --------------------------------------------------------------------------
   4. Obras (livros)
   -------------------------------------------------------------------------- */

// Campos obrigatórios por tipo de obra. Se faltar algum, a obra é salva
// assim mesmo e marcada como incompleta (decisão P19) — a busca automática
// quase nunca traz edição e cidade, e travar o cadastro faria o cliente
// perder o que digitou.
// Por FAMÍLIA (livro, capitulo, artigo, tese, site, biblia) — os dez tipos
// visíveis se reduzem a essas seis. O `grau` saiu da lista da tese: agora o
// próprio tipo (Tese ou Dissertação) já responde por ele.
const OBRIGATORIOS = {
  livro:    ['titulo', 'autores', 'editora'],
  capitulo: ['titulo', 'autores', 'titulo_obra', 'editora'],
  artigo:   ['titulo', 'autores', 'periodico', 'ano'],
  tese:     ['titulo', 'autores', 'instituicao', 'ano'],
  site:     ['titulo', 'url'],
  biblia:   ['versao_biblia']
};

function faltando(l) {
  const familia = window.Referencias ? window.Referencias.base(l) : l.tipo;
  const req = OBRIGATORIOS[familia] || OBRIGATORIOS.livro;
  return req.filter(campo => {
    const v = l[campo];
    if (Array.isArray(v)) return v.length === 0;
    return !v || !String(v).trim();
  });
}

const Livros = {
  novo() {
    return {
      id: uuid(),
      categoria_id: '',
      tipo: 'livro_impresso',
      titulo: '', subtitulo: '', titulo_original: '', titulo_obra: '',
      autores: [], organizadores: [], tradutores: [], revisores: [],
      colaboradores: [],   // 'com Fulano' (Turabian) / 'Colaboração de Fulano' (ABNT)
      colaboradores_outros: false,   // "são muitos": abrevia em "Fulano et al." 
      edicao: '', volume: '', ano: '', editora: '', cidade: '', estado: '',
      periodico: '', numero: '', paginas: '',
      instituicao: '', grau: '',
      url: '', doi: '', issn: '', isbn: '',
      data_acesso: '', versao_biblia: '',
      // `formato` e `genero` são herança: quem diz se a obra é impressa ou
      // digital agora é o próprio tipo. Ficam gravados para não quebrar
      // backups antigos, mas não aparecem mais no cadastro nem no fichamento.
      formato: '',
      genero: '',
      sobre: '',          // "de que trata a obra", do modelo de fichamento
      capa: null,        // Blob da imagem (preferido)
      capa_url: '',      // reserva: quando o navegador barra o download da capa
      incompleta: 0,
      busca: '',
      criado_em: agora(),
      atualizado_em: agora()
    };
  },

  async salvar(livro) {
    livro.busca = indiceLivro(livro);
    // O IndexedDB não indexa true/false. Guardamos 1 ou 0.
    livro.incompleta = faltando(livro).length ? 1 : 0;
    livro.atualizado_em = agora();
    if (!livro.criado_em) livro.criado_em = livro.atualizado_em;
    await db.livros.put(livro);
    mexeu();
    return livro;
  },

  async obter(id) { return db.livros.get(id); },

  // Lista paginada, das obras mexidas há menos tempo para as mais antigas
  // (decisão P16). O `offset` é o que faz a rolagem infinita.
  async listar({ categoria_id = null, termo = '', offset = 0, limite = 40 } = {}) {
    let col = db.livros.orderBy('atualizado_em').reverse();
    if (categoria_id !== null) col = col.filter(l => (l.categoria_id || '') === categoria_id);
    if (termo) {
      const t = norm(termo);
      col = col.filter(l => (l.busca || '').includes(t));
    }
    return col.offset(offset).limit(limite).toArray();
  },

  async contar({ categoria_id = null } = {}) {
    if (categoria_id === null) return db.livros.count();
    return db.livros.filter(l => (l.categoria_id || '') === categoria_id).count();
  },

  // Apagar a obra apaga as citações dela — as duas coisas na mesma transação,
  // para nunca sobrar citação órfã se o navegador fechar no meio.
  async excluir(id) {
    return db.transaction('rw', db.livros, db.citacoes, db.pastas, db.excluidos, async () => {
      // As citações também precisam de lápide, uma a uma: o outro aparelho
      // não tem como adivinhar que elas foram junto com a obra.
      const filhas = await db.citacoes.where('livro_id').equals(id).primaryKeys();
      const gavetas = await db.pastas.where('livro_id').equals(id).primaryKeys();
      await db.citacoes.where('livro_id').equals(id).delete();
      await db.pastas.where('livro_id').equals(id).delete();
      await db.livros.delete(id);
      await enterrar('citacoes', filhas);
      await enterrar('pastas', gavetas);
      await enterrar('livros', id);
    });
  },

  async mover(ids, categoria_id) {
    mexeu();
    return db.transaction('rw', db.livros, async () => {
      for (const id of ids) {
        await db.livros.update(id, { categoria_id, atualizado_em: agora() });
      }
    });
  },

  // Evita cadastrar o mesmo livro duas vezes.
  async duplicada(livro) {
    if (livro.isbn) {
      const porIsbn = await db.livros.filter(l => l.isbn === livro.isbn && l.id !== livro.id).first();
      if (porIsbn) return porIsbn;
    }
    const chave = norm(livro.titulo + ' ' + (livro.autores[0]?.sobrenome || ''));
    if (chave.length < 4) return null;
    return db.livros.filter(l => l.id !== livro.id &&
      norm(l.titulo + ' ' + (l.autores?.[0]?.sobrenome || '')) === chave).first();
  },

  faltando
};

/* --------------------------------------------------------------------------
   4b. Pastas (dentro de uma obra)
   --------------------------------------------------------------------------
   Mesma regra das categorias, e de propósito: apagar a pasta NUNCA apaga as
   citações dela — elas voltam a ficar soltas. Ninguém perde texto por ter
   reorganizado a gaveta.
   -------------------------------------------------------------------------- */

const Pastas = {
  async porLivro(livro_id) {
    const lista = await db.pastas.where('livro_id').equals(livro_id).toArray();
    lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) ||
                          (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR'));
    return lista;
  },

  async obter(id) { return db.pastas.get(id); },

  async criar({ livro_id, titulo }) {
    if (!titulo || !titulo.trim()) throw new Error('A pasta precisa de um nome.');
    const quantas = await db.pastas.where('livro_id').equals(livro_id).count();
    const pasta = {
      id: uuid(), livro_id, titulo: titulo.trim(), ordem: quantas,
      criado_em: agora(), atualizado_em: agora()
    };
    await db.pastas.add(pasta);
    mexeu();
    return pasta;
  },

  async editar(id, dados) {
    if (dados.titulo !== undefined && !dados.titulo.trim())
      throw new Error('A pasta precisa de um nome.');
    await db.pastas.update(id, { ...dados, atualizado_em: agora() });
    mexeu();
  },

  async excluir(id) {
    return db.transaction('rw', db.pastas, db.citacoes, db.excluidos, async () => {
      await db.citacoes.where('pasta_id').equals(id)
                       .modify({ pasta_id: '', atualizado_em: agora() });
      await db.pastas.delete(id);
      await enterrar('pastas', id);
    });
  },

  async contar(id) {
    return db.citacoes.where('pasta_id').equals(id).count();
  }
};

/* --------------------------------------------------------------------------
   5. Citações
   -------------------------------------------------------------------------- */

const Citacoes = {
  novo(livro_id) {
    return {
      id: uuid(),
      livro_id,
      pasta_id: '',        // vazio = solta, fora de qualquer pasta
      pagina: '',
      capitulo: '',
      assunto: '',         // a coluna "Assunto" da tabela do fichamento
      texto: '',
      tipo: 'direta',      // direta | indireta
      nota_pessoal: '',
      busca: '',
      criado_em: agora(),
      atualizado_em: agora()
    };
  },

  async salvar(c) {
    c.busca = indiceCitacao(c);
    c.atualizado_em = agora();
    if (!c.criado_em) c.criado_em = c.atualizado_em;
    await db.citacoes.put(c);
    mexeu();
    return c;
  },

  async obter(id) { return db.citacoes.get(id); },

  // Em ordem de página, como o documento pede. A página é texto (pode ser
  // "45-47" ou "xii"), então a ordenação usa o primeiro número encontrado.
  /**
   * @param pasta_id  null = todas · '' = só as soltas · id = só as daquela pasta
   */
  async porLivro(livro_id, termo = '', pasta_id = null) {
    let lista = await db.citacoes.where('livro_id').equals(livro_id).toArray();
    if (pasta_id !== null) lista = lista.filter(c => (c.pasta_id || '') === pasta_id);
    if (termo) {
      const t = norm(termo);
      lista = lista.filter(c => (c.busca || '').includes(t));
    }
    const num = p => {
      const m = String(p || '').match(/\d+/);
      return m ? parseInt(m[0], 10) : 999999;
    };
    lista.sort((a, b) => num(a.pagina) - num(b.pagina) ||
                          a.criado_em.localeCompare(b.criado_em));
    return lista;
  },

  async contar(livro_id) {
    return db.citacoes.where('livro_id').equals(livro_id).count();
  },

  async excluir(id) {
    return db.transaction('rw', db.citacoes, db.excluidos, async () => {
      await db.citacoes.delete(id);
      await enterrar('citacoes', id);
    });
  },

  // A pesquisa avançada (decisão P15): procura a frase dentro do texto de
  // todas as citações e devolve junto a obra de cada uma.
  async buscarNoTexto(termo, { limite = 200 } = {}) {
    const t = norm(termo);
    if (t.length < 2) return [];
    const achadas = [];
    await db.citacoes.each(c => {
      if ((c.busca || '').includes(t)) achadas.push(c);
    });
    achadas.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
    const corte = achadas.slice(0, limite);
    const livros = {};
    for (const c of corte) {
      if (!livros[c.livro_id]) livros[c.livro_id] = await db.livros.get(c.livro_id);
      c._livro = livros[c.livro_id];
    }
    return corte;
  }
};

/* --------------------------------------------------------------------------
   6. Configurações (uma linha por chave)
   -------------------------------------------------------------------------- */

const Config = {
  async ler(chave, padrao = null) {
    const linha = await db.config.get(chave);
    return linha ? linha.valor : padrao;
  },
  async gravar(chave, valor) {
    await db.config.put({ chave, valor });
  }
};

/* --------------------------------------------------------------------------
   7. Armazenamento persistente
   --------------------------------------------------------------------------
   Sem isso o navegador pode apagar o IndexedDB quando o aparelho ficar sem
   espaço. Pedir não garante — o navegador decide — mas em app instalado na
   tela inicial ele costuma conceder.
-------------------------------------------------------------------------- */

async function pedirPersistencia() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

async function espacoUsado() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usado: usage || 0, total: quota || 0 };
}

/* --------------------------------------------------------------------------
   8. Exportar e importar (decisão P7)
   --------------------------------------------------------------------------
   O arquivo é um JSON. As capas são Blobs, e Blob não cabe em JSON — então
   cada capa vira uma string base64 na exportação e volta a ser Blob na
   importação. Esse mesmo formato será o do backup no Google Drive (Fase 4).
-------------------------------------------------------------------------- */

// 1 → sem pastas · 2 → com pastas. O importador aceita os dois: um backup
// antigo simplesmente não traz pastas, e as citações dele ficam soltas.
const FORMATO_BACKUP = 2;

function blobParaBase64(blob) {
  return new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);          // "data:image/jpeg;base64,...."
    fr.onerror = erro;
    fr.readAsDataURL(blob);
  });
}

async function base64ParaBlob(dataUrl) {
  const resp = await fetch(dataUrl);
  return resp.blob();
}

async function exportarTudo() {
  const [categorias, livros, pastas, citacoes, config] = await Promise.all([
    db.categorias.toArray(), db.livros.toArray(), db.pastas.toArray(),
    db.citacoes.toArray(), db.config.toArray()
  ]);
  for (const l of livros) {
    if (l.capa instanceof Blob) l.capa = await blobParaBase64(l.capa);
  }
  return {
    formato: FORMATO_BACKUP,
    app: 'auxiliar-de-pesquisa',
    exportado_em: agora(),
    contagem: { categorias: categorias.length, livros: livros.length, citacoes: citacoes.length },
    categorias, livros, pastas, citacoes,
    config: config.filter(c => c.chave !== 'google_token')  // token não vai no backup
  };
}

/**
 * modo 'substituir' → apaga tudo o que está no aparelho e põe o do arquivo.
 * modo 'juntar'     → mantém o que existe; para registros com o mesmo id,
 *                     vence o que tiver `atualizado_em` mais recente.
 * (A restauração do Drive vai usar exatamente esta função — decisão P6.)
 */
async function importarTudo(dados, modo = 'juntar') {
  if (!dados || dados.app !== 'auxiliar-de-pesquisa')
    throw new Error('Este arquivo não é um backup do Auxiliar de Pesquisa.');
  if (dados.formato > FORMATO_BACKUP)
    throw new Error('Este backup foi feito numa versão mais nova do aplicativo. Atualize o app primeiro.');

  const livros = dados.livros || [];
  for (const l of livros) {
    if (typeof l.capa === 'string' && l.capa.startsWith('data:')) {
      try { l.capa = await base64ParaBlob(l.capa); } catch { l.capa = null; }
    }
  }

  return db.transaction('rw', db.categorias, db.livros, db.pastas, db.citacoes, db.config, async () => {
    if (modo === 'substituir') {
      await Promise.all([db.categorias.clear(), db.livros.clear(),
                         db.pastas.clear(), db.citacoes.clear()]);
      await db.categorias.bulkPut(dados.categorias || []);
      await db.livros.bulkPut(livros);
      await db.pastas.bulkPut(dados.pastas || []);
      await db.citacoes.bulkPut(dados.citacoes || []);
      mexeu();
      return { categorias: (dados.categorias || []).length, livros: livros.length,
               citacoes: (dados.citacoes || []).length, ignorados: 0 };
    }

    let ignorados = 0;
    const mesclar = async (tabela, registros) => {
      let gravados = 0;
      for (const r of registros) {
        const atual = await tabela.get(r.id);
        if (!atual || (r.atualizado_em || '') > (atual.atualizado_em || '')) {
          await tabela.put(r); gravados++;
        } else ignorados++;
      }
      return gravados;
    };
    const c1 = await mesclar(db.categorias, dados.categorias || []);
    const c2 = await mesclar(db.livros, livros);
    await mesclar(db.pastas, dados.pastas || []);
    const c3 = await mesclar(db.citacoes, dados.citacoes || []);
    mexeu();
    return { categorias: c1, livros: c2, citacoes: c3, ignorados };
  });
}

/* --------------------------------------------------------------------------
   9. Dados de demonstração (só para você ver o app funcionando)
   -------------------------------------------------------------------------- */

async function semearExemplos() {
  if (await db.livros.count()) return false;

  const cat = await Categorias.criar({ titulo: 'Escatologia', tema: 'Estudos sobre o fim' });
  const cat2 = await Categorias.criar({ titulo: 'Metodologia', tema: 'Pesquisa e escrita' });

  const l1 = Livros.novo();
  Object.assign(l1, {
    categoria_id: cat.id, tipo: 'livro_impresso',
    titulo: 'O Grande Conflito', autores: [{ nome: 'Ellen G.', sobrenome: 'White' }],
    edicao: '3', cidade: 'Tatuí', editora: 'Casa Publicadora Brasileira', ano: '2007'
  });
  await Livros.salvar(l1);

  const l2 = Livros.novo();
  Object.assign(l2, {
    categoria_id: cat2.id, tipo: 'artigo_cientifico',
    titulo: 'A pesquisa teológica e seus métodos',
    autores: [{ nome: 'Paulo', sobrenome: 'Zukowski' }],
    periodico: 'Revista Teológica', volume: '12', numero: '2',
    paginas: '45-67', ano: '2024', cidade: 'Belém'
  });
  await Livros.salvar(l2);

  const c1 = Citacoes.novo(l1.id);
  Object.assign(c1, {
    pagina: '45', capitulo: 'A destruição de Jerusalém',
    texto: 'A história do passado é a garantia do futuro.'
  });
  await Citacoes.salvar(c1);

  const c2 = Citacoes.novo(l1.id);
  Object.assign(c2, {
    pagina: '112', capitulo: 'Um período de trevas espirituais',
    texto: 'A verdade não perde nada quando é examinada de perto.'
  });
  await Citacoes.salvar(c2);

  return true;
}

/* Exposto para o resto do app e para você testar no console do navegador. */
/* Grava um registro que veio da nuvem, recalculando o que é derivado (índice
   de busca, marca de incompleta). Não mexe em `atualizado_em`: a data que vale
   é a de quem editou, não a de quem recebeu. */
async function gravarDaNuvem(tabela, registro) {
  if (tabela === 'livros') {
    registro.busca = indiceLivro(registro);
    registro.incompleta = faltando(registro).length ? 1 : 0;
  } else if (tabela === 'citacoes') {
    registro.busca = indiceCitacao(registro);
  }
  await db.table(tabela).put(registro);
}

/* Apaga um registro porque a nuvem avisou que ele morreu — sem criar lápide
   nova (a notícia já veio de fora; devolvê-la daria uma volta sem fim). */
async function apagarDaNuvem(tabela, id) {
  await db.table(tabela).delete(id);
}

window.DB = {
  db, uuid, norm, agora,
  Categorias, Pastas, Livros, Citacoes, Config,
  exportarTudo, importarTudo, semearExemplos,
  pedirPersistencia, espacoUsado, FORMATO_BACKUP,
  enterrar, gravarDaNuvem, apagarDaNuvem
};
