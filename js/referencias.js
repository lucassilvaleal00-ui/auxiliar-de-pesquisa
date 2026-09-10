/* ==========================================================================
   referencias.js — O gerador das referências
   --------------------------------------------------------------------------
   Cinco formatos (decisão P20):
     turabian-nota        Turabian, nota de rodapé, primeira ocorrência
     turabian-abrev       Turabian, nota abreviada (2ª vez em diante)
     turabian-bib         Turabian, entrada de bibliografia
     abnt-ref             ABNT NBR 6023, entrada de referências
     abnt-autordata       ABNT, chamada no meio do texto: (WHITE, 2007, p. 45)

   Dez tipos visíveis (Livro impresso, Livro digital, Artigo Científico...),
   reduzidos a seis famílias que as normas reconhecem: livro, capitulo,
   artigo, tese, site, biblia. Ver TIPOS logo abaixo.

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

  /* ------------------------------------------------------------ tipos de obra
     Duas camadas, e a distinção importa:

     • `nome` é o que o usuário escolhe e o que sai no fichamento, em
       "Tipo de Obra" — por isso "Livro impresso" e "Livro digital (e-book)"
       são opções separadas, e não um livro com um campo "formato" ao lado.
     • `base` é a família que as normas reconhecem. Turabian e ABNT formatam
       um artigo científico e uma reportagem de revista do mesmo jeito; o que
       muda é só o nome que damos a eles. Todo o gerador olha para a base.
  --------------------------------------------------------------------------*/
  const TIPOS = [
    { id: 'livro_impresso',    nome: 'Livro impresso',        base: 'livro' },
    { id: 'livro_digital',     nome: 'Livro digital (e-book)', base: 'livro' },
    { id: 'artigo_cientifico', nome: 'Artigo Científico',     base: 'artigo' },
    { id: 'revista_academica', nome: 'Revista acadêmica',     base: 'artigo' },
    { id: 'revista',           nome: 'Revista',               base: 'artigo' },
    { id: 'tese',              nome: 'Tese',                  base: 'tese' },
    { id: 'dissertacao',       nome: 'Dissertação',           base: 'tese' },
    { id: 'site',              nome: 'Página da internet',    base: 'site' },
    { id: 'biblia',            nome: 'Bíblia',                base: 'biblia' },
    { id: 'capitulo',          nome: 'Capítulo de livro',     base: 'capitulo' }
  ];

  // Nomes antigos, de antes de a lista crescer. Ficam aqui para que uma obra
  // gravada na versão anterior — ou vinda de um backup antigo — continue
  // gerando referência certa mesmo que a migração ainda não tenha rodado.
  const LEGADO = { livro: 'livro', artigo: 'artigo', tese: 'tese' };

  /** A família da obra: livro · capitulo · artigo · tese · site · biblia. */
  function base(l) {
    const id = (l && l.tipo) || '';
    const t = TIPOS.find(x => x.id === id);
    return t ? t.base : (LEGADO[id] || 'livro');
  }

  /** O nome visível — é o que o fichamento escreve em "Tipo de Obra". */
  function nomeDoTipo(l) {
    const t = TIPOS.find(x => x.id === ((l && l.tipo) || ''));
    if (t) return t.nome;
    // obra antiga, antes da migração: mostra algo razoável em vez de vazio
    return { livro: 'Livro impresso', artigo: 'Artigo Científico',
             tese: 'Tese' }[(l && l.tipo) || ''] || 'Obra';
  }

  /* Turabian e ABNT precisam saber o grau do trabalho acadêmico. Agora o
     próprio tipo já diz: só perguntamos quando é outra coisa (um TCC). */
  function grauDe(l) {
    const g = (l.grau || '').trim();
    if (g) return g;
    if (l.tipo === 'dissertacao') return 'dissertação de mestrado';
    if (l.tipo === 'tese') return 'tese de doutorado';
    return '';
  }

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
    // Sem a limpeza abaixo, um título como "Obadias, Jonas, Miquéias, Naum,
    // Habacuque e Sofonias" era cortado logo depois de uma vírgula e a nota
    // saía com vírgula dobrada: "…Miquéias, Naum,, 213."
    return escolhidas.join(' ').replace(/[\s,;:.\-–—]+$/, '');
  }

  const tituloCheio = l => [l.titulo, l.subtitulo].filter(x => (x || '').trim()).join(': ');

  // "Belém, PA" — a sigla do estado só entra quando foi informada. Serve para
  // desambiguar cidades homônimas, que é justamente para isso que as duas
  // normas pedem o estado.
  function local(l) {
    const cidade = (l.cidade || '').trim();
    const uf = (l.estado || '').trim();
    if (!cidade) return '';
    return uf ? `${cidade}, ${uf}` : cidade;
  }

  // Cidade: Editora, ano  — com as marcas de ausência de cada norma
  function publicacaoTurabian(l) {
    const cidade = local(l) || 'n.p.';
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

  // Colaboradores: gente que ajudou na obra sem assinar como autor.
  // Turabian escreve "com Fulano"; a ABNT, "Colaboração de Fulano".
  function colaboradores(l, modelo) {
    const c = limpar(l.colaboradores);
    const outros = !!l.colaboradores_outros;
    if (!c.length && !outros) return '';

    let nomes;
    if (!c.length) {
      // Marcou que a obra tem colaboradores e não quis escrever nenhum nome.
      // "com outros" é a forma que o Chicago/Turabian admite no lugar do
      // "et al." (lá, "and others"). Ver o aviso no cadastro: as normas
      // preferem que se escreva ao menos o primeiro nome.
      nomes = 'outros';
    } else if (c.length > 3 || outros) {
      // Quatro ou mais — ou o atalho "e outros" — viram "Fulano et al.",
      // que é a forma prevista pelas duas normas.
      nomes = direto(c[0]) + ' et al.';
    } else {
      nomes = c.slice(0, -1).map(direto).join(', ') + (c.length > 1 ? ' e ' : '') + direto(c[c.length - 1]);
    }
    // `pt` em vez de um ponto fixo: "et al." já termina em ponto, e o extra
    // virava "et al..".
    return modelo === 'abnt' ? pt(`Colaboração de ${esc(nomes)}`) : `com ${esc(nomes)}`;
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

    switch (base(l)) {
      case 'livro': {
        const partes = [autores ? esc(autores) : falta('autor'), it(tituloCheio(l))];
        const colab = colaboradores(l, 'turabian');
        if (colab) partes.push(colab);
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
        const colabCap = colaboradores(l, 'turabian');
        if (colabCap) partes.push(colabCap);
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
        const grau = grauDe(l) || 'tese';
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
    const t = abreviar(base(l) === 'capitulo' ? l.titulo : (l.titulo || l.titulo_obra));

    if (base(l) === 'biblia') {
      const v = (l.versao_biblia || '').trim();
      return `${esc(refBiblia(l, o))}${v ? ' (' + esc(v) + ')' : ''}.`;
    }
    // Livro leva itálico; capítulo, artigo, tese e site levam aspas — e a
    // vírgula que antecede a página fica DENTRO das aspas.
    const marca = (base(l) === 'livro') ? it(t) : (p ? aspV(t) : asp(t));
    if (base(l) !== 'livro' && p)
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

    switch (base(l)) {
      case 'livro': {
        const p = [pt(autores ? esc(autores) : falta('autor')), pt(it(tituloCheio(l)))];
        const colabBib = colaboradores(l, 'turabian');
        if (colabBib) p.push(pt(colabBib.replace(/^com /, 'Com ')));
        if (trad) p.push(pt(trad));
        if (ed) p.push(pt(ed));
        if ((l.volume || '').trim()) p.push(`Vol. ${esc(l.volume)}.`);
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
               `${esc((grauDe(l) || 'Tese').replace(/^./, c => c.toUpperCase()))}, ` +
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
    const localAbnt = local(l) || '[s.l.]';
    const editora = (l.editora || '').trim();
    const ano = (l.ano || '').trim() || '[s.d.]';
    const ed = edicaoAbnt(l);
    const trad = limpar(l.tradutores).length
      ? `Tradução de ${esc(limpar(l.tradutores).map(direto).join(' e '))}. ` : '';
    const acesso = (l.data_acesso || '').trim() ? ` Acesso em: ${dataAcessoAbnt(l)}.` : '';
    const disp = (l.url || '').trim() ? ` Disponível em: ${esc(l.url)}.` : '';

    switch (base(l)) {
      case 'livro': {
        const tit = l.subtitulo ? `${ng(l.titulo)}: ${esc(l.subtitulo)}` : ng(l.titulo);
        const vol = (l.volume || '').trim() ? ` v. ${esc(l.volume)}.` : '';
        const colabAbnt = colaboradores(l, 'abnt');
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(tit)} ` +
               `${colabAbnt ? colabAbnt + ' ' : ''}${trad}` +
               `${ed ? ed + ' ' : ''}${esc(localAbnt)}: ${editora ? esc(editora) : '[s.n.]'}, ${esc(ano)}.${vol}`;
      }
      case 'capitulo': {
        const orgs = limpar(l.organizadores);
        const quemOrg = orgs.length
          ? `${esc(juntarAbnt(orgs))} (org.). ` : falta('organizador') + ' ';
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(esc(tituloCheio(l)))} ` +
               `In: ${quemOrg}${ng(l.titulo_obra || '')}. ${ed ? ed + ' ' : ''}` +
               `${esc(localAbnt)}: ${editora ? esc(editora) : '[s.n.]'}, ${esc(ano)}.` +
               `${(l.paginas || '').trim() ? ' p. ' + esc(l.paginas) + '.' : ''}`;
      }
      case 'artigo': {
        const partes = [];
        if ((l.volume || '').trim()) partes.push(`v. ${esc(l.volume)}`);
        if ((l.numero || '').trim()) partes.push(`n. ${esc(l.numero)}`);
        if ((l.paginas || '').trim()) partes.push(`p. ${esc(l.paginas)}`);
        partes.push(esc(ano));
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(esc(tituloCheio(l)))} ` +
               `${ng(l.periodico || '')}, ${esc(localAbnt)}, ${partes.join(', ')}.` +
               `${(l.doi || '').trim() ? ' DOI: ' + esc(l.doi) + '.' : ''}${disp}${acesso}`;
      }
      case 'tese': {
        const tit = l.subtitulo ? `${ng(l.titulo)}: ${esc(l.subtitulo)}` : ng(l.titulo);
        // ABNT escreve o tipo do trabalho e, entre parênteses, o grau:
        // "Dissertação (Mestrado em Teologia) – Instituição, Cidade, ano."
        const g = grauDe(l).toLowerCase();
        const area = (l.area || '').trim();
        let trabalho;
        if (g.includes('mestrado'))      trabalho = `Dissertação (Mestrado${area ? ' em ' + esc(area) : ''})`;
        else if (g.includes('doutorado')) trabalho = `Tese (Doutorado${area ? ' em ' + esc(area) : ''})`;
        else if (g)                       trabalho = esc(grauDe(l).replace(/^./, c => c.toUpperCase()));
        else                              trabalho = falta('grau');
        return `${pt(autores ? esc(autores) : falta('autor'))} ${pt(tit)} ${esc(ano)}. ` +
               `${trabalho} – ` +
               `${l.instituicao ? esc(l.instituicao) : falta('instituição')}, ${esc(localAbnt)}, ${esc(ano)}.`;
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
               `${esc(localAbnt)}: ${editora ? esc(editora) : '[s.n.]'}, ${esc(ano)}.`;
      }
    }
  }

  /* ========================= ABNT — CITAÇÃO NO TEXTO ======================= */

  function abntAutorData(l, o) {
    const p = pg(o.pagina);
    if (base(l) === 'biblia') {
      const ref = refBiblia(l, o);
      return `(${esc(ref.toUpperCase())}${(l.versao_biblia || '').trim() ? ', ' + esc(l.versao_biblia) : ''})`;
    }
    const quem = sobrenomeAbnt(l.autores) ||
                 (base(l) === 'site' ? (l.periodico || l.instituicao || '').toUpperCase() : '');
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
      .filter(l => !(base(l) === 'biblia' && formato === 'turabian-bib'))
      .map(l => gerar(l, {}, formato).html);
  }

  window.Referencias = { FORMATOS, TIPOS, base, nomeDoTipo, grauDe,
                         gerar, gerarBibliografia, htmlParaTexto, abreviar };

})();
