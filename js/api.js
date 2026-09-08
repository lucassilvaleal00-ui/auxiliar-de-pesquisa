/* ==========================================================================
   api.js — Busca de obras no Google Books e na Open Library
   --------------------------------------------------------------------------
   As duas APIs são gratuitas, não pedem chave e aceitam chamada direta do
   navegador.

   IMPORTANTE, e está no parecer: elas NÃO trazem a maior parte dos campos
   que a norma exige. Espere receber título, subtítulo, autores (num texto
   só), editora, ano, ISBN e capa. Cidade, edição, tradutor, volume, ISSN e
   DOI quase nunca vêm. Por isso o formulário abre preenchido com o que veio
   e destaca o que falta (decisão P19).
   ========================================================================== */

(function () {

  const TEMPO_LIMITE = 12000;   // 12 segundos por consulta

  async function buscarJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) {
        // As duas APIs explicam o motivo no corpo da resposta. Sem ler isso,
        // o app só diria "falhou" e ninguém saberia o que aconteceu.
        let detalhe = '';
        try {
          const corpo = await resp.json();
          detalhe = (corpo.error && (corpo.error.message || corpo.error)) || '';
        } catch { /* corpo não era JSON */ }
        throw new Error(`HTTP ${resp.status}${detalhe ? ' — ' + detalhe : ''}`);
      }
      return await resp.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('demorou demais para responder');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  /* ------------------------------------------------------------------ nomes */

  /**
   * A API devolve o nome inteiro numa linha só ("Ellen G. White"), e a norma
   * precisa de nome e sobrenome separados. Aqui vai o palpite; o usuário
   * confere e corrige na tela — nomes como "Machado de Assis", "Silva Jr." e
   * "Ellen G. White" não têm regra que funcione sempre.
   */
  function separarNome(inteiro) {
    const bruto = String(inteiro || '').trim().replace(/\s+/g, ' ');
    if (!bruto) return null;

    // Já veio invertido: "White, Ellen G."
    if (bruto.includes(',')) {
      const [s, n] = bruto.split(',');
      return { nome: (n || '').trim(), sobrenome: (s || '').trim() };
    }

    const partes = bruto.split(' ');
    if (partes.length === 1) return { nome: '', sobrenome: partes[0] };

    // Sufixos que andam colados ao sobrenome
    const sufixos = ['jr.', 'jr', 'júnior', 'junior', 'filho', 'neto', 'sobrinho', 'ii', 'iii'];
    let corte = partes.length - 1;
    if (sufixos.includes(partes[corte].toLowerCase()) && corte > 0) corte--;

    // Partículas que fazem parte do sobrenome: "de Assis", "da Silva"
    const particulas = ['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'della', 'van', 'von', 'la', 'le'];
    while (corte > 1 && particulas.includes(partes[corte - 1].toLowerCase())) corte--;

    return {
      nome: partes.slice(0, corte).join(' '),
      sobrenome: partes.slice(corte).join(' ')
    };
  }

  const separarLista = arr => (arr || []).map(separarNome).filter(Boolean);

  /* ----------------------------------------------------------- Google Books */

  async function googleBooks(termo) {
    // country=BR: sem esse parâmetro a API do Google responde 403 em parte das
    // redes brasileiras ("unable to determine user location"). maxResults=20 é
    // o teto por página; quase sempre é mais do que suficiente.
    const url = 'https://www.googleapis.com/books/v1/volumes?maxResults=20&country=BR&q=' +
                encodeURIComponent(termo);
    const dados = await buscarJson(url);
    return (dados.items || []).map(item => {
      const v = item.volumeInfo || {};
      const ids = v.industryIdentifiers || [];
      const isbn = (ids.find(i => i.type === 'ISBN_13') ||
                    ids.find(i => i.type === 'ISBN_10') || {}).identifier || '';
      const ano = (v.publishedDate || '').slice(0, 4);
      const capa = (v.imageLinks || {}).thumbnail || (v.imageLinks || {}).smallThumbnail || '';
      return {
        fonte: 'Google Books',
        titulo: v.title || '',
        subtitulo: v.subtitle || '',
        autores: separarLista(v.authors),
        editora: v.publisher || '',
        ano,
        isbn,
        paginas_total: v.pageCount || '',
        capa_url: capa.replace(/^http:/, 'https:'),
        // O que o Google não devolve e o usuário terá de completar:
        cidade: '', edicao: '', volume: '', issn: '', doi: ''
      };
    });
  }

  /* ----------------------------------------------------------- Open Library */

  async function openLibrary(termo) {
    const campos = 'key,title,subtitle,author_name,publisher,first_publish_year,' +
                   'publish_place,isbn,cover_i,number_of_pages_median';
    const url = 'https://openlibrary.org/search.json?limit=20&fields=' + campos +
                '&q=' + encodeURIComponent(termo);
    const dados = await buscarJson(url);
    return (dados.docs || []).map(d => ({
      fonte: 'Open Library',
      titulo: d.title || '',
      subtitulo: d.subtitle || '',
      autores: separarLista(d.author_name),
      editora: (d.publisher || [])[0] || '',
      cidade: (d.publish_place || [])[0] || '',
      ano: d.first_publish_year ? String(d.first_publish_year) : '',
      isbn: (d.isbn || [])[0] || '',
      paginas_total: d.number_of_pages_median || '',
      capa_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
      edicao: '', volume: '', issn: '', doi: ''
    }));
  }

  /* -------------------------------------------------------------- as duas ---
     Consulta as duas ao mesmo tempo. Se uma falhar (sem internet, fora do ar,
     bloqueio de rede), a outra ainda responde — por isso Promise.allSettled.
  --------------------------------------------------------------------------*/

  async function buscar(termo) {
    if (!termo || termo.trim().length < 3) return { itens: [], erros: [], contagem: {} };
    const resultados = await Promise.allSettled([googleBooks(termo), openLibrary(termo)]);
    const itens = [];
    const erros = [];
    const contagem = {};
    const nomes = ['Google Books', 'Open Library'];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        contagem[nomes[i]] = r.value.length;
        itens.push(...r.value);
      } else {
        contagem[nomes[i]] = 0;
        erros.push(`${nomes[i]}: ${r.reason && r.reason.message ? r.reason.message : 'falhou'}`);
      }
    });

    // Tira apenas os REPETIDOS DE VERDADE.
    // Cuidado aqui: edições diferentes do mesmo livro têm o mesmo título e o
    // mesmo autor, e são resultados legítimos e diferentes — a edição de 2007
    // não é a de 1985. Por isso a chave inclui ano e editora, e o ISBN só vale
    // como chave quando existe nos dois lados.
    const vistos = new Set();
    const unicos = [];
    for (const it of itens) {
      const chave = it.isbn
        ? 'isbn:' + it.isbn.replace(/[^0-9Xx]/g, '')
        : ['t:', it.titulo, it.autores[0]?.sobrenome || '', it.ano, it.editora]
            .join('|').toLowerCase().replace(/\s+/g, ' ');
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      unicos.push(it);
    }
    return { itens: unicos, erros, contagem };
  }

  /* ----------------------------------------------------------------- capa ---
     Tenta baixar a imagem para guardar dentro do aparelho (funciona offline e
     não depende do link continuar no ar). Alguns servidores de capa não
     autorizam o download por JavaScript; nesse caso guardamos o endereço e a
     capa passa a depender de internet. O app trata os dois casos.
  --------------------------------------------------------------------------*/

  async function baixarCapa(url) {
    if (!url) return { capa: null, capa_url: '' };
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) throw new Error('status ' + resp.status);
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) throw new Error('não é imagem');
      const menor = await reduzirImagem(blob, 400);
      return { capa: menor, capa_url: url };
    } catch (e) {
      console.warn('Não foi possível guardar a capa no aparelho:', e.message);
      return { capa: null, capa_url: url };
    }
  }

  /**
   * Reduz a imagem para no máximo `largura` pixels e recomprime em JPEG.
   * Uma capa de 1 MB vira uns 30 KB — o que faz diferença no backup, já que
   * mil obras com capa grande dariam um arquivo de 1 GB.
   */
  function reduzirImagem(blob, largura = 400) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, largura / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b || blob), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
    });
  }

  window.API = { buscar, googleBooks, openLibrary, baixarCapa, reduzirImagem, separarNome };

})();
