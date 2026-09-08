/* ==========================================================================
   auth.js — Login e licença (Supabase)
   --------------------------------------------------------------------------
   Fala direto com a API do Supabase por `fetch` — sem biblioteca extra, para
   o aplicativo continuar leve e abrir offline.

   O que este arquivo NÃO faz: guardar obras ou citações. Isso continua tudo
   no aparelho do cliente, no IndexedDB. Aqui só se responde a uma pergunta:
   "esta pessoa pode usar o aplicativo hoje?".
   ========================================================================== */

(function () {

const C = window.CONFIG || {};

/**
 * Limpa o endereço do Supabase antes de usar.
 *
 * Na tela "Project Settings → API" aparecem vários endereços parecidos, e é
 * muito fácil copiar o errado. O que vale é o "Project URL":
 *
 *      certo:  https://xxxxxxxx.supabase.co
 *      errado: https://xxxxxxxx.supabase.co/rest/v1/    (endereço da Data API)
 *      errado: https://xxxxxxxx.supabase.co/            (barra sobrando)
 *
 * Com o endereço errado, o Supabase responde "Invalid path specified in
 * request URL" — que não explica nada a quem está configurando. Em vez de
 * deixar o erro acontecer, arrumamos o endereço aqui.
 */
function limparBase(url) {
  return String(url || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\/+$/, '')                                   // barras no fim
    .replace(/\/(rest|auth|functions|storage)\/v\d+$/, ''); // caminho colado junto
}

const BASE = limparBase(C.SUPABASE_URL);
const ANON = String(C.SUPABASE_ANON_KEY || '').trim();
const LIGADO = !!(BASE && ANON);

const CHAVE_SESSAO  = 'ap_sessao';
const CHAVE_LICENCA = 'ap_licenca';
const DIAS_OFFLINE  = C.DIAS_OFFLINE || 7;
const DIA = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------- guardados */

// "Permanecer conectado" marcado → localStorage (sobrevive a fechar o app).
// Desmarcado → sessionStorage (some quando a aba fecha).
function guardarSessao(sessao, permanecer) {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_SESSAO);
    const onde = permanecer ? localStorage : sessionStorage;
    onde.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch { /* navegador com armazenamento bloqueado */ }
}

function lerSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO) || sessionStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch { return null; }
}

function limparSessao() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch { /* nada */ }
}

function guardarLicenca(dados) {
  try { localStorage.setItem(CHAVE_LICENCA, JSON.stringify({ ...dados, verificada_em: Date.now() })); }
  catch { /* nada */ }
}

function lerLicenca() {
  try { return JSON.parse(localStorage.getItem(CHAVE_LICENCA) || 'null'); }
  catch { return null; }
}

/* ------------------------------------------------------------ chamadas */

async function chamar(caminho, opcoes = {}, token = null) {
  const resp = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    }
  });
  const texto = await resp.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resp.ok) {
    const msg = dados?.error_description || dados?.msg || dados?.message || dados?.erro ||
                `o servidor respondeu ${resp.status}`;
    throw new Error(traduzir(msg));
  }
  return dados;
}

// As mensagens do Supabase vêm em inglês; o cliente não tem que ler isso.
function traduzir(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed'))       return 'Este e-mail ainda não foi confirmado.';
  if (m.includes('user not found'))            return 'Não encontrei esse e-mail no sistema.';
  if (m.includes('password should be'))        return 'A senha precisa ter ao menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (m.includes('failed to fetch'))           return 'Sem conexão com a internet.';
  if (m.includes('invalid path'))
    return 'O endereço do Supabase está errado no arquivo js/config-app.js. ' +
           'Use o "Project URL" (algo como https://xxxxxxxx.supabase.co), sem /rest/v1 e sem barra no fim.';
  if (m.includes('invalid api key') || m.includes('no api key'))
    return 'A chave do Supabase está errada no arquivo js/config-app.js. ' +
           'Use a chave "anon public".';
  return msg;
}

/* -------------------------------------------------------------- sessão */

async function renovarSePreciso() {
  const s = lerSessao();
  if (!s) return null;
  // Renova com um minuto de folga, para não expirar no meio de uma ação.
  if (s.expira_em && s.expira_em - 60000 > Date.now()) return s;
  if (!s.refresh_token) return s;
  try {
    const nova = await chamar('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const atualizada = montarSessao(nova);
    guardarSessao(atualizada, !!localStorage.getItem(CHAVE_SESSAO));
    return atualizada;
  } catch {
    return s;   // sem internet: segue com o que tem; a licença resolve o resto
  }
}

const montarSessao = r => ({
  access_token: r.access_token,
  refresh_token: r.refresh_token,
  expira_em: Date.now() + (r.expires_in || 3600) * 1000,
  usuario: { id: r.user?.id, email: r.user?.email }
});

/* --------------------------------------------------------------- ações */

async function entrar(email, senha, permanecer = true) {
  const r = await chamar('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: String(email).trim().toLowerCase(), password: senha })
  });
  const sessao = montarSessao(r);
  guardarSessao(sessao, permanecer);
  return sessao;
}

async function primeiroAcesso(email, codigo, senha) {
  await chamar('/functions/v1/admin', {
    method: 'POST',
    body: JSON.stringify({ acao: 'primeiro_acesso', email, codigo, senha })
  });
  // Deu certo: já entra com a senha recém-criada.
  return entrar(email, senha, true);
}

async function recuperarSenha(email) {
  await chamar('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ email: String(email).trim().toLowerCase() })
  });
  return true;
}

function sair() {
  limparSessao();
  try { localStorage.removeItem(CHAVE_LICENCA); } catch { /* nada */ }
}

/* -------------------------------------------------------------- licença
   Estados possíveis:
     'aberto'   → o login não está configurado (Fase 1): tudo liberado
     'sem_conta'→ ninguém logado: mostrar a tela de login
     'ok'       → em dia: aplicativo completo
     'leitura'  → vencido, inativado, ou muitos dias sem validar:
                  consulta e exportação continuam; cadastrar, não (decisão P3)
--------------------------------------------------------------------------*/

async function situacao() {
  if (!LIGADO) return { estado: 'aberto' };

  const sessao = await renovarSePreciso();
  if (!sessao) return { estado: 'sem_conta' };

  try {
    const linhas = await chamar(
      `/rest/v1/usuarios?id=eq.${sessao.usuario.id}&select=nome,email,plano,expira_em,ativo,admin`,
      { method: 'GET' }, sessao.access_token);

    const u = linhas?.[0];
    if (!u) {
      return { estado: 'leitura', motivo: 'Cadastro não encontrado no servidor.',
               email: sessao.usuario.email };
    }

    const vencida = u.expira_em ? new Date(u.expira_em) < new Date() : false;
    const dados = {
      ...u,
      estado: (!u.ativo || vencida) ? 'leitura' : 'ok',
      motivo: !u.ativo ? 'Sua conta está inativada.'
            : vencida  ? 'Sua licença venceu.' : '',
      online: true
    };
    guardarLicenca(dados);
    return dados;

  } catch (e) {
    // Sem internet (ou servidor fora do ar): vale a última validação guardada,
    // pelo prazo combinado na decisão P4.
    const guardada = lerLicenca();
    if (!guardada) {
      return { estado: 'leitura', online: false,
               motivo: 'Preciso de internet uma vez para liberar o aplicativo.' };
    }
    const dias = (Date.now() - guardada.verificada_em) / DIA;
    if (dias > DIAS_OFFLINE) {
      return { ...guardada, estado: 'leitura', online: false,
               motivo: `Faz ${Math.floor(dias)} dias sem conferir a licença. Conecte-se uma vez.` };
    }
    return { ...guardada, online: false,
             motivo: guardada.estado === 'ok' ? '' : guardada.motivo };
  }
}

const PLANOS = {
  teste: 'Teste', '1m': '1 mês', '3m': '3 meses',
  '6m': '6 meses', '1a': '1 ano', vitalicio: 'Vitalício'
};

function descreverLicenca(lic) {
  if (!lic || lic.estado === 'aberto') return '';
  const plano = PLANOS[lic.plano] || lic.plano || '';
  if (!lic.expira_em) return `${plano} · sem data de vencimento`;
  const dias = Math.ceil((new Date(lic.expira_em) - Date.now()) / DIA);
  const data = new Date(lic.expira_em).toLocaleDateString('pt-BR');
  if (dias < 0) return `${plano} · venceu em ${data}`;
  if (dias <= 15) return `${plano} · vence em ${dias} dia(s), ${data}`;
  return `${plano} · até ${data}`;
}

window.Auth = {
  LIGADO, PLANOS, BASE,
  entrar, sair, primeiroAcesso, recuperarSenha,
  situacao, descreverLicenca,
  sessao: lerSessao, renovarSePreciso, chamar, traduzir
};

})();
