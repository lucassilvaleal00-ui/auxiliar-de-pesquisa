/* ==========================================================================
   config-app.js — os dois valores do Supabase
   --------------------------------------------------------------------------
   Preencha as duas linhas abaixo com os dados do SEU projeto no Supabase:
   painel do Supabase → Project Settings → API.

   • SUPABASE_URL      é o "Project URL"        (https://xxxx.supabase.co)
   • SUPABASE_ANON_KEY é a chave "anon public"

   Essas duas informações são PÚBLICAS por natureza — elas ficam no
   JavaScript de qualquer aplicativo que use Supabase, e é por isso que o
   RLS do banco (schema.sql) é obrigatório. A chave que não pode aparecer
   aqui de jeito nenhum é a service_role: ela mora só na Edge Function.

   Enquanto estes campos ficarem vazios, o aplicativo funciona como na
   Fase 1: sem login, aberto, tudo local. Assim você pode publicar agora e
   ligar o login quando quiser.
   ========================================================================== */

window.CONFIG = {
  SUPABASE_URL: 'https://vyovyiltgdmjtwjijrvp.supabase.co/rest/v1/',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5b3Z5aWx0Z2RtanR3amlqcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MDI3OTksImV4cCI6MjEwNDQ3ODc5OX0.OdW68hk9JMpvn2bSfFeVIIG7jX2dhW0KAdUUkiYIvvw',

  // Quantos dias o aplicativo pode ficar sem internet antes de exigir uma
  // nova validação da licença (decisão P4).
  DIAS_OFFLINE: 7
};
