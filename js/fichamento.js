/* ==========================================================================
   fichamento.js — Gera o PDF do fichamento
   --------------------------------------------------------------------------
   Segue o modelo do professor:

       Dados da Obra:      (a referência bibliográfica completa)
       Tipo de Obra:       Livro impresso (comentário bíblico).
       De que trata a obra: ...

       ┌──────────────────┬───────────┬──────────────────────────────┐
       │ Tipo de Citação  │ Assunto   │ Informações para o fichamento│
       └──────────────────┴───────────┴──────────────────────────────┘

   No modelo Turabian, cada citação recebe um número que vira nota de rodapé
   no pé da página. No modelo ABNT, em vez da nota vai a chamada no próprio
   texto — (NICHOL, 2013, p. 1099) —, como manda o sistema autor-data.

   O PDF é montado à mão com jsPDF, sem biblioteca de tabela: é o que permite
   ter itálico no meio da frase, nota no rodapé da página certa e quebra de
   página sem cortar linha no meio.
   ========================================================================== */

(function () {

const R = window.Referencias;

/* ------------------------------------------------------------- medidas ---
   Tudo em milímetros; as fontes, em pontos. Turabian pede margem de uma
   polegada (25,4 mm) e corpo em Times 12.
--------------------------------------------------------------------------*/
const PAG = { l: 210, a: 297 };
const M = { esq: 25, dir: 25, topo: 25, baixo: 22 };
const LARGURA = PAG.l - M.esq - M.dir;            // 160 mm
const COL = [34, 30, LARGURA - 64];               // tipo · assunto · informações
const PAD = 2;                                    // respiro dentro da célula
const CORPO = 12, NOTA = 9.5, TITULO = 12;
const mm = pt => pt * 0.3528;                     // ponto → milímetro
const alturaLinha = tam => mm(tam) * 1.18;

const semAcento = t => String(t || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s.-]/g, '').trim();

/* --------------------------------------------------------- texto com estilo
   O gerador de referências devolve HTML (com <i> e <b>). Aqui esse HTML vira
   uma lista de pedaços — cada um com o seu estilo — para o jsPDF conseguir
   escrever itálico no meio da linha.
--------------------------------------------------------------------------*/

function partesDeHTML(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '');
  const partes = [];
  (function andar(no, estilo) {
    no.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        if (n.nodeValue) partes.push({ t: n.nodeValue, e: estilo });
      } else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        const novo = (tag === 'i' || tag === 'em') ? 'italic'
                   : (tag === 'b' || tag === 'strong') ? 'bold' : estilo;
        andar(n, novo);
      }
    });
  })(div, 'normal');
  return partes;
}

const texto = (t, e = 'normal') => [{ t: String(t), e }];

/** Quebra uma lista de pedaços em linhas que caibam na largura dada. */
function quebrar(doc, partes, largura, tam) {
  doc.setFontSize(tam);
  const linhas = [[]];
  let usado = 0;
  for (const parte of partes) {
    // "sobre" = número da nota, escrito menor e um pouco acima da linha.
    // Não dá para usar ⁴⁵⁶ do Unicode: as fontes padrão do PDF só têm ¹²³.
    const ehSobre = parte.e === 'sobre';
    const tamParte = ehSobre ? tam * 0.72 : tam;
    const estilo = ehSobre ? 'normal' : parte.e;
    for (const pedaco of String(parte.t).split(/(\s+)/)) {
      if (!pedaco) continue;
      const espaco = !/\S/.test(pedaco);
      doc.setFontSize(tamParte);
      doc.setFont('times', estilo);
      const w = doc.getTextWidth(pedaco);
      if (espaco && usado === 0) continue;                  // linha não começa com espaço
      if (!espaco && usado + w > largura && usado > 0) {
        linhas.push([]); usado = 0;
      }
      linhas[linhas.length - 1].push({
        t: pedaco, e: estilo, w, tam: tamParte,
        dy: ehSobre ? -mm(tam) * 0.3 : 0
      });
      usado += w;
    }
  }
  return linhas;
}

function desenharLinha(doc, linha, x, y, tam) {
  let cursor = x;
  for (const f of linha) {
    doc.setFontSize(f.tam || tam);
    doc.setFont('times', f.e);
    doc.text(f.t, cursor, y + (f.dy || 0));
    cursor += f.w;
  }
}

/* ============================== o documento ============================= */

function gerar(livro, citacoes, opcoes = {}) {
  const modelo = opcoes.modelo === 'abnt' ? 'abnt' : 'turabian';
  const abreviarNotas = !!opcoes.abreviarNotas;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = M.topo;
  let pagina = 1;
  let notasDaPagina = [];      // notas ainda por desenhar no pé desta página
  let numeroNota = 0;

  const alturaNotas = () => {
    if (!notasDaPagina.length) return 0;
    let h = 7;                                       // risquinho + respiro
    for (const n of notasDaPagina) h += n.linhas.length * alturaLinha(NOTA) + 0.6;
    return h;
  };

  const espacoLivre = () => PAG.a - M.baixo - y - alturaNotas();

  function fecharPagina() {
    // notas de rodapé, se houver
    if (notasDaPagina.length) {
      // O risquinho fica acima da primeira nota; sem folga suficiente ele
      // passava por cima do texto.
      let yn = PAG.a - M.baixo - alturaNotas() + 7;
      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      doc.line(M.esq, yn - 4.5, M.esq + 45, yn - 4.5);
      for (const n of notasDaPagina) {
        for (let i = 0; i < n.linhas.length; i++) {
          if (i === 0) {
            doc.setFont('times', 'normal');
            doc.setFontSize(NOTA * 0.72);
            doc.text(String(n.numero), M.esq, yn - mm(NOTA) * 0.3);
            const recuo = doc.getTextWidth(String(n.numero)) + 0.8;
            desenharLinha(doc, n.linhas[0], M.esq + recuo, yn, NOTA);
          } else {
            desenharLinha(doc, n.linhas[i], M.esq, yn, NOTA);
          }
          yn += alturaLinha(NOTA);
        }
        yn += 0.6;
      }
      notasDaPagina = [];
    }
    // número da página, como no modelo
    doc.setFont('times', 'normal');
    doc.setFontSize(CORPO);
    doc.text(String(pagina), PAG.l / 2, PAG.a - 12, { align: 'center' });
  }

  function novaPagina() {
    fecharPagina();
    doc.addPage();
    pagina++;
    y = M.topo;
  }

  /* ---------------------------------------------------------- cabeçalho */

  function paragrafo(rotulo, partes, espacoDepois = 5) {
    const rotuloPartes = texto(rotulo + ' ', 'bold').concat(partes);
    const linhas = quebrar(doc, rotuloPartes, LARGURA, CORPO);
    if (espacoLivre() < linhas.length * alturaLinha(CORPO)) novaPagina();
    for (const linha of linhas) {
      y += alturaLinha(CORPO);
      desenharLinha(doc, linha, M.esq, y, CORPO);
    }
    y += espacoDepois;
  }

  const formatoRef = modelo === 'abnt' ? 'abnt-ref' : 'turabian-bib';
  paragrafo('Dados da Obra:', partesDeHTML(R.gerar(livro, {}, formatoRef).html));
  paragrafo('Tipo de Obra:', texto(descreverTipo(livro)));
  paragrafo('De que trata a obra:', texto(livro.sobre || '—'), 7);

  /* ------------------------------------------------------------- tabela */

  const cabecalhos = ['Tipo de Citação', 'Assunto', 'Informações para o fichamento'];

  function desenharCabecalhoTabela() {
    const altura = alturaLinha(CORPO) + PAD * 2 - 1;
    if (espacoLivre() < altura + 8) novaPagina();
    doc.setFillColor(200, 200, 200);
    doc.rect(M.esq, y, LARGURA, altura, 'F');
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(M.esq, y, LARGURA, altura);
    let x = M.esq;
    cabecalhos.forEach((c, i) => {
      doc.setFont('times', 'bold');
      doc.setFontSize(CORPO);
      doc.text(c, x + PAD, y + PAD + mm(CORPO) * 0.85);
      if (i > 0) doc.line(x, y, x, y + altura);
      x += COL[i];
    });
    y += altura;
  }

  desenharCabecalhoTabela();

  for (const c of citacoes) {
    numeroNota++;

    // a coluna das informações: texto da citação + a marca da fonte
    const corpoPartes = [];
    const aspas = c.tipo === 'direta';
    corpoPartes.push({ t: (aspas ? '“' : '') + String(c.texto || '').trim() +
                          (aspas ? '”' : ''), e: 'normal' });

    let notaLinhas = null;
    if (modelo === 'turabian') {
      corpoPartes.push({ t: String(numeroNota), e: 'sobre' });
      const primeira = numeroNota === 1 || !abreviarNotas;
      const html = R.gerar(livro, { pagina: c.pagina, capitulo: c.capitulo },
                           primeira ? 'turabian-nota' : 'turabian-abrev').html;
      notaLinhas = quebrar(doc, partesDeHTML(html), LARGURA, NOTA);
    } else {
      corpoPartes[0].t += ' ';
      corpoPartes.push(...partesDeHTML(
        R.gerar(livro, { pagina: c.pagina }, 'abnt-autordata').html));
      corpoPartes.push({ t: '.', e: 'normal' });
    }

    const celulas = [
      quebrar(doc, texto(c.tipo === 'direta' ? 'Citação direta' : 'Citação indireta'), COL[0] - PAD * 2, CORPO),
      quebrar(doc, texto(c.assunto || c.capitulo || ''), COL[1] - PAD * 2, CORPO),
      quebrar(doc, corpoPartes, COL[2] - PAD * 2, CORPO)
    ];
    const maxLinhas = Math.max(...celulas.map(l => l.length));
    const altura = maxLinhas * alturaLinha(CORPO) + PAD * 2;

    // cabe nesta página, contando o espaço que a nota vai ocupar embaixo?
    const alturaDaNota = notaLinhas ? notaLinhas.length * alturaLinha(NOTA) + 0.6 : 0;
    if (espacoLivre() - alturaDaNota < altura) {
      novaPagina();
      desenharCabecalhoTabela();
    }
    if (notaLinhas) notasDaPagina.push({ numero: numeroNota, linhas: notaLinhas });

    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(M.esq, y, LARGURA, altura);
    let x = M.esq;
    celulas.forEach((linhas, i) => {
      if (i > 0) doc.line(x, y, x, y + altura);
      let yy = y + PAD + mm(CORPO) * 0.85;
      for (const linha of linhas) {
        desenharLinha(doc, linha, x + PAD, yy, CORPO);
        yy += alturaLinha(CORPO);
      }
      x += COL[i];
    });
    y += altura;
  }

  fecharPagina();

  const nome = `Fichamento - ${semAcento(livro.titulo).slice(0, 60) || 'obra'}.pdf`;
  return { doc, nome };
}

/* --------------------------------------------------------------- apoio */

// "Livro impresso (comentário bíblico)." — como no modelo do professor
function descreverTipo(l) {
  const tipo = (R.TIPOS.find(t => t.id === l.tipo) || {}).nome || 'Obra';
  const formato = l.formato === 'digital' ? 'digital'
                : l.formato === 'impresso' ? 'impresso' : '';
  const genero = (l.genero || '').trim();
  return `${tipo}${formato ? ' ' + formato : ''}${genero ? ' (' + genero + ')' : ''}.`;
}

window.Fichamento = { gerar, descreverTipo, partesDeHTML };

})();
