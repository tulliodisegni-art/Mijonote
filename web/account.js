/* Comptes (e-mail + mot de passe) et sauvegarde en ligne, communs à Repz, Mijonote et Good Food.
   Même projet Supabase que Jobello (table « docs », dossier « fichiers »), chaque ligne est privée à son compte.
   Un seul compte sert pour toutes les applis. Les données restent aussi sur le téléphone (marche hors ligne) :
   chaque modification part en ligne, et au lancement on récupère ce qui a changé ailleurs.
   Réglages : window.ACCT_CFG = { app, name, url, key, logo, link } défini avant ce fichier, après vendor/supabase.js. */
(function () {
  const C = window.ACCT_CFG || {};
  if (!C.url || !C.key || !window.supabase) { window.Account = null; return; }
  const sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, storageKey: "td.auth", detectSessionInUrl: true } });
  const A = C.app + "/";
  let user = null, readyRes;
  const ready = new Promise((r) => (readyRes = r));
  const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const okey = () => "acct." + C.app + "." + (user ? user.id : "x") + ".outbox";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- envoi des modifications (avec file d'attente hors ligne) ---------- */
  let flushing = null;
  function push(key, val) {
    if (!user) { ready.then((u) => u && push(key, val)); return; }
    const ob = LS.get(okey(), {}); ob[key] = val === undefined ? { del: 1 } : { v: val }; LS.set(okey(), ob);
    clearTimeout(push.t); push.t = setTimeout(flush, 400);
  }
  function flush() {
    if (!user || flushing) return flushing || Promise.resolve();
    flushing = (async () => {
      const ob = LS.get(okey(), {});
      for (const [key, op] of Object.entries(ob)) {
        const path = A + key, col = A + key.slice(0, Math.max(0, key.lastIndexOf("/")));
        const r = op.del ? await sb.from("docs").delete().eq("path", path) : await sb.from("docs").upsert({ owner: user.id, path, col, data: op.v, updated_at: new Date().toISOString() });
        if (r.error) break;
        const cur = LS.get(okey(), {}); if (JSON.stringify(cur[key]) === JSON.stringify(op)) { delete cur[key]; LS.set(okey(), cur); }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  async function pullAll() {
    const out = []; let from = 0;
    for (;;) {
      const { data, error } = await sb.from("docs").select("path,data,updated_at").like("path", A + "%").range(from, from + 999);
      if (error) throw error; out.push(...data.map((r) => ({ key: r.path.slice(A.length), data: r.data, at: r.updated_at }))); if (data.length < 1000) break; from += 1000;
    }
    return out;
  }
  const pending = () => Object.keys(LS.get(okey(), {}));
  const syncedKey = () => "acct." + C.app + "." + (user ? user.id : "x") + ".synced";

  /* ---------- fichiers (photos) ---------- */
  const fpath = (id) => user.id + "/" + C.app + "/" + id;
  async function putBlob(id, blob) { if (!user) return; await sb.storage.from("fichiers").upload(fpath(id), blob, { upsert: true, contentType: blob.type || "application/octet-stream" }); }
  async function getBlob(id) { if (!user) return null; const { data, error } = await sb.storage.from("fichiers").download(fpath(id)); return error ? null : data; }
  async function delBlob(id) { if (!user) return; await sb.storage.from("fichiers").remove([fpath(id)]); }
  async function listBlobs() {
    if (!user) return []; const out = []; let offset = 0;
    for (;;) { const { data, error } = await sb.storage.from("fichiers").list(user.id + "/" + C.app, { limit: 1000, offset }); if (error || !data) break; out.push(...data.map((f) => f.name)); if (data.length < 1000) break; offset += 1000; }
    return out;
  }

  /* ---------- écran de connexion ---------- */
  const css = `.ac-ov{position:fixed;inset:0;z-index:2147482000;background:linear-gradient(160deg,#1C3170,#0A1330);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:auto}
.ac-card{background:#fff;color:#0A1330;border-radius:24px;padding:24px 20px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:11px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.ac-card img{width:72px;height:72px;border-radius:18px;align-self:center}
.ac-card h1{margin:0;text-align:center;font-size:1.5rem} .ac-card p{margin:0;color:#5C6584;font-size:.92rem;text-align:center;line-height:1.4}
.ac-card label{font-size:.8rem;font-weight:700;color:#5C6584;display:grid;gap:4px}
.ac-card input{font:inherit;font-size:1rem;padding:12px 14px;border-radius:12px;border:1.5px solid #E2E0D8;background:#F7F6F2;color:#0A1330;width:100%;box-sizing:border-box}
.ac-card button{font:inherit;font-weight:800;padding:14px;border-radius:14px;border:0;background:linear-gradient(135deg,#F2CB66,#E9B949 50%,#B98A2C);color:#0A1330;cursor:pointer}
.ac-card button.ghost{background:none;border:1.5px solid #E2E0D8;font-weight:700}
.ac-card button.link{background:none;border:0;padding:4px;font-weight:600;font-size:.85rem;color:#5C6584;text-decoration:underline}
.ac-card .err{min-height:1.2em;font-size:.88rem;text-align:center;color:#C8352B} .ac-card .err.ok{color:#1E9C80}`;
  const st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  function login() {
    return new Promise((res) => {
      const d = document.createElement("div"); d.className = "ac-ov";
      d.innerHTML = `<div class="ac-card">${C.logo ? `<img src="${esc(C.logo)}" alt="">` : ""}<h1>${esc(C.name)}</h1>
        <p>Connecte-toi pour retrouver tes données sur tous tes appareils. Le même compte marche pour toutes les applis.</p>
        <label>E-mail<input id="ac-mail" type="email" autocomplete="username" inputmode="email" autocapitalize="off"></label>
        <label>Mot de passe<input id="ac-pass" type="password" autocomplete="current-password"></label>
        <div class="err" id="ac-err" role="alert"></div>
        <button id="ac-in">Se connecter</button><button class="ghost" id="ac-up">Créer mon compte</button><button class="link" id="ac-fg">Mot de passe oublié</button></div>`;
      document.body.appendChild(d);
      const $ = (s) => d.querySelector(s), err = $("#ac-err");
      const say = (t, ok) => { err.textContent = t; err.className = "err" + (ok ? " ok" : ""); };
      const creds = () => ({ email: $("#ac-mail").value.trim(), password: $("#ac-pass").value });
      const go = async (up) => {
        const { email, password } = creds();
        if (!/.+@.+\..+/.test(email)) return say("Entre ton adresse e-mail.");
        if (password.length < 6) return say("Mot de passe : 6 caractères minimum.");
        say("Un instant…", true);
        const r = up ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: C.link } }) : await sb.auth.signInWithPassword({ email, password });
        if (r.error) {
          const m = r.error.message || "";
          return say(/invalid login/i.test(m) ? "E-mail ou mot de passe incorrect." : /already registered|already exists/i.test(m) ? "Ce compte existe déjà : connecte-toi." : /confirm/i.test(m) ? "Confirme d'abord ton e-mail avec le lien reçu." : /network|fetch/i.test(m) ? "Pas de connexion. Réessaie avec du réseau." : m);
        }
        if (!r.data.session) return say("Compte créé : ouvre le lien reçu par e-mail, puis connecte-toi ici.", true);
        d.remove(); res(r.data.user);
      };
      $("#ac-in").onclick = () => go(false); $("#ac-up").onclick = () => go(true);
      $("#ac-pass").onkeydown = (e) => { if (e.key === "Enter") go(false); };
      $("#ac-fg").onclick = async () => {
        const { email } = creds(); if (!/.+@.+\..+/.test(email)) return say("Entre d'abord ton adresse e-mail.");
        const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: C.link });
        say(r.error ? "Envoi impossible, réessaie." : "E-mail envoyé : suis le lien pour choisir un nouveau mot de passe.", !r.error);
      };
    });
  }
  // lien « nouveau mot de passe » reçu par e-mail
  sb.auth.onAuthStateChange((ev) => {
    if (ev !== "PASSWORD_RECOVERY") return;
    setTimeout(async () => { const p = prompt("Choisis ton nouveau mot de passe (6 caractères minimum)"); if (p && p.length >= 6) { const r = await sb.auth.updateUser({ password: p }); alert(r.error ? "Impossible de changer le mot de passe." : "Mot de passe changé."); } }, 300);
  });

  async function start() {
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    if (!user) user = await login();
    readyRes(user);
  }
  async function signOut(clearLocal) { try { await sb.auth.signOut(); } catch (e) {} if (clearLocal) await clearLocal(); location.reload(); }

  window.Account = {
    ready, push, flush, pullAll, pending, putBlob, getBlob, delBlob, listBlobs, signOut,
    get user() { return user; },
    isFirstSync: () => !LS.get(syncedKey(), false), markSynced: () => LS.set(syncedKey(), true),
  };
  const go = () => { if (window.Gate && !window.Gate.allowed()) document.addEventListener("gate-open", start, { once: true }); else start(); };
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  addEventListener("online", () => flush());
})();
