/* ==========================================================================
   painel.js — Painel de usuários (só o administrador)
   --------------------------------------------------------------------------
   Toda operação passa pela Edge Function "admin". Este arquivo NÃO conhece a
   chave service_role — ele manda o token da sua sessão, e é a função no
   servidor que confere se você é administrador antes de fazer qualquer coisa.
   ========================================================================== */

(function () {

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const Auth = window.Auth;
const PLANOS = Auth.PLANOS;
let usuarios = [];

function aviso(msg, ms = 3000) {
  const el = $('#aviso');
  el.textContent = msg; el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, ms);
}

/* --------------------------------------------------------------- janela */

function abrirJanela(titulo, corpo, rodape = '') {
  $('#janela-titulo').textContent = titulo;
  $('#janela-corpo').innerHTML = corpo;
  $('#janela-rodape').innerHTML = rodape;
  $('#fundo').hidden = false;
}
const fecharJanela = () => { $('#fundo').hidden = true; };
$('#janela-fechar').onclick = fecharJanela;
$('#fundo').onclick = e => { if (e.target.id === 'fundo') fecharJanela(); };

function confirmar(titulo, texto, rotulo = 'Confirmar') {
  return new Promise(r => {
    abrirJanela(titulo, `<p>${texto}</p>`,
      `<button class="btn" id="j-nao">Cancelar</button>
       <button class="btn perigo" id="j-sim">${esc(rotulo)}</button>`);
    $('#j-nao').onclick = () => { fecharJanela(); r(false); };
    $('#j-sim').onclick = () => { fecharJanela(); r(true); };
  });
}

/* ------------------------------------------------------- chamar o servidor */

async function acao(nome, dados = {}) {
  const sessao = await Auth.renovarSePreciso();
  if (!sessao) throw new Error('Sua sessão terminou. Entre de novo.');
  return Auth.chamar('/functions/v1/admin', {
    method: 'POST', body: JSON.stringify({ acao: nome, ...dados })
  }, sessao.access_token);
}

/* ----------------------------------------------------------- quem entrou ---
   O painel NÃO tem login próprio. Ele usa a mesma sessão do aplicativo (mesmo
   endereço, mesmo navegador): se você já entrou lá como administrador, aqui
   abre direto. Quem não for administrador nem chega a ver a tabela — e, mesmo
   que tentasse, a Edge Function recusa qualquer ação.
--------------------------------------------------------------------------- */

$('#bt-atualizar').onclick = () => carregar();

function semAcesso(texto) {
  $('#aviso-texto').innerHTML = texto;
  $('#tela-aviso').hidden = false;
  $('#tela-painel').hidden = true;
}

async function abrirPainel() {
  if (!Auth.sessao()) {
    return semAcesso('Entre no aplicativo com a sua conta de administrador — ' +
                     'o painel usa a mesma sessão, sem pedir senha de novo.');
  }
  try {
    await carregar();
    $('#tela-aviso').hidden = true;
    $('#tela-painel').hidden = false;
    const s = Auth.sessao();
    $('#quem').textContent = s?.usuario?.email || '';
  } catch (e) {
    const m = String(e.message || '');
    if (m.includes('administradora')) {
      semAcesso('Esta conta não é administradora. Se você é o dono do sistema, ' +
                'marque a sua conta como <code>admin</code> no banco (passo 6 do guia).');
    } else if (m.includes('sessão') || m.includes('Sessão')) {
      semAcesso('Sua sessão terminou. Entre de novo no aplicativo e volte aqui.');
    } else {
      semAcesso('Não consegui abrir o painel: ' + esc(m));
    }
  }
}

async function carregar() {
  const r = await acao('listar');
  usuarios = r.usuarios || [];
  desenhar();
}

function situacao(u) {
  if (!u.ativo) return { texto: 'Inativado', classe: 'et-inativo' };
  if (u.expira_em && new Date(u.expira_em) < new Date())
    return { texto: 'Vencido', classe: 'et-vencido' };
  return { texto: 'Ativo', classe: 'et-ok' };
}

const dataBr = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

function desenhar() {
  const corpo = $('#corpo-tabela');
  if (!usuarios.length) {
    corpo.innerHTML = `<tr><td colspan="5" class="dica" style="padding:20px">
      Nenhum usuário cadastrado ainda.</td></tr>`;
    $('#rodape-conta').textContent = '';
    return;
  }

  corpo.innerHTML = usuarios.map(u => {
    const st = situacao(u);
    const cod = u.codigo;
    const codigoPendente = cod && !cod.usado_em && new Date(cod.expira_em) > new Date();
    return `<tr data-id="${u.id}">
      <td><b>${esc(u.nome)}</b><br><small class="dica">${esc(u.email)}</small></td>
      <td>${esc(PLANOS[u.plano] || u.plano)}<br>
          <small class="dica">${u.expira_em ? 'até ' + dataBr(u.expira_em) : 'sem vencimento'}</small></td>
      <td><span class="etiqueta ${st.classe}">${st.texto}</span></td>
      <td>${codigoPendente
            ? `<small class="dica">aguardando 1º acesso<br>até ${dataBr(cod.expira_em)}</small>`
            : (cod && cod.usado_em ? '<small class="dica">senha já criada</small>'
                                   : '<small class="dica">—</small>')}</td>
      <td>
        <div class="acoes-linha">
          <button class="btn pequeno" data-codigo>Novo código</button>
          <button class="btn pequeno" data-plano>Plano</button>
          <button class="btn pequeno" data-ativo>${u.ativo ? 'Inativar' : 'Reativar'}</button>
          <button class="btn pequeno perigo" data-excluir>Excluir</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const ativos = usuarios.filter(u => situacao(u).texto === 'Ativo').length;
  $('#rodape-conta').textContent =
    `${usuarios.length} usuário(s) · ${ativos} com licença em dia`;

  corpo.querySelectorAll('tr[data-id]').forEach(tr => {
    const u = usuarios.find(x => x.id === tr.dataset.id);
    tr.querySelector('[data-codigo]').onclick = () => gerarCodigo(u);
    tr.querySelector('[data-plano]').onclick = () => trocarPlano(u);
    tr.querySelector('[data-ativo]').onclick = () => alternarAtivo(u);
    tr.querySelector('[data-excluir]').onclick = () => excluir(u);
  });
}

/* ------------------------------------------------------------------ ações */

$('#bt-criar').onclick = async function () {
  const bt = this;
  const nome = $('#novo-nome').value.trim();
  const email = $('#novo-email').value.trim();
  const plano = $('#novo-plano').value;
  $('#form-erro').hidden = true;
  if (!nome || !email) {
    $('#form-erro').textContent = 'Preencha o nome e o e-mail.';
    $('#form-erro').hidden = false;
    return;
  }
  bt.disabled = true; bt.textContent = 'Cadastrando…';
  try {
    const r = await acao('criar', { nome, email, plano });
    $('#novo-nome').value = ''; $('#novo-email').value = '';
    await carregar();
    mostrarCodigo({ nome, email, plano }, r.codigo, r.expira_em);
  } catch (e) {
    $('#form-erro').textContent = e.message;
    $('#form-erro').hidden = false;
  } finally {
    bt.disabled = false; bt.textContent = 'Cadastrar';
  }
};

async function gerarCodigo(u) {
  try {
    const r = await acao('gerar_codigo', { email: u.email });
    await carregar();
    mostrarCodigo(u, r.codigo, r.expira_em);
  } catch (e) { aviso(e.message, 5000); }
}

/**
 * A tela do código é a única vez em que ele existe em texto — no banco fica
 * só o hash. Por isso ela já entrega a mensagem inteira pronta para colar no
 * WhatsApp (decisão P10), com link, código e o passo a passo de instalação.
 */
function mostrarCodigo(u, codigo, expira) {
  const endereco = new URL('..', location.href).href;
  const plano = PLANOS[u.plano] || u.plano;
  const mensagem =
`Olá, ${u.nome}! Seu acesso ao Auxiliar de Pesquisa está pronto.

Link do aplicativo: ${endereco}
Seu e-mail: ${u.email}
Código de primeiro acesso: ${codigo}

Como começar:
1) Abra o link no celular ou no computador.
2) Toque em "Primeiro acesso", informe o e-mail e o código, e crie a sua senha.
3) Para instalar como aplicativo:
   • Android: toque em "Instalar" quando o navegador oferecer.
   • iPhone/iPad: abra o link no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".

Plano: ${plano}.
O código vale até ${new Date(expira).toLocaleDateString('pt-BR')} e só pode ser usado uma vez.`;

  abrirJanela('Código de primeiro acesso', `
    <p style="text-align:center;margin:6px 0 2px">
      <span class="codigo" style="font-size:30px">${esc(codigo)}</span>
    </p>
    <p class="dica" style="text-align:center">
      Anote ou copie agora: por segurança, o código não fica guardado em texto.
      Se perder, é só gerar outro.
    </p>
    <label class="rot">Mensagem pronta para enviar</label>
    <textarea id="msg-pronta" style="min-height:230px">${esc(mensagem)}</textarea>`,
    `<button class="btn" id="j-fechar">Fechar</button>
     <button class="btn" id="j-copia-cod">Copiar só o código</button>
     <button class="btn primario" id="j-copia-msg">Copiar mensagem</button>`);

  $('#j-fechar').onclick = fecharJanela;
  $('#j-copia-cod').onclick = () => copiar(codigo, 'Código copiado.');
  $('#j-copia-msg').onclick = () => copiar($('#msg-pronta').value, 'Mensagem copiada — é só colar no WhatsApp.');
}

async function copiar(texto, ok) {
  try {
    await navigator.clipboard.writeText(texto);
    aviso(ok);
  } catch {
    const a = document.createElement('textarea');
    a.value = texto; document.body.appendChild(a); a.select();
    document.execCommand('copy'); a.remove();
    aviso(ok);
  }
}

function trocarPlano(u) {
  const opcoes = Object.entries(PLANOS)
    .map(([id, nome]) => `<option value="${id}" ${u.plano === id ? 'selected' : ''}>${nome}</option>`).join('');
  abrirJanela(`Plano de ${u.nome}`, `
    <p class="dica">Hoje: <b>${esc(PLANOS[u.plano] || u.plano)}</b>,
      ${u.expira_em ? 'até ' + dataBr(u.expira_em) : 'sem vencimento'}.</p>
    <label class="rot">Novo plano</label>
    <select class="campo" id="novo-plano-u">${opcoes}</select>
    <p class="dica">O tempo é <b>somado ao que ainda falta</b>. Se já estiver vencido,
      a contagem recomeça a partir de hoje.</p>`,
    `<button class="btn" id="j-nao">Cancelar</button>
     <button class="btn primario" id="j-sim">Aplicar</button>`);

  $('#j-nao').onclick = fecharJanela;
  $('#j-sim').onclick = async () => {
    const plano = $('#novo-plano-u').value;
    try {
      const r = await acao('atualizar', { id: u.id, plano });
      fecharJanela();
      await carregar();
      aviso(r.usuario?.expira_em
        ? `Plano atualizado — vale até ${dataBr(r.usuario.expira_em)}.`
        : 'Plano vitalício aplicado.', 4000);
    } catch (e) { aviso(e.message, 5000); }
  };
}

async function alternarAtivo(u) {
  const desligando = u.ativo;
  if (desligando && !await confirmar('Inativar acesso',
    `<b>${esc(u.nome)}</b> vai entrar em modo leitura no próximo acesso com internet:
     continua vendo e exportando as próprias citações, mas não cadastra mais nada.
     <br><br>Nada do que está no aparelho dele será apagado.`, 'Inativar')) return;
  try {
    await acao('atualizar', { id: u.id, ativo: !u.ativo });
    await carregar();
    aviso(desligando ? 'Usuário inativado.' : 'Usuário reativado.');
  } catch (e) { aviso(e.message, 5000); }
}

async function excluir(u) {
  if (!await confirmar('Excluir usuário',
    `A conta de <b>${esc(u.nome)}</b> será apagada e ele não conseguirá mais entrar.
     <br><br>As obras e citações dele ficam no aparelho dele — isso não apaga nada
     do trabalho dele, e nem tem como: os dados nunca estiveram aqui.`,
    'Excluir conta')) return;
  try {
    await acao('excluir', { id: u.id });
    await carregar();
    aviso('Usuário excluído.');
  } catch (e) { aviso(e.message, 5000); }
}

/* ------------------------------------------------------------------ início */

(async function iniciar() {
  if (!Auth.LIGADO) {
    document.body.innerHTML = `<main><h2>Falta configurar o Supabase</h2>
      <p>Preencha <code>js/config-app.js</code> com o endereço do projeto e a chave
      <i>anon</i>. O passo a passo está no guia <b>COMO_LIGAR_O_LOGIN.pdf</b>.</p></main>`;
    return;
  }
  await abrirPainel();
})();

})();
