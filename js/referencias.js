/* ==========================================================================
   referencias.js — O gerador das referências
   --------------------------------------------------------------------------
   Cinco formatos (decisão P20):
     turabian-nota        Turabian, nota de rodapé, primeira ocorrência
     turabian-abrev       Turabian, nota abreviada (2ª vez em diante)
     turabian-bib         Turabian, entrada de bibliografia
     abnt-ref             ABNT NBR 6023, entrada de referências
     abnt-autordata       ABNT, chamada no meio do texto: (WHITE, 2007, p. 45)

   Seis tipos de obra (decisão P18): livro, capitulo, artigo, tese, site, biblia.

   Cada função devolve HTML — é o HTML que carrega o itálico do Turabian e o
   negrito da ABNT até o Word (decisão P21).
   ========================================================================== */

(function () {

  const FORMATOS = [
    { id: 'turabian-nota',   nome: 'Turabian — nota de rodapé',    curto: 'Turabian nota' },
    { id: 'turabian-abrev',  nome: 'Turabian — nota abreviada',    curto: 'Turabian abrev.' },
    { id: 'turabian-bib',    nome: 'Turabian — bibliografia',      curto: 'Turabian bib.' },
    { id: 'abnt-ref',        nome: 'ABNT — referência',            curto: 'ABNT' },
    { id: 'abnt-autordata',  nome: 'ABNT — citação no texto',      curto: 'ABNT autor-data' }
  ];

  const TIPOS = [
    { id: 'livro',    nome: 'Livro' },
    { id: 'capitulo', nome: 'Capítulo de livro' },
    { id: 'artigo',   nome: 'Artigo de periódico' },
    { id: 'tese',     nome: 'Tese ou dissertação' },
    { id: 'site',     nome: 'Site ou página da internet' },
    { id: 'biblia',   nome: 'Bíblia' }
  ];

  /* ---------------------------------------------------------------- nomes */

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const temNome = a => a && ((a.nome || '').trim() || (a.sobrenome || '').trim());
  const limpar = lista => (lista || []).filter(temNome);

  // "Ellen G. White"
  const direto = a => [ (a.nome || '').trim(), (a.sobrenome || '').trim() ]
    .filter(Boolean).join(' ');

  // "White, Ellen G."  (Turabian, bibliografia)
  const invertido = a => {
    const s = (a.sobrenome || '').trim(), n = (a.nome || '').trim();
    if (!s) return n;
    return n ? `${s}, ${n}` : s;
  };

  // "WHITE, Ellen G."  (ABNT)
  const abnt = a => {
    const s = (a.sobrenome || '').trim().toUpperCase(), n = (a.nome || '').trim();
    if (!s) return n.toUpperCase();
    return n ? `${s}, ${n}` : s;
  };

  /**
   * Junta uma lista de pessoas conforme a norma.
   * Turabian: nota lista todos (4+ na nota completa também); a bibliografia
   * inverte só o primeiro. ABNT: até 3 separados por ponto e vírgula;
   * 4 ou mais, o primeiro seguido de "et al.".
   */
  function juntarTurabianNota(lista) {
    const a = limpar(lista);
    if (!a.length) return '';
    if (a.length === 1) return direto(a[0]);
    if (a.length <= 3) return a.slice(0, -1).map(direto).join(', ') + ' e ' + direto(a[a.length - 1]);
    return a.map(direto).join(', ');
  }

  function juntarTurabianBib(lista) {
    const a = limpar(lista);
    if (!a.length) return '';
    if (a.length === 1) return invertido(a[0]);
    if (a.length <= 3) {
      const resto = a.slice(1).map(direto);
      return invertido(a[0]) + ', ' + resto.slice(0, -1).concat(['e ' + resto[resto.length - 1]]).join(', ');
    }
    return invertido(a[0]) + ' et al.';
  }

  function juntarAbnt(lista) {
    const a = limpar(lista);
    if (!a.length) return '';
    if (a.length <= 3) return a.map(abnt).join('; ');
    return abnt(a[0]) + ' et al.';
  }

  function sobrenomeCurto(lista) {
    const a = limpar(lista);
    if (!a.length) return '';
    if (a.length === 1) return (a[0].sobrenome || a[0].nome || '').trim();
    if (a.length <= 3) return a.map(x => (x.sobrenome || x.nome || '').trim()).join(', ');
    return (a[0].sobrenome || '').trim() + ' et al.';
  }

  function sobrenomeAbnt(lista) {
    const a = limpar(lista);
    if (!a.length) return '';
    if (a.length <= 3) return a.map(x => (x.sobrenome || x.nome || '').trim().toUpperCase()).join('; ');
    return (a[0].sobrenome || '').trim().toUpperCase() + ' et al.';
  }

  /* --------------------------------------------------------------- pedaços */

  const it = t => `<i>${esc(t)}</i>`;            // itálico (Turabian)
  const ng = t => `<b>${esc(t)}</b>`;            // negrito (ABNT)
  const falta = campo => `<span class="falta">[falta: ${esc(campo)}]</span>`;

  // Título abreviado da nota curta: até quatro palavras significativas,
  // cortando no subtítulo.
  function abreviar(titulo) {
    const t = String(titulo || '').split(':')[0].trim();
    const menores = ['de','da','do','das','dos','e','o','a','os','as','em','para','por','com','um','uma','the','of','and'];
    const palavras = t.split(/\s+/);
    if (palavras.length <= 4) return t;
    const escolhidas = [];
    for (const p of palavras) {
      escolhidas.push(p);
      const significativas = escolhidas.filter(x => !menores.includes(x.toLowerCase()));
      if (significativas.length >= 4) break;
    }
    return escolhidas.join(' ');
  }

  const tituloCheio = l => [l.titulo, l.subtitulo].filter(x => (x || '').trim()).join(': ');

  // Cidade: Editora, ano  — com as marcas de ausência de cada norma
  function publicacaoTurabian(l) {
    const cidade = (l.cidade || '').trim() || 'n.p.';
    const editora = (l.editora || '').trim();
    const ano = (l.ano || '').trim() || 'n.d.';
    return `${esc(cidade)}: ${editora ? esc(editora) : falta('editora')}, ${esc(ano)}`;
  }

  function edicaoTurabian(l) {
    const e = String(l.edicao || '').trim();
    if (!e || e === '1') return '';
    return `${esc(e)}ª ed.`;
  }

  function edicaoAbnt(l) {
    const e = String(l.edicao || '').trim();
    if (!e || e === '1') return '';
    return `${esc(e)}. ed.`;
  }

  function dataAcessoAbnt(l) {
    const d = (l.data_acesso || '').trim();
    if (!d) return '';
    const [a, m, dia] = d.split('-');
    const meses = ['jan.','fev.','mar.','abr.','maio','jun.','jul.','ago.','set.','out.','nov.','dez.'];
    if (!a || !m || !dia) return esc(d);
    return `${parseInt(dia, 10)} ${meses[parseInt(m, 10) - 1]} ${a}`;
  }

  const pg = p => String(p || '').trim();

  // Texto sem as etiquetas HTML — serve para saber como o trecho termina.
  const semTags = s => String(s || '').replace(/<[^>]+>/g, '');

  // Põe ponto final, mas só se ainda não houver um.
  // Evita o "White, Ellen G.." e o "3ª ed..".
  const pt = s => /[.!?]["'»]?\s*$/.test(semTags(s)) ? s : s + '.';

  // Título entre aspas com a vírgula DENTRO, como manda o uso americano
  // adotado por Turabian: "Título," in ...
  const aspV = t => `"${esc(t)},"`;
  const asp = t => `"${esc(t)}"`;

  // Referência bíblica da citação: em obra do tipo Bíblia, o campo "página"
  // guarda livro capítulo:versículo (ex.: João 3:16).
  const refBiblia = (l, o) => (pg(o.pagina) || (o.capitulo || '').trim() || l.titulo || '').trim();

  /* ============================ TURABIAN — NOTA ============================ */

  function turabianNota(l, o) {
    const p = pg(o.pagina);
    const autores = juntarTurabianNota(l.autores);
    const trad = limpar(l.tradutores).length ? `trad. ${esc(limpar(l.tradutores).map(direto).join(' e '))}` : '';
    const ed = edicaoTurabian(l);
    const vol = (l.volume || '').trim() ? `vol. ${esc(l.volume)}` : '';

    switch (l.tipo) {
      case 'livro': {
        const partes = [autores ? esc(autores) : falta('autor'), it(tituloCheio(l))];
        if (trad) partes.push(trad);
        if (ed) partes.push(ed);
        if (vol) partes.push(vol);
        return pt(`${partes.join(', ')} (${publicacaoTurabian(l)})${p ? ', ' + esc(p) : ''}`);
      }
      case 'capitulo': {
        const orgs = limpar(l.organizadores);
        const partes = [autores ? esc(autores) : falta('autor'),
          `${aspV(tituloCheio(l))} in ${it(l.titulo_obra || '')}`];
        if (orgs.length) partes.push(`ed. ${esc(orgs.map(direto).join(' e '))}`);
        if (ed) partes.push(ed);
        return pt(`${partes.join(', ')} (${publicacaoTurabian(l)})${p ? ', ' + esc(p) : ''}`);
      }
      case 'artigo': {
        const nums = [];
        if ((l.volume || '').trim()) nums.push(esc(l.volume));
        if ((l.numero || '').trim()) nums.push(`no. ${esc(l.numero)}`);
        const link = (l.doi || '').trim() ? `https://doi.org/${esc(l.doi.replace(/^https?:\/\/doi\.org\//, ''))}`
                                          : esc((l.url || '').trim());
        return pt(`${autores ? esc(autores) : falta('autor')}, ${aspV(tituloCheio(l))} ` +
               `${it(l.periodico || '')}${nums.length ? ' ' + nums.join(', ') : ''} ` +
               `(${esc((l.ano || '').trim() || 'n.d.')})` +
               `${p ? ': ' + esc(p) : ((l.paginas || '').trim() ? ': ' + esc(l.paginas) : '')}` +
               `${link ? ', ' + link : ''}`);
      }
      case 'tese': {
        const grau = (l.grau || '').trim() || 'tese';
        return pt(`${autores ? esc(autores) : falta('autor')}, ${asp(tituloCheio(l))} ` +
               `(${esc(grau)}, ${l.instituicao ? esc(l.instituicao) : falta('instituição')}, ` +
               `${esc((l.ano || '').trim() || 'n.d.')})${p ? ', ' + esc(p) : ''}`);
      }
      case 'site': {
        const quem = autores ? esc(autores) + ', ' : '';
        const data = (l.ano || '').trim() ? esc(l.ano) + ', ' : '';
        const acesso = (l.data_acesso || '').trim() ? `acesso em ${dataAcessoAbnt(l)}, ` : '';
        return pt(`${quem}${aspV(tituloCheio(l))} ${esc(l.periodico || l.instituicao || '')}${(l.periodico || l.instituicao) ? ', ' : ''}${data}${acesso}${esc(l.url || '')}`);
      }
      case 'biblia': {
        const v = (l.versao_biblia || '').trim();
        return `${esc(refBiblia(l, o))}${v ? ' (' + esc(v) + ')' : ''}.`;
      }
    }
  }

  /* ======================= TURABIAN — NOTA ABREVIADA ======================= */

  function turabianAbrev(l, o) {
    const p = pg(o.pagina);
    const sn = sobrenomeCurto(l.autores);
    const t = abreviar(l.tipo === 'capitulo' ? l.titulo : (l.titulo || l.titulo_obra));

    if (l.tipo === 'biblia') {
      const v = (l.versao_biblia || '').trim();
      return `${esc(refBiblia(l, o))}${v ? ' (' + esc(v) + ')' : ''}.`;
    }
    // Livro leva itálico; capítulo, artigo, tese e site levam aspas — e a
    // vírgula que antecede a página fica DENTRO das aspas.
    const marca = (l.tipo === 'livro') ? it(t) : (p ? aspV(t) : asp(t));
    if (l.tipo !== 'livro' && p)
      return pt(`${sn ? esc(sn) + ', ' : ''}${marca} ${esc(p)}`);
    // Sem autor (comum em site), a nota curta entra pelo título.
    const inicio = sn ? esc(sn) + ', ' : '';
    return pt(`${inicio}${marca}${p ? ', ' + esc(p) : ''}`);
  }

  /* ======================== TURABIAN — BIBLIOGRAFIA ======================== */

  function turabianBib(l) {
    const autores = juntarTurabianBib(l.autores);
    const trad = limpar(l.tradutores).length
      ? `Traduzido por ${esc(limpar(l.tradutores).map(direto).join(' e '))}.` : '';
    const ed = edicaoTurabian(l);

    switch (l.tipo) {
      case 'livro': {
        const p = [pt(autores ? esc(autores) : falta('autor')), pt(it(tituloCheio(l)))];
        if (trad) p.push(pt(trad));
        if (ed) p.push(pt(ed));
        p.push(pt(publicacaoTurabian(l)));
        return p.join(' ');
      }
      case 'capitulo': {
        const orgs = limpar(l.organizadores);
        const p = [pt(autores ? esc(autores) : falta('autor')), `"${esc(tituloCheio(l))}."`,
          `In ${it(l.titulo_obra || '')}`];
        let dep = '';
        if (orgs.length) dep += `, editado por ${esc(orgs.map(direto).join(' e '))}`;
        if ((l.paginas || '').trim()) dep += `, ${esc(l.paginas)}`;
        return `${p.join(' ')}${dep}. ${pt(publicacaoTurabian(l))}`;
      }
      case 'artigo': {
        const nums = [];
        if ((l.volume || '').trim()) nums.push(esc(l.volume));
        if ((l.numero || '').trim()) nums.push(`no. ${esc(l.numero)}`);
        const link = (l.doi || '').trim() ? ` https://doi.org/${esc(l.doi.replace(/^https?:\/\/doi\.org\//, ''))}.`
                                          : ((l.url || '').trim() ? ` ${esc(l.url)}.` : '');
        return `${pt(autores ? esc(autores) : falta('autor'))} "${esc(tituloCheio(l))}." ` +
               `${it(l.periodico || '')}${nums.length ? ' ' + nums.join(', ') : ''} ` +
               `(${esc((l.ano || '').trim() || 'n.d.')})` +
               `${(l.paginas || '').trim() ? ': ' + esc(l.paginas) : ''}.${link}`;
      }
      case 'tese': {
        return `${pt(autores ? esc(autores) : falta('autor'))} "${esc(tituloCheio(l))}." ` +
               `${esc((l.grau || 'Tese').replace(/^./, c => c.toUpperCase()))}, ` +
               `${l.instituicao ? esc(l.instituicao) : falta('instituição')}, ` +
               `${esc((l.ano || '').trim() || 'n.d.')}.`;
      }
      case 'site': {
        const quem = autores ? pt(esc(autores)) + ' ' : '';
        return `${quem}"${esc(tituloCheio(l))}." ${esc(l.periodico || l.instituicao || '')}` +
               `${(l.periodico || l.instituicao) ? '. ' : ''}` +
               `${(l.ano || '').trim() ? esc(l.ano) + '. ' : ''}${esc(l.url || '')}.`;
      }
      case 'biblia':
        return `<span class="aviso-inline">Em Turabian, a Bíblia é citada apenas em nota e não entra na bibliografia.</span>`;
    }
  }

  /* =========================== ABNT — REFERÊNCIA =========================== */

  function abntRef(l) {
    const autores = juntarAbnt(l.autores);
    const local = (l.cidade || '').trim() || '[s.l.]';
    const editora = (l.editora || '').trim();
    const ano = (l.ano || '').trim() || '[s.d.]';
    const ed = edicaoAbnt(l);
    const trad = limpar(l.tradutores).length
      ? `Tradução de ${esc(limpar(l.tradutores).map(direto).join(' e '))}. ` : '';
    const acesso = (l.data_acesso || '').trim() ? ` Acesso em: ${dataAcessoAbnt(l)}.` : '';
    const disp = (l.url || '').trim() ? ` Disponível em: ${esc(l.url)}.` : '';

    switch (l.tipo) {
      case 'livro': {
        const tit = l.subtitulo ? `${ng(l.titulo)}: ${esc(l.subtitulo)}` : ng(l.titulo);
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(tit)} ${trad}` +
               `${ed ? ed + ' ' : ''}${esc(local)}: ${editora ? esc(editora) : '[s.n.]'}, ${esc(ano)}.`;
      }
      case 'capitulo': {
        const orgs = limpar(l.organizadores);
        const quemOrg = orgs.length
          ? `${esc(juntarAbnt(orgs))} (org.). ` : falta('organizador') + ' ';
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(esc(tituloCheio(l)))} ` +
               `In: ${quemOrg}${ng(l.titulo_obra || '')}. ${ed ? ed + ' ' : ''}` +
               `${esc(local)}: ${editora ? esc(editora) : '[s.n.]'}, ${esc(ano)}.` +
               `${(l.paginas || '').trim() ? ' p. ' + esc(l.paginas) + '.' : ''}`;
      }
      case 'artigo': {
        const partes = [];
        if ((l.volume || '').trim()) partes.push(`v. ${esc(l.volume)}`);
        if ((l.numero || '').trim()) partes.push(`n. ${esc(l.numero)}`);
        if ((l.paginas || '').trim()) partes.push(`p. ${esc(l.paginas)}`);
        partes.push(esc(ano));
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(esc(tituloCheio(l)))} ` +
               `${ng(l.periodico || '')}, ${esc(local)}, ${partes.join(', ')}.` +
               `${(l.doi || '').trim() ? ' DOI: ' + esc(l.doi) + '.' : ''}${disp}${acesso}`;
      }
      case 'tese': {
        const tit = l.subtitulo ? `${ng(l.titulo)}: ${esc(l.subtitulo)}` : ng(l.titulo);
        // ABNT escreve o tipo do trabalho e, entre parênteses, o grau:
        // "Dissertação (Mestrado em Teologia) – Instituição, Cidade, ano."
        const g = (l.grau || '').toLowerCase();
        const area = (l.area || '').trim();
        let trabalho;
        if (g.includes('mestrado'))      trabalho = `Dissertação (Mestrado${area ? ' em ' + esc(area) : ''})`;
        else if (g.includes('doutorado')) trabalho = `Tese (Doutorado${area ? ' em ' + esc(area) : ''})`;
        else if (g)                       trabalho = esc(l.grau.replace(/^./, c => c.toUpperCase()));
        else                              trabalho = falta('grau');
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(tit)} ${esc(ano)}. ` +
               `${trabalho} – ` +
               `${l.instituicao ? esc(l.instituicao) : falta('instituição')}, ${esc(local)}, ${esc(ano)}.`;
      }
      case 'site': {
        const quem = autores ? pt(esc(autores)) + ' ' : '';
        const tit = l.subtitulo ? `${ng(l.titulo)}: ${esc(l.subtitulo)}` : ng(l.titulo);
        return `${quem}${pt(tit)} ${esc(l.periodico || l.instituicao || '')}` +
               `${(l.periodico || l.instituicao) ? ', ' : ''}${esc(ano)}.${disp}${acesso}`;
      }
      case 'biblia': {
        return `BÍBLIA. Português. ${ng(l.titulo || 'Bíblia Sagrada')}. ` +
               `${(l.versao_biblia || '').trim() ? esc(l.versao_biblia) + '. ' : ''}${trad}` +
               `${esc(local)}: ${editora ? esc(editora) : '[s.n.]'}, ${esc(ano)}.`;
      }
    }
  }

  /* ========================= ABNT — CITAÇÃO NO TEXTO ======================= */

  function abntAutorData(l, o) {
    const p = pg(o.pagina);
    if (l.tipo === 'biblia') {
      const ref = refBiblia(l, o);
      return `(${esc(ref.toUpperCase())}${(l.versao_biblia || '').trim() ? ', ' + esc(l.versao_biblia) : ''})`;
    }
    const quem = sobrenomeAbnt(l.autores) ||
                 (l.tipo === 'site' ? (l.periodico || l.instituicao || '').toUpperCase() : '');
    const ano = (l.ano || '').trim() || '[s.d.]';
    return `(${quem ? esc(quem) : falta('autor')}, ${esc(ano)}${p ? ', p. ' + esc(p) : ''})`;
  }

  /* ================================ fachada =============================== */

  const GERADORES = {
    'turabian-nota': turabianNota,
    'turabian-abrev': turabianAbrev,
    'turabian-bib': (l) => turabianBib(l),
    'abnt-ref': (l) => abntRef(l),
    'abnt-autordata': abntAutorData
  };

  /**
   * Gera uma referência.
   * @param {object} livro
   * @param {object} opcoes  { pagina, capitulo }
   * @param {string} formato id de FORMATOS
   * @returns {{html:string, texto:string, faltando:string[]}}
   */
  function gerar(livro, opcoes, formato) {
    const fn = GERADORES[formato];
    if (!fn) throw new Error('Formato desconhecido: ' + formato);
    let html;
    try {
      html = fn(livro, opcoes || {}) || '';
    } catch (e) {
      console.error('Erro ao gerar referência', e);
      html = '<span class="falta">Não foi possível gerar esta referência.</span>';
    }
    return {
      html,
      texto: htmlParaTexto(html),
      faltando: window.DB ? window.DB.Livros.faltando(livro) : []
    };
  }

  function htmlParaTexto(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent.replace(/\s+/g, ' ').trim();
  }

  /**
   * Bibliografia da categoria inteira (decisão P22): ordem alfabética pelo
   * sobrenome do primeiro autor, como manda a norma.
   */
  function gerarBibliografia(livros, formato) {
    const chave = l => {
      const a = limpar(l.autores)[0];
      const base = a ? (a.sobrenome || a.nome || '') : (l.titulo || '');
      return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    };
    const ordenados = [...livros].sort((x, y) =>
      chave(x).localeCompare(chave(y), 'pt-BR') ||
      (x.titulo || '').localeCompare(y.titulo || '', 'pt-BR'));
    return ordenados
      .filter(l => !(l.tipo === 'biblia' && formato === 'turabian-bib'))
      .map(l => gerar(l, {}, formato).html);
  }

  window.Referencias = { FORMATOS, TIPOS, gerar, gerarBibliografia, htmlParaTexto, abreviar };

})();
