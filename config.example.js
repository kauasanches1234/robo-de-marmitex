// Modelo de configuração pública do front (Supabase).
// COPIE este arquivo para `config.js` e preencha com os seus valores para rodar
// o painel ligado ao banco LOCALMENTE. Em produção, o `config.js` é gerado no
// deploy a partir dos GitHub Secrets (ver .github/workflows/deploy-pages.yml) —
// por isso `config.js` fica no .gitignore e NUNCA vai para o repositório.
//
// ⚠️ Aqui só entra config PÚBLICA: a URL e a "publishable/anon key". A RLS do
// banco é quem protege os dados. NUNCA coloque a service_role nem o token do
// WhatsApp neste arquivo — o site é público; esses são segredos de servidor.
window.MARMITEX_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "sb_publishable_XXXXXXXXXXXXXXXXXXXX"
};
