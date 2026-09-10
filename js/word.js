/* ==========================================================================
   word.js — O fichamento em Word (.docx), montado à mão
   --------------------------------------------------------------------------
   POR QUE SEM BIBLIOTECA

   Um .docx não é um formato misterioso: é um arquivo ZIP com meia dúzia de
   XMLs dentro. Escrever esses XMLs custa este arquivo; carregar uma biblioteca
   pronta custaria uns 500 KB que o aplicativo teria de guardar no aparelho
   para continuar funcionando sem internet. Para um documento com a forma fixa
   que o fichamento tem, não compensa.

   O QUE SAI DAQUI É UM .DOCX DE VERDADE — não é um HTML com outro nome. O Word
   abre sem reclamar, e as notas de rodapé são notas de rodapé mesmo: numeram
   sozinhas, e continuam certas se o professor acrescentar um parágrafo antes.

   AS PEÇAS DO ARQUIVO

     [Content_Types].xml   diz ao Word que tipo é cada peça
     _rels/.rels           aponta para o documento principal
     word/document.xml     o texto, a tabela, a divisão da página
     word/_rels/…rels      liga o documento aos estilos, notas e rodapé
     word/styles.xml       Times 12 no corpo, 10 na nota, número sobrescrito
     word/footnotes.xml    as notas de rodapé
     word/footer1.xml      o número da página, centralizado

   O ZIP é gravado sem compressão (método "store"). Um fichamento tem alguns
   quilobytes; comprimir exigiria embutir um compressor inteiro para economizar
   um punhado de bytes.
   ========================================================================== */

(function () {

const R = window.Referencias;

/* ============================== o ZIP =================================== */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Monta um ZIP a partir de { caminho: texto }.
 * A data é fixa de propósito: gerar o mesmo fichamento duas vezes devolve
 * arquivos idênticos, o que torna qualquer conferência possível.
 */
function zipar(arquivos) {
  const cod = new TextEncoder();
  const partes = [];      // pedaços do arquivo final
  const centrais = [];    // as entradas do índice, montadas em paralelo
  let posicao = 0;

  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const nomeBytes = cod.encode(nome);
    const dados = cod.encode(conteudo);
    const crc = crc32(dados);

    const cabecalho = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800),   // 0x0800 = nome em UTF-8
      ...u16(0), ...u16(0), ...u16(0),                  // sem compressão, data zerada
      ...u32(crc), ...u32(dados.length), ...u32(dados.length),
      ...u16(nomeBytes.length), ...u16(0)
    ];
    partes.push(new Uint8Array(cabecalho), nomeBytes, dados);

    centrais.push({ nome: nomeBytes, crc, tamanho: dados.length, offset: posicao });
    posicao += cabecalho.length + nomeBytes.length + dados.length;
  }

  const inicioIndice = posicao;
  for (const c of centrais) {
    const entrada = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800),
      ...u16(0), ...u16(0), ...u16(0),
      ...u32(c.crc), ...u32(c.tamanho), ...u32(c.tamanho),
      ...u16(c.nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(c.offset)
    ];
    partes.push(new Uint8Array(entrada), c.nome);
    posicao += entrada.length + c.nome.length;
  }

  partes.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(centrais.length), ...u16(centrais.length),
    ...u32(posicao - inicioIndice), ...u32(inicioIndice), ...u16(0)
  ]));

  return new Blob(partes, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

/* ============================ o texto ==================================== */

const x = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Converte os pedaços com estilo (o mesmo formato que o PDF usa) em <w:r>.
 * `xml:space="preserve"` é obrigatório: sem ele o Word come os espaços das
 * pontas e as palavras grudam umas nas outras.
 */
function corridas(partes, { tam = null } = {}) {
  return partes.map(p => {
    const props = [];
    if (p.e === 'italic') props.push('<w:i/>');
    if (p.e === 'bold') props.push('<w:b/>');
    if (tam) props.push(`<w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/>`);
    const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
    return `<w:r>${rPr}<w:t xml:space="preserve">${x(p.t)}</w:t></w:r>`;
  }).join('');
}

const html = h => window.Fichamento.partesDeHTML(h);
const puro = (t, e = 'normal') => [{ t: String(t), e }];

function paragrafo(conteudo, { estilo = '', depois = 120, jc = '' } = {}) {
  const pPr = [
    estilo ? `<w:pStyle w:val="${estilo}"/>` : '',
    jc ? `<w:jc w:val="${jc}"/>` : '',
    `<w:spacing w:after="${depois}" w:line="240" w:lineRule="auto"/>`
  ].join('');
  return `<w:p><w:pPr>${pPr}</w:pPr>${conteudo}</w:p>`;
}

/* ============================= o documento =============================== */

// A4 em twips (1 polegada = 1440). Turabian pede margem de uma polegada.
const PAGINA = { l: 11906, a: 16838, margem: 1440 };
const UTIL = PAGINA.l - PAGINA.margem * 2;          // 9026
const COLUNAS = [1900, 1700, UTIL - 3600];          // tipo · assunto · informações

function celula(largura, conteudo, { fundo = '' } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>` +
         (fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fundo}"/>` : '') +
         `</w:tcPr>${conteudo}</w:tc>`;
}

function gerar(livro, citacoes, opcoes = {}) {
  const modelo = opcoes.modelo === 'abnt' ? 'abnt' : 'turabian';
  const abreviarNotas = !!opcoes.abreviarNotas;

  const corpo = [];
  const notas = [];
  let idNota = 2;                 // 0 e 1 são os separadores que o Word reserva

  /* ------------------------------------------------------- o cabeçalho */
  const formatoRef = modelo === 'abnt' ? 'abnt-ref' : 'turabian-bib';
  corpo.push(paragrafo(
    corridas(puro('Dados da Obra: ', 'bold').concat(html(R.gerar(livro, {}, formatoRef).html)))));
  corpo.push(paragrafo(
    corridas(puro('Tipo de Obra: ', 'bold').concat(puro(window.Fichamento.descreverTipo(livro))))));
  corpo.push(paragrafo(
    corridas(puro('De que trata a obra: ', 'bold').concat(puro(livro.sobre || '—'))), { depois: 240 }));

  /* ---------------------------------------------------------- a tabela */
  const cabecalhos = ['Tipo de Citação', 'Assunto', 'Informações para o fichamento'];
  const linhas = [
    // `tblHeader` faz o Word repetir esta linha no alto de cada página nova
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    cabecalhos.map((c, i) =>
      celula(COLUNAS[i], paragrafo(corridas(puro(c, 'bold')), { depois: 0 }), { fundo: 'C8C8C8' })
    ).join('') + `</w:tr>`
  ];

  for (const c of citacoes) {
    const aspas = c.tipo === 'direta';
    const info = [{ t: (aspas ? '“' : '') + String(c.texto || '').trim() + (aspas ? '”' : ''),
                    e: 'normal' }];
    let marca = '';

    if (modelo === 'turabian') {
      const primeira = idNota === 2 || !abreviarNotas;
      const nota = R.gerar(livro, { pagina: c.pagina, capitulo: c.capitulo },
                           primeira ? 'turabian-nota' : 'turabian-abrev').html;
      notas.push(
        `<w:footnote w:id="${idNota}"><w:p><w:pPr><w:pStyle w:val="Nota"/>` +
        `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
        `<w:r><w:rPr><w:rStyle w:val="ChamadaNota"/></w:rPr><w:footnoteRef/></w:r>` +
        `<w:r><w:t xml:space="preserve"> </w:t></w:r>` +
        corridas(html(nota), { tam: 20 }) + `</w:p></w:footnote>`);
      marca = `<w:r><w:rPr><w:rStyle w:val="ChamadaNota"/></w:rPr>` +
              `<w:footnoteReference w:id="${idNota}"/></w:r>`;
      idNota++;
    } else {
      info[0].t += ' ';
      info.push(...html(R.gerar(livro, { pagina: c.pagina }, 'abnt-autordata').html));
      info.push({ t: '.', e: 'normal' });
    }

    linhas.push('<w:tr>' +
      celula(COLUNAS[0], paragrafo(corridas(puro(
        c.tipo === 'direta' ? 'Citação direta' : 'Citação indireta')), { depois: 0 })) +
      celula(COLUNAS[1], paragrafo(corridas(puro(c.assunto || c.capitulo || '')), { depois: 0 })) +
      celula(COLUNAS[2], paragrafo(corridas(info) + marca, { depois: 0 })) +
      '</w:tr>');
  }

  const borda = '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(l => `<w:${l} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join('') +
    '</w:tblBorders>';

  // Sem isto o texto encosta na linha da célula. 80 twips ≈ 1,4 mm de cada lado.
  const respiro = '<w:tblCellMar>' +
    '<w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>' +
    '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/>' +
    '</w:tblCellMar>';

  corpo.push(
    `<w:tbl><w:tblPr><w:tblW w:w="${UTIL}" w:type="dxa"/>${borda}${respiro}` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${COLUNAS.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    linhas.join('') + `</w:tbl>`);

  // O Word exige um parágrafo depois da tabela; sem ele o arquivo abre com aviso.
  corpo.push('<w:p/>');

  /* -------------------------------------------------------- as amarras */
  const documento = xmlDocumento(corpo.join(''));
  const arquivos = {
    '[Content_Types].xml': TIPOS,
    '_rels/.rels': RELS_RAIZ,
    'word/document.xml': documento,
    'word/_rels/document.xml.rels': RELS_DOC,
    'word/styles.xml': ESTILOS,
    'word/footnotes.xml': xmlNotas(notas.join('')),
    'word/footer1.xml': RODAPE
  };

  // O intervalo dos acentos vai ESCAPADO de propósito: escrever o caractere
  // combinante direto no arquivo quebra em alguns editores. Quinta vez que
  // esta armadilha aparece no projeto.
  const semAcento = t => String(t || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s.-]/g, '').trim();
  const nome = `Fichamento - ${semAcento(livro.titulo).slice(0, 60) || 'obra'}.docx`;
  return { blob: zipar(arquivos), nome };
}

/* ========================= as peças fixas do arquivo ===================== */

const CABECA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const xmlDocumento = corpo => CABECA +
  `<w:document ${NS_W} ${NS_R}><w:body>${corpo}` +
  `<w:sectPr>` +
  `<w:footerReference w:type="default" r:id="rId3"/>` +
  `<w:pgSz w:w="${PAGINA.l}" w:h="${PAGINA.a}"/>` +
  `<w:pgMar w:top="${PAGINA.margem}" w:right="${PAGINA.margem}" w:bottom="${PAGINA.margem}" ` +
  `w:left="${PAGINA.margem}" w:header="708" w:footer="708" w:gutter="0"/>` +
  `</w:sectPr></w:body></w:document>`;

// As notas 0 e 1 não aparecem no documento: são o risquinho que separa o
// rodapé do texto (e a versão dele para nota que continua na página seguinte).
const xmlNotas = notas => CABECA +
  `<w:footnotes ${NS_W}>` +
  `<w:footnote w:type="separator" w:id="0"><w:p><w:pPr>` +
  `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:r><w:separator/></w:r></w:p></w:footnote>` +
  `<w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:pPr>` +
  `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:r><w:continuationSeparator/></w:r></w:p></w:footnote>` +
  notas + `</w:footnotes>`;

const TIPOS = CABECA +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '</Types>';

const RELS_RAIZ = CABECA +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const RELS_DOC = CABECA +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
  '</Relationships>';

// w:sz é em MEIOS-pontos: 24 = 12pt no corpo, 20 = 10pt na nota.
const ESTILOS = CABECA +
  `<w:styles ${NS_W}>` +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
  '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
  '<w:spacing w:after="120" w:line="240" w:lineRule="auto"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Nota"><w:name w:val="footnote text"/>' +
  '<w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="ChamadaNota"><w:name w:val="footnote reference"/>' +
  '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
  '</w:styles>';

// O número da página é um CAMPO, não um texto: continua certo se o professor
// acrescentar ou tirar páginas depois.
const RODAPE = CABECA +
  `<w:ftr ${NS_W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:t>1</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
  '</w:p></w:ftr>';

window.Word = { gerar, zipar };

})();
