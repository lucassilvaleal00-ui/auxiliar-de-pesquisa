/* ==========================================================================
   anexos.js — As páginas escaneadas da obra
   --------------------------------------------------------------------------
   No modelo do professor, o fichamento começa com o print (ou xerox) da página
   do livro, e a contagem das páginas já começa nela. Este arquivo cuida disso:

     1. lê o que o usuário anexou (foto, print ou PDF do scanner);
     2. monta uma página A4 para cada página escaneada, com o desenho encaixado
        dentro das margens e o número embaixo, centralizado;
     3. cola em seguida as páginas do fichamento que o jsPDF gerou.

   O resultado é UM arquivo só, com a contagem correndo do começo ao fim.

   POR QUE DUAS BIBLIOTECAS
   O jsPDF sabe criar um PDF do zero, mas não sabe ler um PDF que já existe —
   e o scanner do celular quase sempre entrega PDF. Quem faz esse lado é o
   pdf-lib, e ele só é carregado quando há mesmo algo para anexar: quem nunca
   anexa nada não paga por ele.

   POR QUE TODA PÁGINA ESCANEADA É REDESENHADA NUMA FOLHA NOVA
   Seria mais curto carimbar o número em cima da página escaneada e pronto. Só
   que um scan sangrado até a borda engoliria o número, e uma página em outro
   tamanho (carta, ofício) quebraria a sequência de folhas A4. Encaixando o
   escaneado dentro de uma folha A4 nossa, com o rodapé reservado, o número
   sempre aparece e o arquivo inteiro sai do mesmo tamanho.
   ========================================================================== */

(function () {

/* As medidas conversam com as do fichamento.js: mesma folha, mesmas margens,
   e o número na mesma altura, para o arquivo parecer um documento só. */
const PAG = { l: 210, a: 297 };                 // A4 em milímetros
const M = { esq: 25, dir: 25, topo: 25, baixo: 22 };
const RODAPE = 12;                              // altura do número, a partir do pé
const CORPO = 12;                               // corpo em pontos, como no fichamento
const mm2pt = v => v * 72 / 25.4;               // milímetro → ponto (o PDF fala em pontos)

const ROTULO = 'Print ou Xerox da Obra';

// Uma foto de celular tem 12 megapixels e viraria um PDF de vários MB por
// página. 2200px no lado maior dá cerca de 200dpi numa folha A4 — o bastante
// para ler o texto do livro — e segura o tamanho do arquivo.
const LADO_MAX = 2200;
const QUALIDADE = 0.9;

const IMAGENS = /^image\//;
const EH_PDF = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

/* ----------------------------------------------------------- carregamento
   O pdf-lib entra em cena só quando é preciso. Em cima de tudo, ele fica em
   cache junto com o resto do app, então isto funciona sem internet também. */
let promessaPdfLib = null;
function carregarPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (promessaPdfLib) return promessaPdfLib;
  promessaPdfLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdf-lib.min.js';
    s.onload = () => window.PDFLib ? resolve(window.PDFLib)
                                   : reject(new Error('pdf-lib carregou pela metade.'));
    s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF.'));
    document.head.appendChild(s);
  });
  return promessaPdfLib;
}

/* --------------------------------------------------------------- imagens
   Toda imagem passa pelo canvas e sai como JPEG. Assim o navegador resolve o
   formato que ele souber abrir (inclusive o HEIC do iPhone, no Safari) e a
   gente recebe sempre a mesma coisa do outro lado. */
function lerImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * escala));
        c.height = Math.max(1, Math.round(img.height * escala));
        const ctx = c.getContext('2d');
        // Fundo branco: PNG com transparência ficaria preto no JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const dados = c.toDataURL('image/jpeg', QUALIDADE);
        URL.revokeObjectURL(url);
        resolve({ dados, largura: c.width, altura: c.height });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não consegui abrir a imagem "${arquivo.name}". ` +
                       'Tente salvá-la como JPG ou PNG.'));
    };
    img.src = url;
  });
}

const bytes = arquivo => arquivo.arrayBuffer();

/* ------------------------------------------------------- quantas páginas
   Precisa ser sabido ANTES de gerar o fichamento: é esse número que diz em
   qual página o fichamento começa a contar. */
async function contarPaginas(arquivos) {
  let total = 0;
  for (const a of arquivos) {
    if (EH_PDF(a)) {
      const { PDFDocument } = await carregarPdfLib();
      let pdf;
      try {
        pdf = await PDFDocument.load(await bytes(a), { ignoreEncryption: true });
      } catch {
        throw new Error(`Não consegui abrir o PDF "${a.name}". ` +
                        'Se ele tiver senha, remova a senha e anexe de novo.');
      }
      total += pdf.getPageCount();
    } else if (IMAGENS.test(a.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(a.name || '')) {
      total += 1;
    } else {
      throw new Error(`"${a.name}" não é imagem nem PDF. ` +
                      'Anexe o print da página (JPG ou PNG) ou o PDF do scanner.');
    }
  }
  return total;
}

/* ------------------------------------------------------------ o arquivo final
   `pdfFichamento` são os bytes que o jsPDF gerou — já numerado a partir da
   primeira página DEPOIS dos anexos. */
async function juntar(arquivos, pdfFichamento) {
  const { PDFDocument, StandardFonts, rgb } = await carregarPdfLib();
  const saida = await PDFDocument.create();
  const fonte = await saida.embedFont(StandardFonts.TimesRoman);
  const fonteNegrito = await saida.embedFont(StandardFonts.TimesRomanBold);   // o rótulo, como no modelo

  const L = mm2pt(PAG.l), A = mm2pt(PAG.a);
  const caixa = {
    x: mm2pt(M.esq),
    largura: mm2pt(PAG.l - M.esq - M.dir),
    // O teto desce um pouco na primeira folha para caber o rótulo do modelo.
    baixo: mm2pt(M.baixo + 6),                    // acima do número
    alto: mm2pt(PAG.a - M.topo)
  };

  let numero = 0;

  /** Uma folha A4 com o número no pé, no mesmo lugar do resto do documento. */
  function folha(comRotulo) {
    const p = saida.addPage([L, A]);
    numero++;
    const n = String(numero);
    p.drawText(n, {
      x: L / 2 - fonte.widthOfTextAtSize(n, CORPO) / 2,
      y: mm2pt(RODAPE), size: CORPO, font: fonte, color: rgb(0, 0, 0)
    });
    let teto = caixa.alto;
    if (comRotulo) {
      p.drawText(ROTULO, { x: caixa.x, y: teto - CORPO, size: CORPO, font: fonteNegrito });
      teto -= CORPO * 2.2;
    }
    return { p, teto };
  }

  /** Encaixa algo de `larg`×`alt` na área livre, centralizado, sem distorcer. */
  function encaixar(larg, alt, teto) {
    const altura = teto - caixa.baixo;
    const escala = Math.min(caixa.largura / larg, altura / alt);
    const w = larg * escala, h = alt * escala;
    return { w, h, x: caixa.x + (caixa.largura - w) / 2, y: caixa.baixo + (altura - h) / 2 };
  }

  let primeira = true;
  for (const a of arquivos) {
    if (EH_PDF(a)) {
      const origem = await PDFDocument.load(await bytes(a), { ignoreEncryption: true });
      const indices = origem.getPageIndices();
      // `embedPages` traz a página inteira como um desenho, que a gente pode
      // posicionar e redimensionar — é o que permite tratar o PDF do scanner
      // igualzinho a uma foto.
      const postas = await saida.embedPages(origem.getPages());
      for (let i = 0; i < indices.length; i++) {
        const { p, teto } = folha(primeira); primeira = false;
        const posta = postas[i];
        const cx = encaixar(posta.width, posta.height, teto);
        p.drawPage(posta, { x: cx.x, y: cx.y, width: cx.w, height: cx.h });
      }
    } else {
      const img = await lerImagem(a);
      const posta = await saida.embedJpg(img.dados);
      const { p, teto } = folha(primeira); primeira = false;
      const cx = encaixar(img.largura, img.altura, teto);
      p.drawImage(posta, { x: cx.x, y: cx.y, width: cx.w, height: cx.h });
    }
  }

  // e, atrás delas, o fichamento inteiro
  const fich = await PDFDocument.load(pdfFichamento);
  const paginas = await saida.copyPages(fich, fich.getPageIndices());
  paginas.forEach(p => saida.addPage(p));

  return saida.save();
}

window.Anexos = { contarPaginas, juntar, carregarPdfLib, EH_PDF, LADO_MAX };

})();
