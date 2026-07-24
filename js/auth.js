// Login real via Supabase Auth. Depende de vendor/supabase.js (define
// window.supabase) e config.js (define window.MARMITEX_CONFIG), carregados ANTES
// deste. Sem config → Auth.enabled=false e a página cai no modo demo (offline).
// Script clássico (ES5-friendly), pra rodar junto do script inline das páginas.
(function () {
  var cfg = (typeof window !== 'undefined' && window.MARMITEX_CONFIG) || {};
  var lib = (typeof window !== 'undefined' && window.supabase) || null;
  var enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && lib && lib.createClient);
  var client = enabled ? lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  window.Auth = {
    enabled: enabled,
    client: client,
    // entra com e-mail/senha; rejeita com mensagem amigável em caso de erro
    entrar: function (email, senha) {
      if (!enabled) return Promise.reject(new Error('Supabase não configurado'));
      return client.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
        if (r.error) throw new Error(r.error.message || 'E-mail ou senha incorretos');
        return r.data;
      });
    },
    sair: function () { return enabled ? client.auth.signOut() : Promise.resolve(); },
    sessao: function () {
      return enabled ? client.auth.getSession().then(function (r) { return r.data.session; }) : Promise.resolve(null);
    },
    email: function () { return this.sessao().then(function (s) { return (s && s.user) ? s.user.email : null; }); },
    onMudou: function (cb) { if (enabled) client.auth.onAuthStateChange(function (_e, s) { cb(s); }); },
  };
})();
