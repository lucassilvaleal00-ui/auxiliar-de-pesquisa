/* ==========================================================================
   app.js — Telas e comportamento
   Auxiliar de Pesquisa — Fase 1 (tudo local, sem login)
   ========================================================================== */

(function () {

const { Categorias, Pastas, Livros, Citacoes, Config,
        exportarTudo, importarTudo, semearExemplos,
        pedirPersistencia, espacoUsado, norm } = window.DB;
const R = window.Referencias;

/* Precisa ser igual ao VERSAO do sw.js. Aparece em Configurações: é assim que
   se confere, num aparelho qualquer, se a última publicação já chegou. */
const VERSAO_APP = 'v17';

/* --------------------------------------------------------------- atalhos */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function aviso(msg, ms = 2600) {
  const el = $('#aviso');
  el.textContent = msg; el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------------------------------------------------------------- estado */

const estado = {
  categoria_id: null,      // null = todas as obras; '' = sem categoria
  termo: '',
  offset: 0,
  fim: false,
  carregando: false,
  selecao: new Set(),
  modoSelecao: false,
  categorias: [],
  pasta_id: null,          // dentro da obra: null = todas · '' = soltas · id = uma
  pastas: [],
  selCit: new Set(),       // citações marcadas para mover
  modoSelCit: false,
  urlsCapas: []            // objectURLs a liberar no próximo desenho
};

const PAGINA = 24;

/* ============================== JANELA (modal) ========================== */

let aoFechar = null;

function abrirJanela(titulo, corpoHTML, rodapeHTML = '', fechou = null) {
  $('#janela-titulo').textContent = titulo;
  $('#janela-corpo').innerHTML = corpoHTML;
  $('#janela-rodape').innerHTML = rodapeHTML;
  $('#fundo').hidden = false;
  document.body.style.overflow = 'hidden';
  aoFechar = fechou;
  empilhar({ modal: true });
  const primeiro = $('#janela-corpo input, #janela-corpo textarea, #janela-corpo select');
  if (primeiro && window.matchMedia('(min-width: 700px)').matches) primeiro.focus();
}

function fecharJanela(porHistorico) {
  // Atenção: esta função é usada direto como tratador de clique em vários
  // botões (`onclick = fecharJanela`), e nesse caso o navegador passa o
  // evento do clique como primeiro argumento. Por isso a comparação é
  // estrita: só o valor `true` significa "veio do histórico".
  const doHistorico = porHistorico === true;
  if ($('#fundo').hidden) return;
  $('#fundo').hidden = true;
  $('#janela-corpo').innerHTML = '';
  $('#janela-rodape').innerHTML = '';
  document.body.style.overflow = '';
  if (aoFechar) { const f = aoFechar; aoFechar = null; f(); }
  // fechando pelo X ou pelo botão: tira a janela do histórico também, para o
  // "voltar" do navegador não gastar um toque à toa
  if (!doHistorico && history.state && history.state.modal) history.back();
}

$('#janela-fechar').addEventListener('click', fecharJanela);

// A janela é TRANCADA de propósito: clicar no escuro em volta não fecha nada,
// e a tecla Esc também não. Perder um cadastro pela metade por causa de um
// clique fora foi reclamação do cliente — sair é só pelo × ou pelo Cancelar.
// Em vez de fechar, a janela dá um tranco de leve, para não parecer travada.
$('#fundo').addEventListener('mousedown', e => {
  if (e.target.id !== 'fundo') return;
  const j = $('#fundo .janela');
  j.classList.remove('chacoalha');
  void j.offsetWidth;               // reinicia a animação
  j.classList.add('chacoalha');
});

function confirmar(titulo, texto, rotuloOk = 'Confirmar', perigo = true) {
  return new Promise(resolve => {
    let respondido = false;
    abrirJanela(titulo, `<p>${texto}</p>`,
      `<button class="btn" data-nao>Cancelar</button>
       <button class="btn ${perigo ? 'perigo' : 'primario'}" data-sim>${esc(rotuloOk)}</button>`,
      () => { if (!respondido) resolve(false); });
    $('#janela-rodape [data-nao]').onclick = () => { respondido = true; fecharJanela(); resolve(false); };
    $('#janela-rodape [data-sim]').onclick = () => { respondido = true; fecharJanela(); resolve(true); };
  });
}

/* ============================== NAVEGAÇÃO =============================== */

function mostrarTela(id) {
  $$('.tela').forEach(t => { t.hidden = (t.id !== id); });
  window.scrollTo(0, 0);
}

/* -------------------- BOTÃO VOLTAR DO NAVEGADOR ------------------------
   Num aplicativo de tela única, o navegador não sabe que trocamos de tela —
   por isso o "voltar" saía do app (e no Android o gesto de voltar fechava
   tudo). Aqui cada tela e cada janela entram no histórico, e o voltar passa
   a fazer o esperado: fecha a janela, ou volta para a biblioteca.
------------------------------------------------------------------------- */

let profundidade = 0;

function empilhar(estadoNav) {
  try { history.pushState(estadoNav, ''); profundidade++; } catch { /* nada */ }
}

function voltarTela() {
  if (profundidade > 0) history.back();
  else { mostrarTela('tela-inicio'); estado.telaAtual = 'inicio'; }
}

window.addEventListener('popstate', e => {
  profundidade = Math.max(0, profundidade - 1);
  const s = e.state || {};

  // janela aberta: o voltar apenas a fecha
  if (!$('#fundo').hidden) fecharJanela(true);

  if (s.tela === 'obra' && s.id) {
    if (!(estado.telaAtual === 'obra' && obraAtual && obraAtual.id === s.id)) telaObra(s.id, true);
    return;
  }
  if (s.tela === 'busca') {
    if (estado.telaAtual !== 'busca') abrirBuscaAvancada(true);
    return;
  }
  if (estado.telaAtual !== 'inicio') {
    mostrarTela('tela-inicio');
    estado.telaAtual = 'inicio';
  }
});

$$('[data-voltar]').forEach(b => b.addEventListener('click', voltarTela));

/* ============================ CAPAS DAS OBRAS =========================== */

function capaHTML(livro, classe = 'capa') {
  if (livro.capa instanceof Blob) {
    const url = URL.createObjectURL(livro.capa);
    estado.urlsCapas.push(url);
    return `<img class="${classe}" src="${url}" alt="" loading="lazy">`;
  }
  if (livro.capa_url) {
    return `<img class="${classe}" src="${esc(livro.capa_url)}" alt="" loading="lazy"
             onerror="this.outerHTML='<div class=\\'semcapa\\'>${esc(livro.titulo).slice(0, 60)}</div>'">`;
  }
  return `<div class="semcapa">${esc(livro.titulo || 'Sem título')}</div>`;
}

function liberarCapas() {
  estado.urlsCapas.forEach(u => URL.revokeObjectURL(u));
  estado.urlsCapas = [];
}

const autoresCurto = l => {
  const a = (l.autores || []).filter(x => x.nome || x.sobrenome);
  if (!a.length) return 'sem autor';
  const p = [a[0].sobrenome, a[0].nome].filter(Boolean).join(', ');
  return a.length > 1 ? p + ' e outros' : p;
};

/* ====================== LICENÇA: pode gravar ou não? ==================== */

// Em modo leitura o cliente continua consultando e exportando tudo o que já
// escreveu — só não cria nem altera (decisão P3). Os botões somem pelo CSS;
// estas duas funções são a segunda tranca, no próprio código.
const podeEditar = () => !estado.licenca || estado.licenca.estado !== 'leitura';

function avisoLeitura() {
  aviso(estado.licenca?.motivo
    ? `${estado.licenca.motivo} O aplicativo está em modo leitura.`
    : 'O aplicativo está em modo leitura.', 4200);
}

/* ============================== CATEGORIAS ============================== */

async function desenharCategorias() {
  estado.categorias = await Categorias.listar();
  const semCat = await Livros.contar({ categoria_id: '' });
  const total = await Livros.contar();

  const partes = [`<button class="cat nova" data-nova-cat>+ Nova categoria</button>`];
  partes.push(`<button class="cat ${estado.categoria_id === null ? 'ativa' : ''}" data-cat="">
                 Todas <span class="conta">${total}</span></button>`);
  for (const c of estado.categorias) {
    const n = await Categorias.contarObras(c.id);
    partes.push(`<button class="cat ${estado.categoria_id === c.id ? 'ativa' : ''}"
      data-cat="${c.id}" title="${esc(c.tema || '')}">${esc(c.titulo)}
      <span class="conta">${n}</span></button>`);
  }
  if (semCat > 0 || estado.categoria_id === '') {
    partes.push(`<button class="cat ${estado.categoria_id === '' ? 'ativa' : ''}" data-cat="__sem__">
                   Sem categoria <span class="conta">${semCat}</span></button>`);
  }
  $('#barra-categorias').innerHTML = partes.join('');
}

$('#barra-categorias').addEventListener('click', e => {
  const nova = e.target.closest('[data-nova-cat]');
  if (nova) return formCategoria();
  const bt = e.target.closest('[data-cat]');
  if (!bt) return;
  const v = bt.dataset.cat;
  estado.categoria_id = v === '' ? null : (v === '__sem__' ? '' : v);
  sairSelecao();
  recarregar();
});

function formCategoria(cat = null) {
  if (!podeEditar()) return avisoLeitura();
  const c = cat || { titulo: '', tema: '' };
  abrirJanela(cat ? 'Editar categoria' : 'Nova categoria', `
    <label class="rot">Título <span class="obrig">*</span></label>
    <input id="cat-titulo" type="text" value="${esc(c.titulo)}" placeholder="Ex.: Escatologia" maxlength="80">
    <label class="rot">Tema ou assunto (opcional)</label>
    <input id="cat-tema" type="text" value="${esc(c.tema)}" placeholder="Ex.: Estudos sobre o fim" maxlength="120">
    <p class="dica">O título é obrigatório — categoria sem nome fica invisível na barra.</p>`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn primario" data-salvar>Salvar</button>`);

  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-salvar]').onclick = async () => {
    const titulo = $('#cat-titulo').value.trim();
    const tema = $('#cat-tema').value.trim();
    if (!titulo) return aviso('Escreva um título para a categoria.');
    try {
      if (cat) await Categorias.editar(cat.id, { titulo, tema });
      else {
        const nova = await Categorias.criar({ titulo, tema });
        estado.categoria_id = nova.id;
      }
      fecharJanela();
      recarregar();
      aviso(cat ? 'Categoria atualizada.' : 'Categoria criada.');
    } catch (e) { aviso(e.message); }
  };
}

async function excluirCategoria(cat) {
  if (!podeEditar()) return avisoLeitura();
  const n = await Categorias.contarObras(cat.id);
  const texto = n
    ? `A categoria <b>${esc(cat.titulo)}</b> será apagada. As <b>${n} obra(s)</b> que estão nela
       <b>não serão apagadas</b>: elas vão para "Sem categoria" e continuam com todas as citações.`
    : `A categoria <b>${esc(cat.titulo)}</b> está vazia e será apagada.`;
  if (!await confirmar('Excluir categoria', texto, 'Excluir categoria')) return;
  await Categorias.excluir(cat.id);
  estado.categoria_id = null;
  recarregar();
  aviso('Categoria excluída. Nenhuma obra foi perdida.');
}

/* ============================== GRADE DE OBRAS ========================== */

async function recarregar() {
  estado.offset = 0; estado.fim = false;
  liberarCapas();
  $('#grade').innerHTML = '';
  await desenharCategorias();
  await desenharTituloSecao();
  await carregarMais();
}

async function desenharTituloSecao() {
  const alvo = $('#titulo-secao');
  if (estado.categoria_id === null) {
    const total = await Livros.contar();
    alvo.innerHTML = `<h2>Minha biblioteca <span class="conta">(${total})</span></h2>
      <div class="acoes">
        ${total ? '<button class="btn pequeno" data-bibliografia>Bibliografia</button>' : ''}
      </div>`;
  } else if (estado.categoria_id === '') {
    alvo.innerHTML = `<h2>Sem categoria</h2>
      <div class="acoes"><button class="btn pequeno" data-selecionar>Selecionar obras</button></div>`;
  } else {
    const cat = estado.categorias.find(c => c.id === estado.categoria_id);
    if (!cat) { estado.categoria_id = null; return desenharTituloSecao(); }
    alvo.innerHTML = `<h2>${esc(cat.titulo)}</h2>
      <div class="acoes">
        <button class="btn pequeno" data-selecionar>Selecionar</button>
        <button class="btn pequeno" data-bibliografia>Bibliografia</button>
        <button class="btn pequeno" data-editar-cat>Editar</button>
        <button class="btn pequeno perigo" data-excluir-cat>Excluir</button>
      </div>`;
  }
}

$('#titulo-secao').addEventListener('click', async e => {
  const cat = estado.categorias.find(c => c.id === estado.categoria_id);
  if (e.target.closest('[data-editar-cat]') && cat) formCategoria(cat);
  if (e.target.closest('[data-excluir-cat]') && cat) excluirCategoria(cat);
  if (e.target.closest('[data-selecionar]')) entrarSelecao();
  if (e.target.closest('[data-bibliografia]')) telaBibliografia();
});

async function carregarMais() {
  if (estado.carregando || estado.fim) return;
  estado.carregando = true;

  const lista = await Livros.listar({
    categoria_id: estado.categoria_id,
    termo: estado.termo,
    offset: estado.offset,
    limite: PAGINA
  });
  estado.offset += lista.length;
  if (lista.length < PAGINA) estado.fim = true;

  const grade = $('#grade');

  // O primeiro cartão é sempre "cadastrar nova obra" (o desenho do Lucas)
  if (!grade.children.length && !estado.termo) {
    grade.insertAdjacentHTML('beforeend',
      `<div class="cartao novo" data-nova-obra>
         <div class="mais">+</div><div>Cadastrar<br>nova obra</div>
       </div>`);
  }

  grade.insertAdjacentHTML('beforeend', lista.map(l => `
    <div class="cartao ${estado.selecao.has(l.id) ? 'marcado' : ''}" data-obra="${l.id}">
      ${estado.modoSelecao ? `<div class="marcador">${estado.selecao.has(l.id) ? '✓' : ''}</div>` : ''}
      ${l.incompleta ? '<div class="selo">incompleta</div>' : ''}
      ${capaHTML(l)}
      <div class="info">
        <b>${esc(l.titulo || 'Sem título')}</b>
        <small>${esc(autoresCurto(l))}${l.ano ? ' · ' + esc(l.ano) : ''}</small>
      </div>
    </div>`).join(''));

  const vazio = $('#vazio');
  const nenhuma = !lista.length && estado.offset === 0;
  vazio.hidden = !nenhuma;
  if (nenhuma) {
    vazio.innerHTML = estado.termo
      ? `Nenhuma obra encontrada para <b>${esc(estado.termo)}</b>.`
      : `Nenhuma obra por aqui ainda.<br>Toque em <b>Cadastrar nova obra</b> para começar.`;
  }
  estado.carregando = false;
}

new IntersectionObserver(entradas => {
  if (entradas[0].isIntersecting) carregarMais();
}, { rootMargin: '400px' }).observe($('#sentinela'));

$('#grade').addEventListener('click', e => {
  if (e.target.closest('[data-nova-obra]')) return formObra();
  const cartao = e.target.closest('[data-obra]');
  if (!cartao) return;
  const id = cartao.dataset.obra;
  if (estado.modoSelecao) {
    if (estado.selecao.has(id)) estado.selecao.delete(id); else estado.selecao.add(id);
    cartao.classList.toggle('marcado');
    const m = cartao.querySelector('.marcador');
    if (m) m.textContent = estado.selecao.has(id) ? '✓' : '';
    atualizarBarraSelecao();
  } else {
    telaObra(id);
  }
});

/* ---------------------------------------------------------- seleção múltipla */

function entrarSelecao() {
  if (!podeEditar()) return avisoLeitura();
  estado.modoSelecao = true;
  estado.selecao.clear();
  $('#barra-selecao').hidden = false;
  recarregar();
}
function sairSelecao() {
  estado.modoSelecao = false;
  estado.selecao.clear();
  $('#barra-selecao').hidden = true;
}
function atualizarBarraSelecao() {
  $('#selecao-conta').textContent = `${estado.selecao.size} selecionada(s)`;
  $('#sel-mover').disabled = estado.selecao.size === 0;
}
$('#sel-sair').onclick = () => { sairSelecao(); recarregar(); };
$('#sel-todas').onclick = async () => {
  const todas = await Livros.listar({ categoria_id: estado.categoria_id, limite: 100000 });
  todas.forEach(l => estado.selecao.add(l.id));
  atualizarBarraSelecao();
  const guardado = estado.selecao;
  await recarregar();
  estado.selecao = guardado;
  $$('#grade [data-obra]').forEach(c => {
    if (estado.selecao.has(c.dataset.obra)) {
      c.classList.add('marcado');
      const m = c.querySelector('.marcador'); if (m) m.textContent = '✓';
    }
  });
  atualizarBarraSelecao();
};
$('#sel-mover').onclick = () => moverSelecionadas();

async function moverSelecionadas() {
  if (!podeEditar()) return avisoLeitura();
  const cats = await Categorias.listar();
  abrirJanela(`Mover ${estado.selecao.size} obra(s)`, `
    <label class="rot">Escolha a categoria de destino</label>
    <select id="destino" class="campo">
      <option value="">— Sem categoria —</option>
      ${cats.map(c => `<option value="${c.id}">${esc(c.titulo)}</option>`).join('')}
    </select>
    <p class="dica">Ou crie uma categoria nova agora e mova as obras para ela.</p>
    <label class="rot">Nova categoria (opcional)</label>
    <input id="nova-cat" type="text" placeholder="Título da nova categoria">`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn primario" data-mover>Mover</button>`);

  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-mover]').onclick = async () => {
    let destino = $('#destino').value;
    const novo = $('#nova-cat').value.trim();
    if (novo) destino = (await Categorias.criar({ titulo: novo })).id;
    await Livros.mover([...estado.selecao], destino);
    fecharJanela();
    sairSelecao();
    recarregar();
    aviso('Obras movidas.');
  };
}

/* ============================ BUSCA SIMPLES ============================= */

let tempoBusca;
$('#busca-simples').addEventListener('input', e => {
  const v = e.target.value;
  $('#limpar-busca').hidden = !v;
  clearTimeout(tempoBusca);
  tempoBusca = setTimeout(() => { estado.termo = v.trim(); recarregar(); }, 250);
});
$('#limpar-busca').onclick = () => {
  $('#busca-simples').value = ''; $('#limpar-busca').hidden = true;
  estado.termo = ''; recarregar();
};

/* ========================= CAMPOS POR TIPO DE OBRA ====================== */

const CAMPO = {
  autores:        { rot: 'Autor ou autores', pessoas: true },
  // Colaboradores só aparecem se a caixinha for marcada: a maioria das obras
  // não tem, e um bloco a mais em toda ficha só atrapalharia.
  colaboradores:  { rot: 'Colaboradores', pessoas: true,
                    marca: 'Esta obra tem colaboradores (prefácio, ilustrações, notas…)',
                    outros: 'colaboradores_outros' },
  organizadores:  { rot: 'Organizador(es) da coletânea', pessoas: true },
  tradutores:     { rot: 'Tradutor(es)', pessoas: true },
  revisores:      { rot: 'Revisor(es)', pessoas: true },
  titulo:         { rot: 'Título' },
  titulo_obra:    { rot: 'Título do livro/coletânea' },
  subtitulo:      { rot: 'Subtítulo' },
  titulo_original:{ rot: 'Título original' },
  edicao:         { rot: 'Número da edição', largura: 'meia' },
  volume:         { rot: 'Volume', largura: 'meia' },
  ano:            { rot: 'Ano', largura: 'meia' },
  cidade:         { rot: 'Cidade da editora', largura: 'meia' },
  estado:         { rot: 'Estado (sigla, ex.: SP)', largura: 'meia',
                    dica: 'Opcional. Se preencher, a referência sai como "Belém, PA".' },
  editora:        { rot: 'Editora' },
  periodico:      { rot: 'Nome do periódico' },
  nome_site:      { rot: 'Nome do site', campo: 'periodico' },
  numero:         { rot: 'Número/fascículo', largura: 'meia' },
  paginas:        { rot: 'Páginas (ex.: 45-67)', largura: 'meia' },
  instituicao:    { rot: 'Instituição' },
  grau:           { rot: 'Grau', opcoes: ['', 'dissertação de mestrado', 'tese de doutorado', 'trabalho de conclusão de curso'],
                    dica: 'Só se for diferente do tipo escolhido — um TCC, por exemplo. Em branco, vale o tipo.' },
  area:           { rot: 'Área (ex.: Teologia)' },
  url:            { rot: 'Endereço na internet (URL)' },
  doi:            { rot: 'DOI', largura: 'meia' },
  issn:           { rot: 'ISSN', largura: 'meia' },
  isbn:           { rot: 'ISBN', largura: 'meia' },
  data_acesso:    { rot: 'Data de acesso', data: true, largura: 'meia' },
  versao_biblia:  { rot: 'Versão/tradução (ex.: ARA, NVI)' },
  // O que o fichamento usa. "Impressa ou digital" e "gênero da obra" saíram
  // daqui: quem responde por eles agora é o próprio tipo da obra.
  sobre:          { rot: 'De que trata a obra', area: true,
                    dica: 'Uma ou duas frases. É o que sai no fichamento, em "De que trata a obra".' }
};

// Indexado pela FAMÍLIA da obra (R.base), não pelo tipo visível: "Livro
// impresso" e "Livro digital" pedem exatamente os mesmos campos.
const CAMPOS_POR_TIPO = {
  livro:    ['autores', 'colaboradores', 'titulo', 'subtitulo', 'titulo_original', 'tradutores', 'edicao', 'volume', 'cidade', 'estado', 'editora', 'ano', 'isbn'],
  capitulo: ['autores', 'colaboradores', 'titulo', 'titulo_obra', 'organizadores', 'tradutores', 'edicao', 'cidade', 'estado', 'editora', 'ano', 'paginas'],
  artigo:   ['autores', 'colaboradores', 'titulo', 'periodico', 'volume', 'numero', 'paginas', 'cidade', 'estado', 'ano', 'doi', 'issn', 'url', 'data_acesso'],
  tese:     ['autores', 'colaboradores', 'titulo', 'subtitulo', 'grau', 'area', 'instituicao', 'cidade', 'estado', 'ano', 'url'],
  site:     ['autores', 'colaboradores', 'titulo', 'subtitulo', 'nome_site', 'ano', 'url', 'data_acesso'],
  biblia:   ['titulo', 'versao_biblia', 'tradutores', 'cidade', 'estado', 'editora', 'ano']
};

// Vale para qualquer tipo e alimenta o fichamento.
const CAMPOS_FICHAMENTO = ['sobre'];

function linhaPessoa(p = { nome: '', sobrenome: '' }) {
  return `<div class="pessoa">
    <input type="text" data-p="nome" placeholder="Nome" value="${esc(p.nome)}">
    <input type="text" data-p="sobrenome" placeholder="Sobrenome" value="${esc(p.sobrenome)}">
    <button type="button" data-tirar title="Remover">×</button>
  </div>`;
}

function blocoPessoas(chave, rot, lista, obrig) {
  const linhas = (lista && lista.length ? lista : [{ nome: '', sobrenome: '' }]).map(linhaPessoa).join('');
  return `<label class="rot">${rot} ${obrig ? '<span class="obrig">*</span>' : ''}</label>
    <div data-pessoas="${chave}">${linhas}</div>
    <button type="button" class="btn pequeno" data-add-pessoa="${chave}">+ acrescentar pessoa</button>`;
}

function blocoCampo(nome, livro, obrigatorios) {
  const def = CAMPO[nome];
  const chave = def.campo || nome;
  const obrig = obrigatorios.includes(chave) || (chave === 'titulo');

  // Bloco de pessoas escondido atrás de uma caixinha de marcar.
  if (def.pessoas && def.marca) {
    // A caixinha fica marcada se há nomes OU se foi dito que há outros: é o
    // que permite marcá-la e não escrever ninguém, sem perder o estado.
    const tem = (Array.isArray(livro[chave]) && livro[chave].length > 0) ||
                (def.outros && !!livro[def.outros]);
    return `<label class="marca" style="display:block;margin:10px 0 2px">
        <input type="checkbox" data-marca="${chave}" ${tem ? 'checked' : ''}> ${def.marca}
      </label>
      <div data-caixa="${chave}" ${tem ? '' : 'hidden'}>
        ${blocoPessoas(chave, def.rot, livro[chave], false)}
        ${def.outros ? `<label class="marca" style="display:block;margin:8px 0 0">
            <input type="checkbox" data-c-bool="${def.outros}"
              ${(livro[def.outros] && (livro[chave] || []).length) ? 'checked' : ''}>
            e outros — não vou escrever todos os nomes
          </label>
          <p class="dica">Com um nome escrito, a referência sai como
            <b>“com Fulano et al.”</b> (ABNT: “Colaboração de Fulano et al.”) —
            a forma que as duas normas preveem quando os colaboradores são muitos.</p>
          <div class="alerta" data-aviso-outros hidden>
            Sem nenhum nome, a referência sai como <b>“com outros”</b>
            (ABNT: “Colaboração de outros”).<br>
            O Turabian aceita essa forma — o manual admite <i>and others</i> no lugar
            de <i>et al.</i> —, mas a <b>ABNT NBR 6023 não prevê</b> colaboração sem nome:
            ali isso vale como nota livre. As duas normas pedem, no mínimo,
            <b>o primeiro nome</b>. Se o trabalho for corrigido com rigor,
            escreva ao menos um.
          </div>` : ''}
      </div>`;
  }
  if (def.pessoas) return blocoPessoas(chave, def.rot, livro[chave], obrig);

  const valor = esc(livro[chave] || '');
  const rot = `<label class="rot">${def.rot} ${obrig ? '<span class="obrig">*</span>' : ''}</label>`;
  if (def.opcoes) {
    return rot + `<select class="campo" data-c="${chave}">` +
      def.opcoes.map(o => `<option value="${esc(o)}" ${livro[chave] === o ? 'selected' : ''}>` +
        `${esc((def.nomes && def.nomes[o]) || o || '—')}</option>`).join('') +
      `</select>`;
  }
  if (def.area) {
    return rot + `<textarea data-c="${chave}" style="min-height:70px">${valor}</textarea>` +
      (def.dica ? `<p class="dica">${def.dica}</p>` : '');
  }
  const tipo = def.data ? 'date' : 'text';
  return rot + `<input type="${tipo}" data-c="${chave}" value="${valor}">` +
    (def.dica ? `<p class="dica">${def.dica}</p>` : '');
}

/* ========================= FORMULÁRIO DA OBRA ========================== */

function formObra(livro = null, rascunho = null) {
  if (!podeEditar()) return avisoLeitura();
  // `rascunho` é usado quando voltamos da busca automática: o formulário
  // reabre inteiro, já com o que veio da API e com os botões religados.
  const l = rascunho || (livro ? JSON.parse(JSON.stringify(livro)) : Livros.novo());
  if (livro && !rascunho && livro.capa instanceof Blob) l.capa = livro.capa;  // o JSON perderia o Blob
  if (!livro && !rascunho && estado.categoria_id) l.categoria_id = estado.categoria_id;

  const desenhar = () => {
    // Quais campos ganham o asterisco de obrigatório, por tipo de obra.
    // (A obra pode ser salva sem eles — fica marcada como incompleta, P19.)
    const familia = R.base(l);
    const exigidos = {
      livro: ['titulo', 'autores', 'editora'], capitulo: ['titulo', 'autores', 'titulo_obra', 'editora'],
      artigo: ['titulo', 'autores', 'periodico', 'ano'], tese: ['titulo', 'autores', 'instituicao', 'ano'],
      site: ['titulo', 'url'], biblia: ['versao_biblia']
    }[familia] || [];

    $('#janela-corpo').innerHTML = `
      ${livro ? '' : `<button class="btn" data-buscar-api style="width:100%">🔎 Buscar no Google Books / Open Library</button>
        <p class="dica">A busca preenche o que encontrar. Edição, cidade e tradutor quase nunca vêm — complete à mão.</p>`}

      <label class="rot">Tipo de obra <span class="obrig">*</span></label>
      <select class="campo" id="tipo-obra">
        ${R.TIPOS.map(t => `<option value="${t.id}" ${l.tipo === t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}
      </select>

      <label class="rot">Categoria</label>
      <select class="campo" data-c="categoria_id">
        <option value="">— Sem categoria —</option>
        ${estado.categorias.map(c => `<option value="${c.id}" ${l.categoria_id === c.id ? 'selected' : ''}>${esc(c.titulo)}</option>`).join('')}
      </select>

      ${(CAMPOS_POR_TIPO[familia] || CAMPOS_POR_TIPO.livro).map(n => blocoCampo(n, l, exigidos)).join('')}

      <h3 style="margin-top:18px">Para o fichamento</h3>
      ${CAMPOS_FICHAMENTO.map(n => blocoCampo(n, l, exigidos)).join('')}

      <label class="rot">Capa</label>
      <div id="area-capa">${l.capa || l.capa_url
        ? `<div style="display:flex;gap:10px;align-items:flex-start">
             ${capaHTML(l, 'capa').replace('class="capa"', 'style="width:90px;border-radius:8px"')}
             <button type="button" class="btn pequeno perigo" data-tirar-capa>Remover capa</button>
           </div>`
        : `<input type="file" accept="image/*" id="arquivo-capa">
           <p class="dica">A imagem é reduzida e guardada dentro do aparelho, para abrir sem internet.</p>`}
      </div>
      <div id="aviso-form"></div>`;

    $('#tipo-obra').onchange = e => { colher(); l.tipo = e.target.value; desenhar(); };
    const bt = $('[data-buscar-api]');
    if (bt) bt.onclick = () => {
      colher();
      buscaAutomatica(
        dados => formObra(livro, Object.assign(l, dados)),   // escolheu uma obra
        () => formObra(livro, l)                             // desistiu da busca
      );
    };

    // O aviso das normas acende e apaga conforme se escreve, sem redesenhar
    // o formulário (redesenhar no meio da digitação tiraria o foco do campo).
    $('#janela-corpo').querySelectorAll('[data-caixa]').forEach(caixa => {
      const av = caixa.querySelector('[data-aviso-outros]');
      if (!av) return;
      const rever = () => {
        const algumNome = Array.from(caixa.querySelectorAll('[data-p]'))
          .some(i => i.value.trim());
        av.hidden = !!algumNome;
      };
      caixa.addEventListener('input', rever);
      rever();
    });

    $('#janela-corpo').querySelectorAll('[data-marca]').forEach(cx => {
      cx.onchange = () => {
        const chave = cx.dataset.marca;
        colher();
        // Desmarcar apaga os nomes; marcar abre o bloco já com uma linha vazia.
        l[chave] = cx.checked ? (l[chave] && l[chave].length ? l[chave] : [{ nome: '', sobrenome: '' }]) : [];
        // Marcar a caixinha grande não é o mesmo que pedir a forma abreviada:
        // a sub-caixinha começa sempre desmarcada.
        const def = CAMPO[chave];
        if (def && def.outros && cx.checked) l[def.outros] = false;
        desenhar();
      };
    });

    $('#janela-corpo').querySelectorAll('[data-add-pessoa]').forEach(b => {
      b.onclick = () => {
        colher();
        const chave = b.dataset.addPessoa;
        (l[chave] = l[chave] || []).push({ nome: '', sobrenome: '' });
        desenhar();
      };
    });
    $('#janela-corpo').querySelectorAll('[data-tirar]').forEach(b => {
      b.onclick = () => {
        const caixa = b.closest('[data-pessoas]');
        colher();
        const chave = caixa.dataset.pessoas;
        const i = Array.from(caixa.children).indexOf(b.closest('.pessoa'));
        l[chave].splice(i, 1);
        desenhar();
      };
    });
    const tirarCapa = $('[data-tirar-capa]');
    if (tirarCapa) tirarCapa.onclick = () => { colher(); l.capa = null; l.capa_url = ''; desenhar(); };
    const arq = $('#arquivo-capa');
    if (arq) arq.onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      colher();
      l.capa = await window.API.reduzirImagem(f, 400);
      l.capa_url = '';
      desenhar();
      aviso('Capa carregada.');
    };
  };

  // Lê a tela e devolve os valores para o objeto `l`
  function colher() {
    $('#janela-corpo').querySelectorAll('[data-c]').forEach(el => { l[el.dataset.c] = el.value.trim(); });
    $('#janela-corpo').querySelectorAll('[data-pessoas]').forEach(caixa => {
      l[caixa.dataset.pessoas] = Array.from(caixa.querySelectorAll('.pessoa')).map(p => ({
        nome: p.querySelector('[data-p="nome"]').value.trim(),
        sobrenome: p.querySelector('[data-p="sobrenome"]').value.trim()
      })).filter(p => p.nome || p.sobrenome);
    });
    $('#janela-corpo').querySelectorAll('[data-c-bool]').forEach(cx => {
      l[cx.dataset.cBool] = cx.checked;
    });
    $('#janela-corpo').querySelectorAll('[data-marca]').forEach(cx => {
      const chave = cx.dataset.marca;
      const def = CAMPO[chave];
      if (!cx.checked) {
        // Desmarcada: lista vazia, mesmo que ainda haja nomes escondidos no
        // DOM — e o "e outros" cai junto, porque não sobrou ninguém.
        l[chave] = [];
        if (def && def.outros) l[def.outros] = false;
      } else if (def && def.outros && !(l[chave] || []).length) {
        // Marcada e sem nome nenhum: é o "tem colaboradores, mas não vou
        // escrever". Sem gravar isso, a caixinha viria desmarcada da próxima
        // vez, porque a lista de nomes está vazia.
        l[def.outros] = true;
      }
    });
  }

  abrirJanela(livro ? 'Editar obra' : 'Nova obra', '',
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn primario" data-salvar>Salvar obra</button>`);
  desenhar();

  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-salvar]').onclick = async () => {
    colher();
    if (!l.titulo && R.base(l) !== 'biblia') return aviso('A obra precisa de um título.');

    if (!livro) {
      const igual = await Livros.duplicada(l);
      if (igual && !await confirmar('Obra parecida já cadastrada',
        `Já existe <b>${esc(igual.titulo)}</b> na sua biblioteca. Quer cadastrar assim mesmo?`,
        'Cadastrar mesmo assim', false)) return;
    }

    await Livros.salvar(l);
    const falta = Livros.faltando(l);
    fecharJanela();
    if (estado.telaAtual === 'obra' && livro) telaObra(l.id); else recarregar();
    aviso(falta.length
      ? `Obra salva. Faltam dados para a referência: ${falta.join(', ')}.`
      : 'Obra salva.', falta.length ? 4200 : 2400);
  };
}

/* ====================== BUSCA AUTOMÁTICA (APIs) ======================== */

function buscaAutomatica(aoEscolher, aoVoltar) {
  abrirJanela('Buscar obra', `
    <div class="busca-caixa" style="margin-bottom:10px">
      <input id="api-termo" type="search" placeholder="Título, autor ou ISBN" autocomplete="off">
    </div>
    <button class="btn primario" id="api-ir" style="width:100%">Procurar</button>
    <p class="dica">Consulta o Google Books e a Open Library ao mesmo tempo. Precisa de internet.</p>
    <div id="api-resultado" style="margin-top:12px"></div>`,
    `<button class="btn" data-voltar-form>Voltar ao formulário</button>`);

  $('[data-voltar-form]').onclick = () => aoVoltar();

  const procurar = async () => {
    const termo = $('#api-termo').value.trim();
    if (termo.length < 3) return aviso('Escreva pelo menos três letras.');
    $('#api-resultado').innerHTML = '<p class="dica">Procurando…</p>';
    try {
      const { itens, erros, contagem } = await window.API.buscar(termo);

      // Mostra quantos vieram de cada fonte e, se alguma falhou, o motivo exato.
      const placar = Object.entries(contagem || {})
        .map(([fonte, n]) => `${esc(fonte)}: ${n}`).join(' · ');
      const cabecalho =
        (erros.length ? `<div class="alerta"><b>Uma fonte não respondeu:</b><br>${esc(erros.join('<br>'))}</div>` : '') +
        (placar ? `<p class="dica">${placar} — ${itens.length} resultado(s) depois de tirar os repetidos.</p>` : '');

      if (!itens.length) {
        $('#api-resultado').innerHTML = cabecalho +
          `<p class="dica">Nada encontrado com esse termo.
           Tente o título sem subtítulo, o ISBN, ou cadastre manualmente no formulário.</p>`;
        return;
      }
      $('#api-resultado').innerHTML = cabecalho +
        itens.map((it, i) => `
          <div class="res-item" data-i="${i}">
            <b>${esc(it.titulo)}</b>${it.subtitulo ? ': ' + esc(it.subtitulo) : ''}
            <div class="de">${esc(it.autores.map(a => [a.nome, a.sobrenome].filter(Boolean).join(' ')).join('; ') || 'sem autor')}
              ${it.editora ? ' · ' + esc(it.editora) : ''}${it.ano ? ' · ' + esc(it.ano) : ''}
              · <i>${esc(it.fonte)}</i></div>
          </div>`).join('');

      $('#api-resultado').querySelectorAll('[data-i]').forEach(div => {
        div.onclick = async () => {
          const it = itens[+div.dataset.i];
          div.innerHTML = '<p class="dica">Trazendo os dados…</p>';
          const capa = await window.API.baixarCapa(it.capa_url);
          aoEscolher({
            titulo: it.titulo, subtitulo: it.subtitulo, autores: it.autores,
            editora: it.editora, cidade: it.cidade || '', ano: it.ano, isbn: it.isbn,
            capa: capa.capa, capa_url: capa.capa ? '' : capa.capa_url
          });
          aviso(capa.capa ? 'Dados trazidos. Confira o que falta.'
                          : 'Dados trazidos. A capa ficou como link (precisa de internet).', 4000);
        };
      });
    } catch (e) {
      $('#api-resultado').innerHTML = `<div class="alerta">Não deu para buscar agora: ${esc(e.message)}.
        Verifique a internet ou cadastre manualmente.</div>`;
    }
  };

  $('#api-ir').onclick = procurar;
  $('#api-termo').onkeydown = e => { if (e.key === 'Enter') procurar(); };
  $('#api-termo').focus();
}

/* =============================== TELA DA OBRA ========================== */

let obraAtual = null;

async function telaObra(id, semHistorico = false) {
  const l = await Livros.obter(id);
  if (!l) return aviso('Obra não encontrada.');
  obraAtual = l;
  estado.telaAtual = 'obra';
  // Redesenhar a mesma obra (depois de salvar, por exemplo) não pode empilhar
  // outra entrada — senão o "voltar" ficaria preso repetindo a mesma tela.
  const jaEstava = history.state && history.state.tela === 'obra' && history.state.id === id;
  if (!semHistorico && !jaEstava) empilhar({ tela: 'obra', id });
  liberarCapas();
  mostrarTela('tela-obra');
  $('#busca-citacoes').value = '';
  estado.pasta_id = null;
  sairSelecaoCit();

  const cat = l.categoria_id ? (await Categorias.obter(l.categoria_id)) : null;
  const falta = Livros.faltando(l);

  $('#obra-cabecalho').innerHTML = `
    <div class="obra-topo">
      ${capaHTML(l)}
      <div class="obra-dados">
        <h2>${esc(l.titulo || 'Sem título')}${l.subtitulo ? ': ' + esc(l.subtitulo) : ''}</h2>
        <div class="linha">${esc(autoresCurto(l))}</div>
        <div class="linha">${esc(R.nomeDoTipo(l))}
          ${l.ano ? ' · ' + esc(l.ano) : ''}${l.editora ? ' · ' + esc(l.editora) : ''}
          ${cat ? ' · ' + esc(cat.titulo) : ' · sem categoria'}</div>
        ${falta.length ? `<div class="alerta">Referência incompleta — falta: ${esc(falta.join(', '))}.</div>` : ''}
        <div class="obra-acoes">
          <button class="btn primario" data-nova-citacao>+ Nova citação</button>
          <button class="btn" data-editar-obra>Editar obra</button>
          <button class="btn" data-ref-obra>Ver referências</button>
          <button class="btn" data-selecionar-cit>☑ Selecionar citações</button>
          <button class="btn" data-fichamento>Gerar fichamento</button>
          <button class="btn perigo" data-excluir-obra>Excluir</button>
        </div>
      </div>
    </div>`;

  $('#obra-cabecalho').querySelector('[data-nova-citacao]').onclick = () => formCitacao(l);
  $('#obra-cabecalho').querySelector('[data-editar-obra]').onclick = () => formObra(l);
  $('#obra-cabecalho').querySelector('[data-ref-obra]').onclick = () => janelaReferencias(l, {});
  $('#obra-cabecalho').querySelector('[data-selecionar-cit]').onclick = entrarSelecaoCit;
  $('#obra-cabecalho').querySelector('[data-fichamento]').onclick = () => janelaFichamento(l);
  $('#obra-cabecalho').querySelector('[data-excluir-obra]').onclick = async () => {
    const n = await Citacoes.contar(l.id);
    if (!await confirmar('Excluir obra',
      `<b>${esc(l.titulo)}</b> e as <b>${n} citação(ões)</b> dela serão apagadas. Isso não tem como desfazer.`,
      'Excluir obra')) return;
    await Livros.excluir(l.id);
    mostrarTela('tela-inicio'); estado.telaAtual = 'inicio';
    recarregar(); aviso('Obra excluída.');
  };

  await desenharPastas();
  desenharCitacoes();
}

/* ------------------------------------------------------------- as pastas
   Mesmo desenho da barra de categorias da tela inicial, e de propósito: quem
   já entendeu uma entende a outra na hora. A diferença é o alcance —
   categoria agrupa OBRAS; pasta agrupa CITAÇÕES dentro de uma obra só.
--------------------------------------------------------------------------*/
/* ------------------------------------------------------------- as pastas
   Dois níveis, e a navegação reflete isso:

     barra horizontal  →  as pastas MESTRAS ("Miqueias", "Jonas")
     dentro de uma     →  as subpastas dela ("Autores", "Datação"), cada uma
                          com renomear e excluir ao lado, mais as citações
                          guardadas direto na mestra.

   `estado.pasta_id` é a pasta ABERTA — pode ser mestra ou subpasta. A barra
   de cima acende a mestra correspondente, para nunca se perder o rumo.
--------------------------------------------------------------------------*/

/** A mestra correspondente à pasta aberta (ela mesma, se já for mestra). */
function mestraAberta() {
  if (!estado.pasta_id) return estado.pasta_id;          // null ou ''
  const p = (estado.pastas || []).find(x => x.id === estado.pasta_id);
  if (!p) return null;
  return (p.pai_id || '') || p.id;
}

async function desenharPastas() {
  const barra = $('#barra-pastas');
  const l = obraAtual;
  estado.pastas = await Pastas.porLivro(l.id);
  const mestras = estado.pastas.filter(p => !(p.pai_id || ''));

  const total = await Citacoes.contar(l.id);
  const soltas = (await Citacoes.porLivro(l.id, '', '')).length;
  const daMestra = mestraAberta();

  const contas = {};
  for (const p of mestras) contas[p.id] = await Pastas.contarTudo(p.id);

  const chip = (id, nome, quantas, ativa, extra = '') =>
    `<button class="cat ${ativa ? 'ativa' : ''}" data-pasta="${id === null ? '' : esc(id)}"
       ${extra}>${esc(nome)} <span class="conta">${quantas}</span></button>`;

  barra.innerHTML =
    chip(null, 'Todas', total, estado.pasta_id === null, 'data-todas-pastas') +
    mestras.map(p => chip(p.id, p.titulo, contas[p.id] ?? 0, daMestra === p.id)).join('') +
    (mestras.length && soltas ? chip('', 'Soltas', soltas, estado.pasta_id === '') : '') +
    `<button class="cat nova" data-nova-pasta>+ Nova pasta</button>`;

  barra.querySelectorAll('[data-pasta]').forEach(b => {
    b.onclick = () => {
      estado.pasta_id = b.hasAttribute('data-todas-pastas') ? null : b.dataset.pasta;
      sairSelecaoCit();
      desenharPastas(); desenharCitacoes();
    };
  });
  barra.querySelector('[data-nova-pasta]').onclick = () => formPasta({ pai_id: '' });

  await desenharSubpastas();
}

/* O painel que aparece DENTRO de uma pasta: caminho de volta, as subpastas
   com os seus botões, e o convite para criar mais uma. */
async function desenharSubpastas() {
  const alvo = $('#obra-subpastas');
  const daMestra = mestraAberta();
  if (!daMestra) { alvo.innerHTML = ''; alvo.hidden = true; return; }
  alvo.hidden = false;

  const mestra = estado.pastas.find(p => p.id === daMestra);
  const aberta = estado.pastas.find(p => p.id === estado.pasta_id);
  const dentroDeSub = aberta && (aberta.pai_id || '');
  const filhas = await Pastas.filhas(daMestra);

  const contas = {};
  for (const f of filhas) contas[f.id] = await Pastas.contarDiretas(f.id);
  const naMestra = await Pastas.contarDiretas(daMestra);

  const linhaSub = f => `
    <div class="sub ${estado.pasta_id === f.id ? 'ativa' : ''}">
      <button class="sub-nome" data-abrir-sub="${esc(f.id)}">
        📁 ${esc(f.titulo)} <span class="conta">${contas[f.id] ?? 0}</span>
      </button>
      <button class="mini" data-editar-sub="${esc(f.id)}" title="Renomear">✎</button>
      <button class="mini" data-excluir-sub="${esc(f.id)}" title="Excluir">🗑</button>
    </div>`;

  alvo.innerHTML = `
    <div class="caminho">
      <b>📂 ${esc(mestra ? mestra.titulo : '')}</b>
      ${dentroDeSub ? ` › <b>${esc(aberta.titulo)}</b>
          <button class="btn pequeno" data-voltar-mestra>‹ voltar para ${esc(mestra.titulo)}</button>` : ''}
      <span class="espaco"></span>
      <button class="btn pequeno" data-editar-pasta>✎ Renomear</button>
      <button class="btn pequeno perigo" data-excluir-pasta>🗑 Excluir</button>
    </div>
    ${dentroDeSub ? '' : `
      <div class="subpastas">
        ${filhas.map(linhaSub).join('')}
        <button class="cat nova" data-nova-sub>+ Nova subpasta</button>
      </div>
      ${filhas.length ? `<p class="dica">Abaixo, as ${naMestra} citação(ões) guardadas
         direto em "${esc(mestra.titulo)}" — as das subpastas aparecem dentro delas.</p>` : ''}`}`;

  const bVoltar = alvo.querySelector('[data-voltar-mestra]');
  if (bVoltar) bVoltar.onclick = () => {
    estado.pasta_id = daMestra; sairSelecaoCit();
    desenharPastas(); desenharCitacoes();
  };
  alvo.querySelectorAll('[data-abrir-sub]').forEach(b => {
    b.onclick = () => {
      estado.pasta_id = b.dataset.abrirSub; sairSelecaoCit();
      desenharPastas(); desenharCitacoes();
    };
  });
  alvo.querySelectorAll('[data-editar-sub]').forEach(b => {
    b.onclick = async () => formPasta(await Pastas.obter(b.dataset.editarSub));
  });
  alvo.querySelectorAll('[data-excluir-sub]').forEach(b => {
    b.onclick = () => excluirPasta(b.dataset.excluirSub);
  });
  const bNova = alvo.querySelector('[data-nova-sub]');
  if (bNova) bNova.onclick = () => formPasta({ pai_id: daMestra });
  alvo.querySelector('[data-editar-pasta]').onclick =
    async () => formPasta(await Pastas.obter(estado.pasta_id));
  alvo.querySelector('[data-excluir-pasta]').onclick = () => excluirPasta(estado.pasta_id);
}

/** @param alvo  uma pasta existente (renomear) ou { pai_id } (criar) */
function formPasta(alvo = { pai_id: '' }) {
  if (!podeEditar()) return avisoLeitura();
  const pasta = alvo && alvo.id ? alvo : null;
  const pai_id = pasta ? (pasta.pai_id || '') : (alvo.pai_id || '');
  const ehSub = !!pai_id;
  const mestra = ehSub ? estado.pastas.find(p => p.id === pai_id) : null;

  abrirJanela(pasta ? 'Renomear pasta' : (ehSub ? 'Nova subpasta' : 'Nova pasta'), `
    ${ehSub && !pasta ? `<p class="dica">Dentro de <b>${esc(mestra ? mestra.titulo : '')}</b>.</p>` : ''}
    <label class="rot">Nome da pasta <span class="obrig">*</span></label>
    <input type="text" id="pasta-titulo" value="${esc(pasta ? pasta.titulo : '')}"
           placeholder="${ehSub ? 'Ex.: Autores' : 'Ex.: Miqueias'}">
    <p class="dica">${ehSub
      ? 'Subpasta serve para dividir um tema em assuntos: dentro de "Miqueias", as pastas "Autores", "Datação", "Pregação".'
      : 'A pasta mestra vale só dentro desta obra e aparece na barra de cima. Dentro dela você pode criar subpastas.'}</p>`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn primario" data-salvar>Salvar</button>`);

  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-salvar]').onclick = async () => {
    const titulo = $('#pasta-titulo').value.trim();
    if (!titulo) return aviso('A pasta precisa de um nome.');
    try {
      if (pasta) await Pastas.editar(pasta.id, { titulo });
      else {
        const nova = await Pastas.criar({ livro_id: obraAtual.id, titulo, pai_id });
        estado.pasta_id = nova.id;      // já entra na pasta recém-criada
      }
    } catch (e) { return aviso(e.message); }
    fecharJanela();
    await desenharPastas(); desenharCitacoes();
    aviso(pasta ? 'Pasta renomeada.' : 'Pasta criada.');
  };
}

/* Excluir com citações dentro é a única operação do app que pode fazer alguém
   perder texto. Por isso não usa o "confirmar" de duas opções: mostra as duas
   saídas lado a lado, com o número das citações em cada uma. */
async function excluirPasta(id) {
  if (!podeEditar()) return avisoLeitura();
  const pasta = await Pastas.obter(id);
  if (!pasta) return;
  const filhas = await Pastas.filhas(id);
  const quantas = await Pastas.contarTudo(id);

  if (!quantas) {
    if (!await confirmar('Excluir pasta',
      `A pasta <b>${esc(pasta.titulo)}</b> está vazia e será apagada.` +
      (filhas.length ? ` As ${filhas.length} subpasta(s) dela vão junto.` : ''),
      'Excluir')) return;
    await Pastas.excluir(id);
    estado.pasta_id = (pasta.pai_id || '') || null;
    await desenharPastas(); desenharCitacoes();
    return aviso('Pasta excluída.');
  }

  abrirJanela(`Excluir "${esc(pasta.titulo)}"`, `
    <p>Esta pasta tem <b>${quantas} citação(ões)</b> dentro${filhas.length
      ? `, contando as de ${filhas.length} subpasta(s)` : ''}. O que fazer com elas?</p>
    <div class="alerta" style="margin-top:12px">
      Apagar citação não tem como desfazer — o aplicativo não tem lixeira.
    </div>`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn" data-so-pasta>Excluir só a pasta</button>
     <button class="btn perigo" data-com-tudo>Excluir pasta e as ${quantas} citações</button>`);

  $('[data-cancelar]').onclick = fecharJanela;

  const concluir = async (comCitacoes, texto) => {
    await Pastas.excluir(id, { comCitacoes });
    estado.pasta_id = (pasta.pai_id || '') || null;
    fecharJanela();
    await desenharPastas(); desenharCitacoes();
    aviso(texto, 5000);
  };
  $('[data-so-pasta]').onclick = () =>
    concluir(false, `Pasta excluída. As ${quantas} citação(ões) voltaram a ficar soltas na obra.`);
  $('[data-com-tudo]').onclick = async () => {
    if (!await confirmar('Tem certeza?',
      `Serão apagadas <b>${quantas} citação(ões)</b> junto com a pasta. Isso não tem volta.`,
      `Apagar tudo`)) return;
    await concluir(true, `Pasta e ${quantas} citação(ões) apagadas.`);
  };
}

/* ------------------------------------------------- seleção de citações
   Mesmo padrão da seleção de obras na tela inicial: um botão liga o modo, os
   cartões viram alvos de toque, e uma barra aparece com o que dá para fazer
   com o que está marcado.
--------------------------------------------------------------------------*/

function entrarSelecaoCit() {
  if (!podeEditar()) return avisoLeitura();
  estado.modoSelCit = true;
  estado.selCit.clear();
  desenharCitacoes();
}

function sairSelecaoCit() {
  if (!estado.modoSelCit && !estado.selCit.size) return;
  estado.modoSelCit = false;
  estado.selCit.clear();
  const barra = $('#barra-selecao-cit');
  if (barra) barra.hidden = true;
}

function pintarSelecaoCit() {
  const barra = $('#barra-selecao-cit');
  barra.hidden = !estado.modoSelCit;
  $('#selecao-cit-conta').textContent =
    `${estado.selCit.size} selecionada(s)`;
  $('#sel-cit-mover').disabled = estado.selCit.size === 0;
}

$('#sel-cit-sair').onclick = () => { sairSelecaoCit(); desenharCitacoes(); };
$('#sel-cit-todas').onclick = () => {
  $('#obra-citacoes').querySelectorAll('[data-cit]').forEach(d => estado.selCit.add(d.dataset.cit));
  desenharCitacoes();
};
$('#sel-cit-mover').onclick = () => janelaMoverCitacoes([...estado.selCit]);

/** A lista de destinos possíveis, já com as subpastas recuadas sob a mestra. */
function opcoesDeDestino(selecionado = null) {
  const mestras = (estado.pastas || []).filter(p => !(p.pai_id || ''));
  let html = `<option value="">— Solta, fora de pasta —</option>`;
  for (const m of mestras) {
    const sel = selecionado === m.id ? 'selected' : '';
    html += `<option value="${esc(m.id)}" ${sel}>${esc(m.titulo)}</option>`;
    for (const f of (estado.pastas || []).filter(p => p.pai_id === m.id)) {
      const sf = selecionado === f.id ? 'selected' : '';
      // O travessão é o que mostra, num <select> simples, que a subpasta está
      // dentro da mestra de cima — não dá para recuar opção com CSS confiável.
      html += `<option value="${esc(f.id)}" ${sf}>— ${esc(m.titulo)} › ${esc(f.titulo)}</option>`;
    }
  }
  return html;
}

function janelaMoverCitacoes(ids) {
  if (!ids.length) return aviso('Marque ao menos uma citação.');
  abrirJanela(`Mover ${ids.length} citação(ões)`, `
    <label class="rot">Para onde?</label>
    <select class="campo" id="mover-destino">${opcoesDeDestino()}</select>
    <p class="dica">As citações continuam na mesma obra — muda só a pasta em
      que ficam guardadas. Nada é apagado.</p>`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn primario" data-mover>Mover</button>`);

  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-mover]').onclick = async () => {
    const destino = $('#mover-destino').value;
    await Pastas.moverCitacoes(ids, destino);
    fecharJanela();
    sairSelecaoCit();
    // Vai junto para o destino: procurar onde foram parar seria trabalho à toa.
    if (estado.pasta_id !== null) estado.pasta_id = destino;
    await desenharPastas();
    desenharCitacoes();
    const nome = destino
      ? (estado.pastas.find(p => p.id === destino) || {}).titulo || 'a pasta'
      : 'fora de pasta';
    aviso(`${ids.length} citação(ões) movida(s) para ${nome}.`, 4000);
  };
}

async function desenharCitacoes() {
  const l = obraAtual;
  const termo = $('#busca-citacoes').value.trim();
  const lista = await Citacoes.porLivro(l.id, termo, estado.pasta_id);
  const alvo = $('#obra-citacoes');

  if (!lista.length) {
    alvo.innerHTML = `<p class="vazio">${termo
      ? 'Nenhuma citação encontrada nesta obra.'
      : estado.pasta_id
        ? 'Esta pasta ainda está vazia.'
        : 'Esta obra ainda não tem citações.'}<br>
      <button class="btn primario" data-nova2 style="margin-top:10px">+ Adicionar a primeira citação</button></p>`;
    const b = alvo.querySelector('[data-nova2]'); if (b) b.onclick = () => formCitacao(l);
    return;
  }

  // Numa obra do tipo Bíblia o campo "página" guarda a referência bíblica
  // (João 3:16) — ali "pág." não faz sentido nenhum.
  const ehBiblia = R.base(l) === 'biblia';

  alvo.innerHTML = lista.map(c => `
    <div class="citacao" data-cit="${c.id}">
      ${estado.modoSelCit ? `<label class="marca-cit">
           <input type="checkbox" data-marcar="${c.id}" ${estado.selCit.has(c.id) ? 'checked' : ''}>
         </label>` : `<div class="acoes">
        <button class="mini" data-editar title="Editar">✎</button>
        <button class="mini" data-excluir title="Excluir">🗑</button>
      </div>`}
      <div class="pag">${c.pagina
        ? esc(c.pagina) + (ehBiblia ? '' : ' <span class="pag-un">pág.</span>')
        : '—'}</div>
      <div class="texto">
        <p>${realce(esc(c.texto), termo)}</p>
        ${c.capitulo ? `<div class="cap">${esc(c.capitulo)}</div>` : ''}
        <div class="cap">${c.tipo === 'direta' ? 'citação direta' : 'citação indireta'}</div>
        ${c.assunto ? `<div class="cap">assunto: ${esc(c.assunto)}</div>` : ''}
        ${c.nota_pessoal ? `<div class="cap">📝 ${esc(c.nota_pessoal)}</div>` : ''}
      </div>
    </div>`).join('');

  if (estado.modoSelCit) {
    alvo.querySelectorAll('[data-cit]').forEach(div => {
      const id = div.dataset.cit;
      const caixa = div.querySelector('[data-marcar]');
      const alternar = () => {
        if (estado.selCit.has(id)) estado.selCit.delete(id); else estado.selCit.add(id);
        caixa.checked = estado.selCit.has(id);
        div.classList.toggle('marcado', caixa.checked);
        pintarSelecaoCit();
      };
      div.classList.toggle('marcado', estado.selCit.has(id));
      // O cartão inteiro é o alvo do clique: mirar numa caixinha de 16 px no
      // celular é pedir demais de quem está trabalhando.
      div.onclick = e => { if (e.target !== caixa) alternar(); };
      caixa.onchange = () => {
        estado.selCit.has(id) ? estado.selCit.delete(id) : estado.selCit.add(id);
        div.classList.toggle('marcado', caixa.checked);
        pintarSelecaoCit();
      };
    });
    pintarSelecaoCit();
    return;
  }

  alvo.querySelectorAll('[data-cit]').forEach(div => {
    const id = div.dataset.cit;
    div.querySelector('[data-editar]').onclick = async () => formCitacao(l, await Citacoes.obter(id));
    div.querySelector('[data-excluir]').onclick = async () => {
      if (!await confirmar('Excluir citação', 'Esta citação será apagada. Não tem como desfazer.', 'Excluir')) return;
      await Citacoes.excluir(id);
      await desenharPastas(); desenharCitacoes();
      aviso('Citação excluída.');
    };
    div.querySelector('.texto').onclick = async () => {
      const c = await Citacoes.obter(id);
      janelaReferencias(l, c, c);
    };
  });
}

function realce(texto, termo) {
  if (!termo) return texto;
  const alvo = norm(termo);
  if (!alvo) return texto;
  // marca as ocorrências comparando sem acento, mas mostrando o texto original
  const semAcento = norm(texto);
  let saida = '', i = 0;
  let pos = semAcento.indexOf(alvo);
  while (pos !== -1 && alvo.length) {
    saida += texto.slice(i, pos) + '<mark>' + texto.slice(pos, pos + alvo.length) + '</mark>';
    i = pos + alvo.length;
    pos = semAcento.indexOf(alvo, i);
  }
  return saida + texto.slice(i);
}

$('#busca-citacoes').addEventListener('input', () => {
  clearTimeout(tempoBusca);
  tempoBusca = setTimeout(desenharCitacoes, 200);
});

/* ========================= FORMULÁRIO DA CITAÇÃO ======================= */

function formCitacao(livro, citacao = null) {
  if (!podeEditar()) return avisoLeitura();
  const c = citacao ? { ...citacao } : Citacoes.novo(livro.id);
  const ehBiblia = R.base(livro) === 'biblia';
  // Citação nova nasce na pasta que está aberta — é quase sempre o que se
  // quer: quem entrou numa pasta e clicou "nova citação" quer guardar ali.
  if (!citacao && estado.pasta_id) c.pasta_id = estado.pasta_id;
  const pastas = estado.pastas || [];

  abrirJanela(citacao ? 'Editar citação' : 'Nova citação', `
    <label class="rot">Texto da citação <span class="obrig">*</span></label>
    <textarea id="c-texto" placeholder="Cole ou digite o trecho…">${esc(c.texto)}</textarea>
    <div class="duas">
      <div>
        <label class="rot">${ehBiblia ? 'Referência (ex.: João 3:16)' : 'Número da página'}</label>
        <input type="text" id="c-pagina" value="${esc(c.pagina)}">
      </div>
      <div>
        <label class="rot">Tipo</label>
        <select class="campo" id="c-tipo">
          <option value="direta" ${c.tipo === 'direta' ? 'selected' : ''}>Citação direta</option>
          <option value="indireta" ${c.tipo !== 'direta' ? 'selected' : ''}>Citação indireta</option>
        </select>
      </div>
    </div>
    <label class="rot">Assunto</label>
    <input type="text" id="c-assunto" value="${esc(c.assunto || '')}"
           placeholder="Ex.: Autoria de Jonas">
    <p class="dica">É a coluna do meio da tabela do fichamento.</p>

    <label class="rot">Pasta</label>
    <select class="campo" id="c-pasta">${opcoesDeDestino(c.pasta_id || '')}</select>
    ${pastas.length ? '' : `<p class="dica">Esta obra ainda não tem pastas.
      Crie a primeira na barra logo abaixo do cabeçalho da obra.</p>`}
    <label class="rot">Título do capítulo</label>
    <input type="text" id="c-capitulo" value="${esc(c.capitulo)}">
    <label class="rot">Anotação pessoal (só sua, não entra na referência)</label>
    <input type="text" id="c-nota" value="${esc(c.nota_pessoal)}">
    <div id="previa" style="margin-top:16px"></div>`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn primario" data-salvar>Salvar citação</button>`);

  const atualizarPrevia = () => {
    const dados = { pagina: $('#c-pagina').value.trim(), capitulo: $('#c-capitulo').value.trim() };
    $('#previa').innerHTML = `<label class="rot">Referências geradas</label>` +
      blocosReferencia(livro, dados);
    ligarBotoesReferencia($('#previa'), livro, dados);
  };
  $('#c-pagina').oninput = atualizarPrevia;
  $('#c-capitulo').oninput = atualizarPrevia;
  atualizarPrevia();

  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-salvar]').onclick = async () => {
    c.texto = $('#c-texto').value.trim();
    c.pagina = $('#c-pagina').value.trim();
    c.capitulo = $('#c-capitulo').value.trim();
    c.assunto = $('#c-assunto').value.trim();
    c.tipo = $('#c-tipo').value;
    c.nota_pessoal = $('#c-nota').value.trim();
    c.pasta_id = $('#c-pasta').value;
    if (!c.texto) return aviso('Escreva o texto da citação.');
    await Citacoes.salvar(c);
    // mexer numa citação atualiza a obra, para ela subir na tela inicial
    await Livros.salvar(await Livros.obter(livro.id));
    fecharJanela();
    // Guardada numa pasta que não é a que está aberta? Vai para lá, senão a
    // citação "sumiria" e a pessoa pensaria que perdeu o que digitou.
    if (estado.pasta_id !== null && (c.pasta_id || '') !== estado.pasta_id) {
      estado.pasta_id = c.pasta_id || '';
    }
    await desenharPastas();
    desenharCitacoes();
    aviso(citacao ? 'Citação atualizada.' : 'Citação salva.');
  };
}

/* =========================== REFERÊNCIAS: BLOCOS ======================= */

// As duas primeiras aparecem abertas; as outras três ficam atrás do botão
// "ver mais formatos" — decisão P20, para a tela não pesar no celular.
const PRINCIPAIS = ['turabian-nota', 'abnt-ref'];

function blocosReferencia(livro, dados, todos = false) {
  const lista = todos ? R.FORMATOS : R.FORMATOS.filter(f => PRINCIPAIS.includes(f.id));
  const html = lista.map(f => {
    const r = R.gerar(livro, dados, f.id);
    return `<div class="ref-bloco" data-formato="${f.id}">
      <div class="ref-topo"><span>${esc(f.nome)}</span>
        <span class="bts">
          <button class="btn pequeno" data-editar-ref>Editar</button>
          <button class="btn pequeno primario" data-copiar-ref>Copiar</button>
        </span>
      </div>
      <div class="ref-texto">${r.html}</div>
    </div>`;
  }).join('');
  return html + (todos ? '' :
    `<button class="btn pequeno" data-mais-formatos style="width:100%">ver mais formatos (${R.FORMATOS.length - PRINCIPAIS.length})</button>`);
}

function ligarBotoesReferencia(raiz, livro, dados) {
  const mais = raiz.querySelector('[data-mais-formatos]');
  if (mais) mais.onclick = () => {
    raiz.innerHTML = `<label class="rot">Referências geradas</label>` + blocosReferencia(livro, dados, true);
    ligarBotoesReferencia(raiz, livro, dados);
  };
  raiz.querySelectorAll('.ref-bloco').forEach(bloco => {
    const texto = bloco.querySelector('.ref-texto');
    bloco.querySelector('[data-editar-ref]').onclick = (e) => {
      const ligado = texto.getAttribute('contenteditable') === 'true';
      texto.setAttribute('contenteditable', ligado ? 'false' : 'true');
      e.target.textContent = ligado ? 'Editar' : 'Pronto';
      if (!ligado) texto.focus();
    };
    bloco.querySelector('[data-copiar-ref]').onclick = () => copiarFormatado(texto.innerHTML);
  });
}

/**
 * `citacao` é opcional: quando vem, o texto dela aparece em cima das
 * referências, em destaque, com os mesmos botões de editar e copiar — foi o
 * pedido do Lucas, e faz sentido: na hora de escrever, o que se cola primeiro
 * é a frase, e a referência vem logo atrás.
 */
function janelaReferencias(livro, dados, citacao = null) {
  const cabecalho = citacao ? `
    <div class="ref-bloco citacao-bloco">
      <div class="ref-topo">
        <span>Texto da citação${dados.pagina ? ' · p. ' + esc(dados.pagina) : ''}</span>
        <span class="bts">
          <button class="btn pequeno" data-editar-cit>Editar</button>
          <button class="btn pequeno primario" data-copiar-cit>Copiar</button>
        </span>
      </div>
      <div class="ref-texto" id="texto-citacao">${esc(citacao.texto)}</div>
      ${citacao.capitulo ? `<div class="ref-rodape">${esc(citacao.capitulo)}</div>` : ''}
    </div>` : '';

  abrirJanela(citacao ? 'Citação e referências' : 'Referências desta obra',
    `<p class="dica">${esc(livro.titulo)}${dados.pagina ? ' · p. ' + esc(dados.pagina) : ''}</p>
     ${cabecalho}
     <div id="refs"></div>`,
    `<button class="btn" data-fechar2>Fechar</button>`);

  $('#refs').innerHTML = blocosReferencia(livro, dados, true);
  ligarBotoesReferencia($('#refs'), livro, dados);
  $('[data-fechar2]').onclick = fecharJanela;

  if (citacao) {
    const campo = $('#texto-citacao');
    $('[data-copiar-cit]').onclick = () => copiarFormatado(campo.innerHTML);
    const bt = $('[data-editar-cit]');
    bt.onclick = async () => {
      const editando = campo.getAttribute('contenteditable') === 'true';
      if (!editando) {
        if (!podeEditar()) return avisoLeitura();
        campo.setAttribute('contenteditable', 'true');
        bt.textContent = 'Salvar';
        campo.focus();
        return;
      }
      // Editar aqui altera a citação de verdade, não só o que está na tela.
      campo.setAttribute('contenteditable', 'false');
      bt.textContent = 'Editar';
      const novo = campo.textContent.trim();
      if (novo && novo !== citacao.texto) {
        citacao.texto = novo;
        await Citacoes.salvar(citacao);
        desenharCitacoes();
        aviso('Citação atualizada.');
      }
    };
  }
}

/* ------------------------------------------------------------- copiar ----
   Copia mantendo itálico e negrito, SEM definir fonte (decisão P21): a
   referência assume a fonte do documento onde for colada.
--------------------------------------------------------------------------*/

async function copiarFormatado(html) {
  const limpo = String(html).replace(/<span class="falta">.*?<\/span>/g, '[completar]');
  const texto = R.htmlParaTexto(limpo);
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([limpo], { type: 'text/html' }),
        'text/plain': new Blob([texto], { type: 'text/plain' })
      })]);
      aviso('Copiado com a formatação.');
      return;
    }
    throw new Error('sem ClipboardItem');
  } catch (e) {
    // Reserva para navegadores que não aceitam o modo acima (Firefox antigo,
    // iOS mais velho): copia o texto puro por um campo escondido.
    try {
      const area = document.createElement('textarea');
      area.value = texto;
      area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      aviso('Copiado como texto simples.');
    } catch (e2) {
      aviso('Não foi possível copiar neste navegador.');
    }
  }
}

/* ============================ BIBLIOGRAFIA ============================== */

async function telaBibliografia() {
  const cat = estado.categorias.find(c => c.id === estado.categoria_id);
  const livros = await Livros.listar({ categoria_id: estado.categoria_id, limite: 100000 });
  if (!livros.length) return aviso('Não há obras para montar a bibliografia.');

  abrirJanela(`Bibliografia — ${cat ? cat.titulo : 'biblioteca inteira'}`, `
    <label class="rot">Formato</label>
    <select class="campo" id="bib-formato">
      <option value="abnt-ref">ABNT — lista de referências</option>
      <option value="turabian-bib">Turabian — bibliografia</option>
    </select>
    <p class="dica">${livros.length} obra(s), em ordem alfabética pelo sobrenome do primeiro autor.</p>
    <div id="bib-lista" class="ref-lista" style="margin-top:10px"></div>`,
    `<button class="btn" data-fechar3>Fechar</button>
     <button class="btn primario" data-copiar-tudo>Copiar tudo</button>`);

  const montar = () => {
    const f = $('#bib-formato').value;
    const itens = R.gerarBibliografia(livros, f);
    $('#bib-lista').innerHTML = itens.map(h => `<div class="ref-texto">${h}</div>`).join('');
  };
  $('#bib-formato').onchange = montar;
  montar();

  $('[data-fechar3]').onclick = fecharJanela;
  $('[data-copiar-tudo]').onclick = () => {
    const itens = Array.from($('#bib-lista').children).map(d => `<p>${d.innerHTML}</p>`);
    copiarFormatado(itens.join(''));
  };
}

/* ========================= PESQUISA AVANÇADA (P15) ===================== */

$('#btn-avancada').onclick = () => abrirBuscaAvancada();

async function abrirBuscaAvancada(semHistorico = false) {
  estado.telaAtual = 'busca';
  mostrarTela('tela-busca');
  if (!semHistorico) empilhar({ tela: 'busca' });
  const cats = await Categorias.listar();
  $('#filtro-tipo').innerHTML = '<option value="">Todos os tipos</option>' +
    R.TIPOS.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
  $('#filtro-categoria').innerHTML = '<option value="">Todas as categorias</option>' +
    '<option value="__sem__">Sem categoria</option>' +
    cats.map(c => `<option value="${c.id}">${esc(c.titulo)}</option>`).join('');
  $('#busca-avancada').focus();
  buscarAvancado();
}

['#busca-avancada', '#filtro-tipo', '#filtro-categoria', '#filtro-incompletas'].forEach(sel => {
  $(sel).addEventListener('input', () => {
    clearTimeout(tempoBusca);
    tempoBusca = setTimeout(buscarAvancado, 250);
  });
});

async function buscarAvancado() {
  const termo = $('#busca-avancada').value.trim();
  const tipo = $('#filtro-tipo').value;
  const cat = $('#filtro-categoria').value;
  const soIncompletas = $('#filtro-incompletas').checked;
  const alvo = $('#resultado-busca');

  let obras = await Livros.listar({ termo, limite: 100000 });
  if (tipo) obras = obras.filter(l => l.tipo === tipo);
  if (cat) obras = obras.filter(l => (l.categoria_id || '') === (cat === '__sem__' ? '' : cat));
  if (soIncompletas) obras = obras.filter(l => l.incompleta);

  let citacoes = [];
  if (termo.length >= 2) {
    citacoes = await Citacoes.buscarNoTexto(termo);
    if (tipo) citacoes = citacoes.filter(c => c._livro && c._livro.tipo === tipo);
    if (cat) citacoes = citacoes.filter(c => c._livro && (c._livro.categoria_id || '') === (cat === '__sem__' ? '' : cat));
  }

  alvo.innerHTML = `
    <h3 style="margin-top:6px">Citações (${citacoes.length})</h3>
    ${termo.length < 2 ? '<p class="dica">Escreva ao menos duas letras para procurar dentro do texto das citações.</p>' : ''}
    ${citacoes.map(c => `
      <div class="res-item" data-ir-obra="${c.livro_id}">
        <div>${realce(esc(c.texto.slice(0, 300)), termo)}${c.texto.length > 300 ? '…' : ''}</div>
        <div class="de">${esc(c._livro ? c._livro.titulo : 'obra removida')}
          ${c.pagina ? ' · p. ' + esc(c.pagina) : ''}${c.capitulo ? ' · ' + esc(c.capitulo) : ''}</div>
      </div>`).join('')}

    <h3 style="margin-top:18px">Obras (${obras.length})</h3>
    ${obras.slice(0, 100).map(l => `
      <div class="res-item" data-ir-obra="${l.id}">
        <b>${esc(l.titulo)}</b>
        <div class="de">${esc(autoresCurto(l))}${l.ano ? ' · ' + esc(l.ano) : ''}
          ${l.incompleta ? ' · <span class="falta">referência incompleta</span>' : ''}</div>
      </div>`).join('')}`;

  alvo.querySelectorAll('[data-ir-obra]').forEach(d => {
    d.onclick = () => telaObra(d.dataset.irObra);
  });
}

/* ============================== FICHAMENTO ============================== */

/**
 * Monta o fichamento no modelo do professor: o cabeçalho da obra e uma tabela
 * com as citações escolhidas. Aqui o usuário só marca o que entra e escolhe a
 * norma; quem desenha o PDF é o js/fichamento.js.
 */
async function janelaFichamento(livro) {
  const citacoes = await Citacoes.porLivro(livro.id);
  if (!citacoes.length) return aviso('Esta obra ainda não tem citações para o fichamento.');

  // O tipo da obra já responde pelo "Tipo de Obra" do fichamento; o único
  // campo que ainda pode faltar é o resumo.
  const faltando = [];
  if (!livro.sobre) faltando.push('de que trata a obra');

  /* As citações entram agrupadas pelas pastas da obra — é o que permite
     escolher "quero o fichamento só da pasta Autoria" com um clique só.
     A ordem segue a das pastas; as soltas ficam por último. */
  const pastas = await Pastas.porLivro(livro.id);
  const mestras = pastas.filter(p => !(p.pai_id || ''));
  const grupos = [];
  for (const m of mestras) {
    const filhas = pastas.filter(p => p.pai_id === m.id);
    const diretas = citacoes.filter(c => (c.pasta_id || '') === m.id);
    const dentro = citacoes.filter(c => filhas.some(f => f.id === (c.pasta_id || '')));
    if (!diretas.length && !dentro.length) continue;

    // A mestra entra mesmo sem citação direta: é ela que dá o guarda-chuva
    // para marcar o tema inteiro de uma vez.
    grupos.push({ id: m.id, pasta: m.titulo, nivel: 0, itens: diretas, ancestrais: [m.id] });
    for (const f of filhas) {
      const itens = citacoes.filter(c => (c.pasta_id || '') === f.id);
      if (itens.length) grupos.push({ id: f.id, pasta: f.titulo, nivel: 1, itens,
                                      ancestrais: [m.id, f.id] });
    }
  }
  const soltas = citacoes.filter(c => !(c.pasta_id || '') ||
                                       !pastas.some(p => p.id === c.pasta_id));
  if (soltas.length) grupos.push({ id: '', pasta: '', nivel: 0, itens: soltas, ancestrais: [''] });

  abrirJanela('Gerar fichamento', `
    <p class="dica">${esc(livro.titulo)}</p>

    ${faltando.length ? `<div class="alerta">
       Falta preencher, no cadastro da obra: <b>${esc(faltando.join(' e '))}</b>.
       Dá para gerar assim mesmo, mas esse campo aparece no cabeçalho do fichamento.
     </div>` : ''}

    <label class="rot">Modelo</label>
    <select class="campo" id="fic-modelo">
      <option value="turabian">Turabian — com notas de rodapé</option>
      <option value="abnt">ABNT — com a chamada no próprio texto</option>
    </select>

    <label class="rot" style="margin-top:10px">Formato do arquivo</label>
    <select class="campo" id="fic-formato">
      <option value="pdf">PDF — pronto para entregar ou imprimir</option>
      <option value="docx">Word (.docx) — para continuar editando</option>
    </select>
    <p class="dica" id="fic-dica-formato">O PDF sai exatamente como você vê aqui,
      e ninguém desconfigura sem querer.</p>

    <label class="rot" style="margin-top:10px">Notas repetidas (só no Turabian)</label>
    <select class="campo" id="fic-repetidas">
      <option value="completa">Repetir a nota completa em todas</option>
      <option value="abreviada">Da segunda em diante, forma abreviada</option>
      <option value="ibid">Da segunda em diante, <em>Ibid.</em></option>
    </select>
    <p class="dica" id="fic-dica-repetidas">É o que o modelo do seu professor faz.</p>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">
      <label class="rot" style="margin:0">Citações no fichamento</label>
      <span>
        <button class="btn pequeno" data-todas>Marcar todas</button>
        <button class="btn pequeno" data-nenhuma>Desmarcar</button>
      </span>
    </div>
    <div id="fic-lista" style="margin-top:8px">${grupos.map(g => `
      <div class="fic-grupo ${g.nivel ? 'sub' : ''}">
        ${(g.pasta || grupos.length > 1) ? `<label class="fic-pasta">
             <input type="checkbox" data-grupo="${esc(g.id || '_soltas')}" checked>
             <b>${g.nivel ? '↳ 📁' : '📂'} ${esc(g.pasta || 'Soltas')}</b>
             <small>${g.itens.length} citação(ões)${g.nivel === 0 && !g.itens.length
               ? ' direto aqui' : ''}</small>
           </label>` : ''}
        ${g.itens.map(c => `
          <label class="fic-item" data-grupos="${esc(g.ancestrais.join(' '))}">
            <input type="checkbox" data-cit="${c.id}" checked>
            <span>
              <b>${esc(c.assunto || c.capitulo || 'sem assunto')}</b>
              <small>${c.tipo === 'direta' ? 'citação direta' : 'citação indireta'}${c.pagina ? ' · p. ' + esc(c.pagina) : ''}</small>
              <span class="trecho">${esc(String(c.texto).slice(0, 150))}${c.texto.length > 150 ? '…' : ''}</span>
            </span>
          </label>`).join('')}
      </div>`).join('')}
    </div>`,
    `<button class="btn" data-cancela-fic>Cancelar</button>
     <button class="btn primario" data-gerar-fic>Gerar PDF</button>`);

  const marcadas = () => Array.from($('#fic-lista').querySelectorAll('[data-cit]'))
    .filter(i => i.checked).map(i => citacoes.find(c => c.id === i.dataset.cit));

  /* `~=` casa uma palavra dentro da lista separada por espaços: marcar a
     mestra pega também as citações das subpastas dela, que trazem o id da
     mestra na própria lista de ancestrais. */
  const caixasDoGrupo = id =>
    Array.from($('#fic-lista').querySelectorAll(`[data-grupos~="${CSS.escape(id || '_soltas')}"] [data-cit]`));

  /* A caixinha da pasta comanda as de dentro; e se alguém desmarcar uma
     citação à mão, a da pasta reflete isso (fica meio-marcada). */
  const reverGrupos = () => {
    $('#fic-lista').querySelectorAll('[data-grupo]').forEach(g => {
      const filhas = caixasDoGrupo(g.dataset.grupo);
      const marcadas = filhas.filter(i => i.checked).length;
      g.checked = marcadas > 0;
      g.indeterminate = marcadas > 0 && marcadas < filhas.length;
    });
  };

  $('#fic-lista').querySelectorAll('[data-grupo]').forEach(g => {
    g.onclick = e => {
      e.stopPropagation();
      caixasDoGrupo(g.dataset.grupo).forEach(i => { i.checked = g.checked; });
      g.indeterminate = false;
    };
  });
  $('#fic-lista').querySelectorAll('[data-cit]').forEach(i => { i.onchange = reverGrupos; });

  $('#fic-repetidas').onchange = e => {
    $('#fic-dica-repetidas').innerHTML = {
      completa: 'É o que o modelo do seu professor faz.',
      abreviada: 'Sai "Nichol, <i>Comentário bíblico</i>, 1100." — a forma que o Turabian 9 recomenda no caso geral.',
      ibid: 'Sai "Ibid., 1100." Vale porque todas as notas do fichamento são da mesma obra, em sequência — que é a condição exata do <i>Ibid.</i>'
    }[e.target.value];
  };

  $('[data-todas]').onclick = () => {
    $('#fic-lista').querySelectorAll('[data-cit]').forEach(i => { i.checked = true; });
    reverGrupos();
  };
  $('[data-nenhuma]').onclick = () => {
    $('#fic-lista').querySelectorAll('[data-cit]').forEach(i => { i.checked = false; });
    reverGrupos();
  };
  $('[data-cancela-fic]').onclick = fecharJanela;

  $('#fic-formato').onchange = e => {
    const docx = e.target.value === 'docx';
    $('[data-gerar-fic]').textContent = docx ? 'Gerar Word' : 'Gerar PDF';
    $('#fic-dica-formato').innerHTML = docx
      ? 'O arquivo abre no Word, no Google Docs e no LibreOffice. As notas de rodapé ' +
        'são notas de verdade: numeram sozinhas e continuam certas se você acrescentar ' +
        'um parágrafo antes.'
      : 'O PDF sai exatamente como você vê aqui, e ninguém desconfigura sem querer.';
  };

  $('[data-gerar-fic]').onclick = async function () {
    const escolhidas = marcadas();
    if (!escolhidas.length) return aviso('Marque ao menos uma citação.');
    this.disabled = true;
    const antes = this.textContent;
    this.textContent = 'Montando…';
    const formato = $('#fic-formato').value;
    const opcoes = {
      modelo: $('#fic-modelo').value,
      repetidas: $('#fic-repetidas').value        // completa | abreviada | ibid
    };
    try {
      if (formato === 'docx') {
        const { blob, nome } = window.Word.gerar(livro, escolhidas, opcoes);
        baixarBlob(blob, nome);
      } else {
        const { doc, nome } = window.Fichamento.gerar(livro, escolhidas, opcoes);
        doc.save(nome);
      }
      fecharJanela();
      aviso(`Fichamento gerado com ${escolhidas.length} citação(ões).`, 4000);
    } catch (e) {
      console.error(e);
      aviso(`Não consegui montar o ${formato === 'docx' ? 'Word' : 'PDF'}: ` + e.message, 6000);
    } finally {
      this.disabled = false; this.textContent = antes;
    }
  };
}

/* ============================== MINHA CONTA ============================= */

function janelaConta() {
  const lic = estado.licenca || {};
  abrirJanela('Minha conta', `
    <div class="conta-linha">
      <div class="quem">
        <b>${esc(lic.nome || lic.email || 'Conectado')}</b>
        <small>${esc(lic.email || '')}</small>
      </div>
    </div>
    <label class="rot">Licença</label>
    <p style="margin-top:2px">${esc(Auth.descreverLicenca(lic)) || '—'}
      ${lic.online === false ? '<br><span class="dica">conferida da última vez sem internet</span>' : ''}</p>
    ${lic.estado === 'leitura' ? `<div class="alerta">${esc(lic.motivo || '')} O aplicativo está em modo leitura.</div>` : ''}
    ${lic.admin ? '<a class="btn" href="painel/" style="display:block;text-align:center;text-decoration:none;margin-top:14px">Painel de usuários</a>' : ''}
  `, `<button class="btn" data-fechar-conta>Fechar</button>
      <button class="btn perigo" data-sair>Sair da conta</button>`);

  $('[data-fechar-conta]').onclick = fecharJanela;
  $('[data-sair]').onclick = async () => {
    if (!await confirmar('Sair da conta',
      'Sua biblioteca <b>continua guardada neste aparelho</b> — nada será apagado. ' +
      'Você vai precisar do e-mail e da senha para entrar de novo.', 'Sair', false)) return;
    if (window.Nuvem && Nuvem.LIGADA) {
      // Uma última tentativa de subir o que ainda não subiu, para nada ficar
      // preso neste aparelho. Se não der, os dados continuam aqui de todo jeito.
      try { await Nuvem.sincronizar(); } catch { /* segue */ }
      await Nuvem.aoSair();
    }
    Auth.sair();
    location.reload();
  };
}

/* ============================= CONFIGURAÇÕES =========================== */

$('#btn-config').onclick = async () => {
  const esp = await espacoUsado();
  const persistente = navigator.storage && navigator.storage.persisted
    ? await navigator.storage.persisted() : false;
  const [nC, nL, nCit] = await Promise.all([
    window.DB.db.categorias.count(), window.DB.db.livros.count(), window.DB.db.citacoes.count()
  ]);
  const ultimo = await Config.ler('ultima_exportacao', null);

  abrirJanela('Configurações', `
    <h3>Sua biblioteca</h3>
    <p class="dica">${nC} categoria(s) · ${nL} obra(s) · ${nCit} citação(ões)
      ${esp ? `<br>Espaço usado: ${(esp.usado / 1048576).toFixed(1)} MB de ${(esp.total / 1048576).toFixed(0)} MB disponíveis` : ''}
      <br>Último arquivo exportado: ${ultimo ? esc(new Date(ultimo).toLocaleString('pt-BR')) : 'nunca'}</p>

    <h3 style="margin-top:18px">Backup</h3>
    <button class="btn primario" data-exportar style="width:100%;margin-bottom:8px">⬇ Exportar arquivo com tudo</button>
    <label class="btn" style="width:100%;display:block;text-align:center;cursor:pointer">
      ⬆ Importar arquivo de backup<input type="file" id="arq-importar" accept="application/json" hidden>
    </label>
    <p class="dica">Guarde o arquivo no Drive, no e-mail ou no computador. O backup automático no
      Google Drive entra na Fase 4.</p>

    <h3 style="margin-top:18px">Aparelho</h3>
    <p class="dica">Armazenamento persistente: <b>${persistente ? 'ligado' : 'não concedido'}</b> —
      quando ligado, o navegador não apaga sua biblioteca para liberar espaço.</p>
    ${persistente ? '' : '<button class="btn" data-persistir style="width:100%">Pedir armazenamento persistente</button>'}

    <h3 style="margin-top:18px">Aparência</h3>
    <select class="campo" id="tema">
      <option value="auto">Seguir o aparelho</option>
      <option value="claro">Sempre claro</option>
      <option value="escuro">Sempre escuro</option>
    </select>

    <h3 style="margin-top:18px">Manutenção</h3>
    <button class="btn" data-exemplos style="width:100%;margin-bottom:8px">Carregar dados de exemplo</button>
    <button class="btn perigo" data-apagar style="width:100%">Apagar tudo deste aparelho</button>

    ${(window.Nuvem && Nuvem.LIGADA) ? `
    <h3 style="margin-top:18px">Sincronização</h3>
    <p class="dica" id="cfg-nuvem">—</p>
    <button class="btn" data-sincronizar style="width:100%;margin-bottom:8px">↻ Sincronizar agora</button>
    <button class="btn" data-nuvem-rebaixar style="width:100%">Baixar tudo de novo da minha conta</button>
    <p class="dica">"Baixar tudo de novo" serve quando este aparelho parece estar
      desatualizado: ele esquece o que já conversou e confere a biblioteca inteira,
      registro por registro. Não apaga nada — o que existe só aqui continua aqui e
      sobe na mesma passada.</p>` : ''}

    <h3 style="margin-top:18px">Versão</h3>
    <p class="dica">Este aparelho está com a versão <b id="versao-app">${VERSAO_APP}</b>.
      Se você acabou de publicar uma correção e ela não aparece, use o botão abaixo.</p>
    <button class="btn" data-atualizar style="width:100%">↻ Buscar atualização agora</button>`,
    `<button class="btn" data-fechar4>Fechar</button>`);

  $('#tema').value = localStorage.getItem('tema') || 'auto';
  $('#tema').onchange = e => {
    localStorage.setItem('tema', e.target.value);
    aplicarTema();
  };

  $('[data-fechar4]').onclick = fecharJanela;
  $('[data-exportar]').onclick = exportarArquivo;

  const cfgNuvem = $('#cfg-nuvem');
  if (cfgNuvem) {
    const pintar = () => {
      const e = Nuvem.estado;
      cfgNuvem.innerHTML = e.rodando ? 'Sincronizando agora…'
        : e.erro ? `<b>Última tentativa falhou:</b> ${esc(e.erro)}`
        : e.ultimo ? `Última sincronização: ${esc(new Date(e.ultimo).toLocaleString('pt-BR'))}`
        : 'Este aparelho ainda não sincronizou.';
    };
    pintar();
    const solta = Nuvem.aoMudar(pintar);
    $('[data-sincronizar]').onclick = async () => {
      aviso('Sincronizando…', 3000);
      const r = await Nuvem.sincronizar();
      pintar();
      if (r && r.erro) return aviso('Não deu certo: ' + r.erro, 6000);
      await recarregar();
      aviso(`Pronto. ${r.enviados || 0} enviado(s), ${r.recebidos || 0} recebido(s).`, 4000);
    };
    $('[data-nuvem-rebaixar]').onclick = async () => {
      if (!await confirmar('Conferir a biblioteca inteira',
        'Vou comparar cada obra e cada citação deste aparelho com a sua conta. ' +
        'Pode demorar um pouco se a biblioteca for grande. <b>Nada é apagado.</b>',
        'Conferir tudo', false)) return;
      await Nuvem.esquecerMarcadores();
      await Nuvem.marcarPrimeiraResolvida();
      aviso('Conferindo tudo…', 4000);
      const r = await Nuvem.sincronizar();
      pintar();
      await recarregar();
      aviso(r && r.erro ? 'Não deu certo: ' + r.erro
        : `Conferido. ${r.enviados || 0} enviado(s), ${r.recebidos || 0} recebido(s).`, 5000);
    };
    // a janela é descartada ao fechar; o ouvinte tem que ir junto
    const fecharAntes = aoFechar;
    aoFechar = () => { solta(); if (fecharAntes) fecharAntes(); };
  }
  $('[data-atualizar]').onclick = async () => {
    aviso('Procurando versão nova…', 4000);
    try {
      // Joga fora o cache do service worker e busca tudo de novo do servidor.
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const nomes = await caches.keys();
        await Promise.all(nomes.map(n => caches.delete(n)));
      }
    } catch { /* se o navegador não deixar, o reload abaixo ainda ajuda */ }
    location.reload();
  };
  $('#arq-importar').onchange = e => importarArquivo(e.target.files[0]);
  const bp = $('[data-persistir]');
  if (bp) bp.onclick = async () => {
    const ok = await pedirPersistencia();
    aviso(ok ? 'Concedido: sua biblioteca está protegida.' : 'O navegador não concedeu agora.');
  };
  $('[data-exemplos]').onclick = async () => {
    const criou = await semearExemplos();
    fecharJanela(); recarregar();
    aviso(criou ? 'Exemplos carregados.' : 'Você já tem obras cadastradas.');
  };
  $('[data-apagar]').onclick = async () => {
    const naNuvem = window.Nuvem && Nuvem.LIGADA;
    if (!await confirmar('Apagar tudo',
      'Todas as categorias, obras e citações <b>deste aparelho</b> serão apagadas. ' +
      'Exporte um arquivo antes se quiser guardar. Isso não tem como desfazer.' +
      (naNuvem ? '<br><br><span class="dica">A sua conta na nuvem <b>não</b> é apagada: ' +
                 'ao abrir de novo, o aparelho baixa a biblioteca outra vez. Para apagar ' +
                 'de verdade, exclua as obras uma a uma — aí sim a exclusão viaja para os ' +
                 'outros aparelhos.</span>' : ''),
      'Apagar tudo')) return;
    await window.DB.db.delete();
    location.reload();
  };
};

/* Entrega um arquivo ao usuário. Fica numa função só porque o navegador tem
   uma exigência chata: o endereço temporário do arquivo precisa ser liberado
   depois, senão a imagem/arquivo fica ocupando memória até fechar a aba. */
function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportarArquivo() {
  aviso('Preparando o arquivo…');
  const dados = await exportarTudo();
  const blob = new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  a.download = `auxiliar-de-pesquisa-${d}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  await Config.gravar('ultima_exportacao', new Date().toISOString());
  aviso(`Arquivo gerado: ${dados.contagem.livros} obra(s) e ${dados.contagem.citacoes} citação(ões).`, 4000);
}

async function importarArquivo(arquivo) {
  if (!arquivo) return;
  if (!podeEditar()) return avisoLeitura();
  let dados;
  try {
    dados = JSON.parse(await arquivo.text());
  } catch { return aviso('Não consegui ler este arquivo.'); }

  const c = dados.contagem || {};
  abrirJanela('Importar backup', `
    <p>O arquivo tem <b>${c.livros || 0} obra(s)</b>, <b>${c.citacoes || 0} citação(ões)</b>
       e <b>${c.categorias || 0} categoria(s)</b>, exportado em
       ${esc(dados.exportado_em ? new Date(dados.exportado_em).toLocaleString('pt-BR') : 'data desconhecida')}.</p>
    <p>Como você quer trazer esses dados?</p>`,
    `<button class="btn" data-cancelar>Cancelar</button>
     <button class="btn" data-substituir>Substituir tudo</button>
     <button class="btn primario" data-juntar>Juntar com o que já existe</button>`);

  const rodar = async modo => {
    try {
      const r = await importarTudo(dados, modo);
      fecharJanela(); recarregar();
      aviso(`Importado: ${r.livros} obra(s), ${r.citacoes} citação(ões).`, 4000);
    } catch (e) { aviso(e.message, 5000); }
  };
  $('[data-cancelar]').onclick = fecharJanela;
  $('[data-juntar]').onclick = () => rodar('juntar');
  $('[data-substituir]').onclick = async () => {
    if (await confirmar('Substituir tudo',
      'O que está neste aparelho será apagado e trocado pelo conteúdo do arquivo.', 'Substituir')) rodar('substituir');
  };
}

/* ============================ LOGIN E LICENÇA =========================== */

const Auth = window.Auth;

function painelLogin(qual) {
  $$('#tela-login [data-painel]').forEach(p => { p.hidden = p.dataset.painel !== qual; });
  $('#login-erro').hidden = true;
  const foco = { entrar: '#login-email', primeiro: '#pa-email', esqueci: '#es-email' }[qual];
  const el = $(foco); if (el) el.focus();
}

function erroLogin(msg) {
  const el = $('#login-erro');
  el.textContent = msg;
  el.hidden = false;
}

$$('#tela-login [data-ir]').forEach(b => {
  b.onclick = () => painelLogin(b.dataset.ir);
});

// Enter em qualquer campo aciona o botão principal daquele painel.
$('#tela-login').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const painel = e.target.closest('[data-painel]');
  if (painel) painel.querySelector('.btn.primario')?.click();
});

async function comEspera(botao, fn) {
  const texto = botao.textContent;
  botao.disabled = true; botao.textContent = 'Aguarde…';
  try { await fn(); }
  catch (e) { erroLogin(e.message || 'Não consegui completar.'); }
  finally { botao.disabled = false; botao.textContent = texto; }
}

$('#bt-entrar').onclick = function () {
  comEspera(this, async () => {
    const email = $('#login-email').value.trim();
    const senha = $('#login-senha').value;
    if (!email || !senha) throw new Error('Preencha o e-mail e a senha.');
    await Auth.entrar(email, senha, $('#login-permanecer').checked);
    await entrarNoApp();
  });
};

$('#bt-primeiro').onclick = function () {
  comEspera(this, async () => {
    const email = $('#pa-email').value.trim();
    const codigo = $('#pa-codigo').value.trim();
    const senha = $('#pa-senha').value;
    if (!email || !codigo) throw new Error('Preencha o e-mail e o código.');
    if (senha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');
    if (senha !== $('#pa-senha2').value) throw new Error('As duas senhas não são iguais.');
    await Auth.primeiroAcesso(email, codigo, senha);
    await entrarNoApp();
    aviso('Bem-vindo! Sua senha foi criada.', 4000);
  });
};

$('#bt-esqueci').onclick = function () {
  comEspera(this, async () => {
    const email = $('#es-email').value.trim();
    if (!email) throw new Error('Escreva o seu e-mail.');
    await Auth.recuperarSenha(email);
    painelLogin('entrar');
    aviso('Se este e-mail estiver cadastrado, o link de redefinição chegou na caixa de entrada.', 5000);
  });
};

/**
 * Decide o que mostrar quando o aplicativo abre (ou depois de entrar).
 * 'aberto'    → login não configurado: funciona como na Fase 1
 * 'sem_conta' → tela de login
 * 'ok'        → aplicativo completo
 * 'leitura'   → aplicativo completo para consultar, sem gravar (decisão P3)
 */
async function entrarNoApp() {
  const lic = await Auth.situacao();
  estado.licenca = lic;

  if (lic.estado === 'sem_conta') {
    mostrarTela('tela-login');
    painelLogin('entrar');
    $('#faixa-licenca').hidden = true;
    return false;
  }

  document.body.classList.toggle('so-leitura', lic.estado === 'leitura');
  desenharFaixaLicenca(lic);
  mostrarTela('tela-inicio');
  estado.telaAtual = 'inicio';
  await recarregar();
  ligarNuvem(lic);
  return true;
}

/* ------------------------------------------------------------- a nuvem
   Roda depois que a tela já está de pé: sincronizar é coisa de segundo
   plano e não pode atrasar a abertura do aplicativo.
--------------------------------------------------------------------------*/
async function ligarNuvem(lic) {
  if (!window.Nuvem || !Nuvem.LIGADA) return;
  if (lic.estado !== 'ok' && lic.estado !== 'leitura') return;

  await Nuvem.carregarUltimo();
  Nuvem.aoMudar(pintarNuvem);
  Nuvem.aoReceber = () => recarregar();
  pintarNuvem(Nuvem.estado);

  // Licença vencida não envia nada — mas continua BAIXANDO, para a pessoa
  // poder consultar de outro aparelho o que já era dela.
  const orfas = await Nuvem.acervoLocalOrfao();
  if (orfas > 0) { await perguntarAcervoLocal(orfas); return; }

  Nuvem.sincronizar().then(r => { if (r && r.recebidos) recarregar(); });
}

async function perguntarAcervoLocal(quantas) {
  const sim = await confirmar('Enviar sua biblioteca para a conta',
    `Encontrei <b>${quantas} obra(s)</b> cadastradas neste aparelho de antes da ` +
    `sincronização existir.<br><br>Quer enviá-las para a sua conta? ` +
    `Depois disso elas aparecem em qualquer aparelho onde você entrar.<br><br>` +
    `<span class="dica">Se este aparelho for emprestado e as obras não forem suas, ` +
    `responda "Agora não" — elas continuam aqui, sem ir para lugar nenhum.</span>`,
    'Enviar para a minha conta', false);

  if (sim) await Nuvem.adotarAcervoLocal();
  else {
    // Não envia agora, mas também não pergunta a cada abertura. O botão em
    // Configurações continua disponível quando ele mudar de ideia.
    await Nuvem.marcarPrimeiraResolvida();
    aviso('Tudo bem — nada foi enviado. Dá para fazer isso depois, em Configurações.', 5000);
    return;
  }
  Nuvem.sincronizar().then(r => { if (r && r.recebidos) recarregar(); });
}

/* A tarja discreta que diz como está a conversa com a nuvem. */
function pintarNuvem(e) {
  const el = $('#faixa-nuvem');
  if (!el) return;
  if (!e.ligada) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('com-erro', !!e.erro);
  if (e.rodando) { el.innerHTML = '<span class="girando">↻</span> sincronizando…'; return; }
  if (e.erro)    { el.innerHTML = `⚠ ${esc(e.erro)}`; return; }
  el.textContent = e.ultimo
    ? `✓ sincronizado ${quandoFoi(e.ultimo)}`
    : '· ainda não sincronizado';
}

function quandoFoi(iso) {
  const seg = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (seg < 60)   return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  return 'em ' + new Date(iso).toLocaleDateString('pt-BR');
}

$('#btn-conta').onclick = janelaConta;

function desenharFaixaLicenca(lic) {
  // o botão da conta só existe quando há login configurado
  $('#btn-conta').hidden = !(Auth.LIGADO && lic.estado && lic.estado !== 'aberto');

  const faixa = $('#faixa-licenca');
  if (lic.estado === 'leitura') {
    faixa.innerHTML = `<b>Modo leitura.</b> ${esc(lic.motivo || '')}
      Suas citações continuam aqui e podem ser exportadas pelo menu.`;
    faixa.hidden = false;
    return;
  }
  // aviso amigável quando falta pouco para vencer
  const dias = lic.expira_em
    ? Math.ceil((new Date(lic.expira_em) - Date.now()) / 86400000) : null;
  if (dias !== null && dias <= 7) {
    faixa.innerHTML = `Sua licença vence em <b>${dias} dia(s)</b>.`;
    faixa.hidden = false;
  } else {
    faixa.hidden = true;
  }
}

/* ================================ TEMA ================================= */

function aplicarTema() {
  const t = localStorage.getItem('tema') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
}

/* ================================ INÍCIO =============================== */

async function iniciar() {
  aplicarTema();
  try { history.replaceState({ tela: 'inicio' }, ''); } catch { /* nada */ }
  estado.telaAtual = 'inicio';

  // pede o armazenamento persistente uma vez só
  if (!localStorage.getItem('pediu_persistencia')) {
    localStorage.setItem('pediu_persistencia', '1');
    pedirPersistencia().catch(() => {});
  }

  await entrarNoApp();

  if ('serviceWorker' in navigator) {
    // Havia um service worker mandando nesta página quando ela abriu?
    // Se havia e outro assumir o lugar, é porque saiu versão nova: recarrega
    // uma vez sozinho. Sem isso, a primeira atualização depois de publicar só
    // aparecia no segundo recarregamento — a página já tinha lido os arquivos
    // velhos do cache antes de o service worker novo entrar.
    const jaTinhaControle = !!navigator.serviceWorker.controller;
    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!jaTinhaControle || recarregando) return;
      recarregando = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker:', e));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  iniciar().catch(e => {
    console.error(e);
    document.body.innerHTML =
      `<main><h2>Não consegui abrir o banco de dados</h2>
       <p>${esc(e.message)}</p>
       <p class="dica">Isso costuma acontecer em janela anônima ou com os dados do site bloqueados.</p></main>`;
  });
});

// deixa à mão para testes no console do navegador
window.APP = { estado, recarregar, telaObra, formObra, formCitacao, exportarArquivo };

})();
