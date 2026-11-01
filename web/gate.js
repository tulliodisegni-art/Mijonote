/* Accès sur invitation (commun à Repz, Mijonote, Good Food et Jobello).
   Au premier lancement, l'appli demande un code d'invitation à usage unique, vérifié en ligne (Supabase, fonctions app_*).
   Le téléphone est ensuite reconnu ; si l'invitation est retirée, l'appli se reverrouille à la connexion suivante.
   Le propriétaire entre sa clé une fois : il passe sans code et peut créer, voir et retirer les invitations.
   Réglages : window.GATE_CFG = { app, name, url, key, link, accent, logo, isOwner() } défini avant ce fichier. */
(function () {
  const C = window.GATE_CFG || {};
  const P = "gate." + C.app + ".";
  const ls = { get: (k) => { try { return localStorage.getItem(P + k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(P + k) : localStorage.setItem(P + k, v); } catch (e) {} } };
  const dev = () => { let d = ls.get("device"); if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); ls.set("device", d); } return d; };
  const head = () => ({ "content-type": "application/json", apikey: C.key, ...(C.key && !String(C.key).startsWith("sb_") ? { authorization: "Bearer " + C.key } : {}) });
  async function rpc(fn, body) {
    const r = await fetch(C.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: head(), body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text().catch(() => ""); const e = new Error(t || ("HTTP " + r.status)); e.status = r.status; throw e; }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const adminKey = () => ls.get("admin");
  const isOwner = () => !!adminKey() || (typeof C.isOwner === "function" && (() => { try { return !!C.isOwner(); } catch (e) { return false; } })());
  const allowed = () => isOwner() || ls.get("ok") === "1";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- styles ---------- */
  const css = `.gt-ov{position:fixed;inset:0;z-index:2147483000;background:linear-gradient(160deg,#1C3170,#0A1330);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:auto}
.gt-ov.light{background:rgba(10,19,48,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.gt-card{width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px;text-align:center}
.gt-ov.light .gt-card{background:#fff;color:#0A1330;border-radius:22px;padding:20px;text-align:left;max-height:86vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.gt-card img{width:88px;height:88px;border-radius:22px;margin:0 auto;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.gt-card h1{margin:0;font-size:1.9rem;line-height:1.05;color:var(--gt-acc,#E9B949)} .gt-card h2{margin:0;font-size:1.25rem}
.gt-card p{margin:0;opacity:.85;line-height:1.4}
.gt-card input{padding:14px;border-radius:14px;border:1.5px solid rgba(10,19,48,.15);font-size:1.15rem;text-align:center;color:#0A1330;letter-spacing:.08em;text-transform:uppercase;width:100%;box-sizing:border-box}
.gt-card input.free{text-transform:none;letter-spacing:0;text-align:left}
.gt-btn{padding:15px;border:0;border-radius:14px;background:linear-gradient(135deg,#F2CB66,#E9B949 50%,#B98A2C);color:#0A1330;font-weight:800;font-size:1.05rem;letter-spacing:.03em;cursor:pointer}
.gt-btn:disabled{opacity:.6} .gt-ghost{background:none;border:0;color:inherit;opacity:.65;font-size:.88rem;text-decoration:underline;cursor:pointer;padding:6px}
.gt-ov.light .gt-ghost{opacity:.75}
.gt-err{min-height:1.2em;color:#FFB4A8;font-size:.92rem} .gt-ov.light .gt-err{color:#C8352B}
.gt-row{display:flex;gap:8px;align-items:center} .gt-row>*{flex:1}
.gt-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.gt-list li{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;border:1px solid rgba(10,19,48,.12);border-radius:12px;padding:8px 10px;font-size:.9rem}
.gt-list code{font-weight:700;letter-spacing:.06em} .gt-list small{opacity:.65;grid-column:1} .gt-list button{grid-row:1/3;grid-column:2;border:1px solid rgba(10,19,48,.2);background:none;border-radius:999px;padding:5px 10px;font-size:.8rem;cursor:pointer;color:inherit}
.gt-list li.off{opacity:.5}`;
  const st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  const ov = (html, light) => { const d = document.createElement("div"); d.className = "gt-ov" + (light ? " light" : ""); if (C.accent) d.style.setProperty("--gt-acc", C.accent); d.innerHTML = `<div class="gt-card">${html}</div>`; (document.body || document.documentElement).appendChild(d); return d; };
  const q = (r, s) => r.querySelector(s);

  /* ---------- écran de verrouillage ---------- */
  let lockEl = null;
  function lock() {
    if (lockEl) return;
    lockEl = ov(`${C.logo ? `<img src="${esc(C.logo)}" alt="">` : ""}<h1>${esc(C.name || "")}</h1>
      <p>Cette appli est sur invitation. Entre le code que tu as reçu.</p>
      <input id="gt-code" placeholder="XXXX-XXXX" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="12">
      <button class="gt-btn" id="gt-go">Entrer</button><div class="gt-err" id="gt-err" role="alert"></div>
      <button class="gt-ghost" id="gt-own">Je suis le propriétaire</button>`);
    const inp = q(lockEl, "#gt-code"), err = q(lockEl, "#gt-err"), go = q(lockEl, "#gt-go");
    const fromUrl = new URLSearchParams(location.search).get("invite"); if (fromUrl) inp.value = fromUrl.toUpperCase();
    setTimeout(() => inp.focus(), 150);
    const submit = async () => {
      const code = inp.value.trim().toUpperCase().replace(/\s+/g, ""); if (code.length < 6) { err.textContent = "Code trop court."; return; }
      go.disabled = true; err.textContent = "Vérification…";
      try {
        const r = await rpc("app_redeem", { p_app: C.app, p_code: code, p_device: dev() });
        if (r === "ok") { ls.set("ok", "1"); ls.set("code", code); unlock(); return; }
        err.textContent = r === "used" ? "Ce code a déjà été utilisé sur un autre téléphone." : r === "revoked" ? "Ce code n'est plus valable." : "Code inconnu. Vérifie les lettres et les chiffres.";
      } catch (e) { err.textContent = "Pas de connexion. Réessaie avec du réseau."; }
      go.disabled = false;
    };
    go.onclick = submit; inp.onkeydown = (e) => { if (e.key === "Enter") submit(); };
    q(lockEl, "#gt-own").onclick = () => ownerLogin().then((ok) => { if (ok) unlock(); });
  }
  function unlock() { if (lockEl) { lockEl.remove(); lockEl = null; } try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} document.dispatchEvent(new Event("gate-open")); }

  /* ---------- propriétaire ---------- */
  function ownerLogin() {
    return new Promise((res) => {
      const d = ov(`<h2>Clé propriétaire</h2><p>Colle ta clé (TD-…). Elle reste sur ce téléphone.</p>
        <input id="gt-k" class="free" placeholder="TD-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false">
        <button class="gt-btn" id="gt-ok">Valider</button><div class="gt-err" id="gt-e"></div><button class="gt-ghost" id="gt-x">Annuler</button>`, true);
      const k = q(d, "#gt-k"), e = q(d, "#gt-e"); setTimeout(() => k.focus(), 100);
      q(d, "#gt-x").onclick = () => { d.remove(); res(false); };
      q(d, "#gt-ok").onclick = async () => {
        const v = k.value.trim().toUpperCase(); if (!v) return; e.textContent = "Vérification…";
        try { if (await rpc("app_is_admin", { p_key: v })) { ls.set("admin", v); d.remove(); res(true); document.dispatchEvent(new Event("gate-owner")); } else e.textContent = "Clé incorrecte."; }
        catch (x) { e.textContent = "Pas de connexion. Réessaie avec du réseau."; }
      };
    });
  }

  /* ---------- inviter quelqu'un : un code à usage unique par personne ---------- */
  async function invite() {
    if (!adminKey()) { const ok = await ownerLogin(); if (!ok) return; }
    const d = ov(`<h2>Inviter quelqu'un</h2><p>Chaque invitation marche sur un seul téléphone. Tu peux la retirer quand tu veux.</p>
      <input id="gt-who" class="free" placeholder="Pour qui ? (ex. Karim)" autocomplete="off">
      <button class="gt-btn" id="gt-mk">Créer et envoyer</button><div class="gt-err" id="gt-e"></div>
      <h2 style="font-size:1rem;margin-top:6px">Invitations</h2><ul class="gt-list" id="gt-l"><li><small>Chargement…</small></li></ul>
      <button class="gt-ghost" id="gt-x">Fermer</button>`, true);
    const e = q(d, "#gt-e"), list = q(d, "#gt-l");
    q(d, "#gt-x").onclick = () => d.remove();
    d.addEventListener("click", (ev) => { if (ev.target === d) d.remove(); });
    const draw = async () => {
      try {
        const rows = await rpc("app_invite_list", { p_key: adminKey(), p_app: C.app });
        list.innerHTML = rows.length ? rows.map((r) => `<li class="${r.revoked ? "off" : ""}"><span><code>${esc(r.code)}</code> · ${esc(r.label || "sans nom")}</span>
          <small>${r.revoked ? "retirée" : r.uses >= r.max_uses ? "utilisée" : "pas encore utilisée"} · ${new Date(r.created_at).toLocaleDateString("fr-FR")}</small>
          <button data-rv="${esc(r.code)}" data-on="${r.revoked ? 0 : 1}">${r.revoked ? "Rétablir" : "Retirer"}</button></li>`).join("") : "<li><small>Aucune invitation pour l'instant.</small></li>";
      } catch (x) { list.innerHTML = `<li><small>${x.status === 400 || /autoris/.test(x.message) ? "Clé propriétaire refusée." : "Pas de connexion."}</small></li>`; }
    };
    list.onclick = async (ev) => { const b = ev.target.closest("[data-rv]"); if (!b) return; b.disabled = true; try { await rpc("app_invite_revoke", { p_key: adminKey(), p_code: b.dataset.rv, p_revoked: b.dataset.on === "1" }); } catch (x) {} draw(); };
    q(d, "#gt-mk").onclick = async () => {
      const who = q(d, "#gt-who").value.trim(); e.style.color = ""; e.textContent = "Création…";
      try {
        const code = await rpc("app_invite_create", { p_key: adminKey(), p_app: C.app, p_label: who, p_max: 1 });
        e.textContent = ""; draw();
        const url = C.link + "?invite=" + encodeURIComponent(code);
        const text = `${who ? who + ", je" : "Je"} t'invite sur ${C.name}. Ouvre le lien dans Safari, puis Partager › « Sur l'écran d'accueil ». Ton code d'invitation : ${code} (il ne marche que sur un téléphone).`;
        try { if (navigator.share) { await navigator.share({ title: C.name, text, url }); return; } } catch (x) { if (x && x.name === "AbortError") return; }
        try { await navigator.clipboard.writeText(text + "\n" + url); e.style.color = "#1E9C80"; e.textContent = "Message copié : colle-le à " + (who || "ton invité") + "."; } catch (x) { e.textContent = "Code : " + code; }
      } catch (x) { e.textContent = /autoris/.test(x.message) ? "Clé propriétaire refusée." : "Pas de connexion."; }
    };
    draw();
  }

  window.Gate = { isOwner, invite, ownerLogin, allowed };

  /* ---------- démarrage ---------- */
  const start = () => {
    if (!C.url || !C.key) return;           // pas de serveur configuré : pas de verrou
    if (!allowed()) {
      // tant que les invitations ne sont pas installées sur le serveur (fonction absente), on ne verrouille pas
      rpc("app_check", { p_app: C.app, p_device: dev() }).then((ok) => { if (ok === true) { ls.set("ok", "1"); return; } lock(); })
        .catch((e) => { if (e && (e.status === 404 || /PGRST202|Could not find the function/i.test(e.message))) return; lock(); });
      return;
    }
    if (isOwner() || !navigator.onLine) return;
    // vérification discrète : si l'invitation a été retirée, on reverrouille
    rpc("app_check", { p_app: C.app, p_device: dev() }).then((ok) => { if (ok === false) { ls.set("ok", null); lock(); } }).catch(() => {});
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
