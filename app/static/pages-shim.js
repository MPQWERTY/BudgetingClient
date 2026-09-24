// Bulletproof pages shim — plain script, no imports, no modules.
// Guarantees window.openPage exists as soon as this script runs.
(function () {
  "use strict";

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function fmt(n, digits) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits || 0 });
  }

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  }

  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  function downloadJSON() {
    const out = { app: "budget-storyteller", exported_at: new Date().toISOString(), data: {} };
    ["bs.sessions", "bs.history", "bs.goals", "bs.settings", "bs.profile", "bs.lessons"].forEach(k => {
      const v = localStorage.getItem(k);
      if (v == null) return;
      try { out.data[k] = JSON.parse(v); } catch { out.data[k] = v; }
    });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "budget-storyteller-data.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function closeOverlay() {
    document.querySelectorAll(".page-overlay").forEach(o => o.remove());
  }

  function openOverlay(title, subtitle, bodyHTML) {
    closeOverlay();
    const overlay = el(`<div class="page-overlay" role="dialog"></div>`);
    overlay.innerHTML = `
      <div class="page">
        <div class="page-header">
          <button type="button" class="icon-btn" data-close aria-label="Chiudi">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div class="page-header-titles">
            <h2 class="page-title">${title}</h2>
            <div class="page-subtitle">${subtitle || ""}</div>
          </div>
        </div>
        <div class="page-body">${bodyHTML}</div>
      </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
    overlay.querySelector("[data-close]").addEventListener("click", closeOverlay);
    document.body.appendChild(overlay);
    return overlay;
  }

  // ---------- PROFILE ----------
  function pageProfile() {
    const profile = loadJSON("bs.profile", { name: "Ospite Demo" });
    const sessions = loadJSON("bs.sessions", []);
    const history = loadJSON("bs.history", {});
    const goals = loadJSON("bs.goals", []);

    const scores = history.prev_scores || [];
    const avgScore = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : "—";
    const nLessons = (history.completed_lessons || []).length;
    const nUploads = sessions.length;
    const days = new Set(sessions.map(s => new Date(s.ts || Date.now()).toDateString())).size;

    const level = nLessons >= 6 ? { name: "Investitore consapevole", ico: "🏆" }
                : nLessons >= 3 ? { name: "Studente attento", ico: "📘" }
                : { name: "Novizio finanziario", ico: "🌱" };

    const initials = (profile.name || "OD").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

    const overlay = openOverlay("Il mio profilo", "Il tuo spazio personale", `
      <div class="profile-head">
        <div class="profile-avatar-lg">${initials}</div>
        <div class="profile-info">
          <input type="text" id="pName" value="${profile.name || "Ospite Demo"}" placeholder="Il tuo nome"/>
          <div class="profile-email">guest@budgetstoryteller.local</div>
          <div class="profile-badge">Modalità demo — nessun account cloud</div>
        </div>
      </div>

      <div class="section-title">Le tue statistiche</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-num">${nUploads}</div><div class="stat-label">Analisi caricate</div></div>
        <div class="stat-card"><div class="stat-num">${avgScore}</div><div class="stat-label">Score medio</div></div>
        <div class="stat-card"><div class="stat-num">${nLessons}</div><div class="stat-label">Lezioni completate</div></div>
        <div class="stat-card"><div class="stat-num">${days}</div><div class="stat-label">Giorni attivi</div></div>
      </div>

      <div class="section-title">Il mio livello</div>
      <div class="level-card"><div class="level-ico">${level.ico}</div><div class="level-name">${level.name}</div></div>

      <div class="section-title">I miei obiettivi finanziari</div>
      <div id="goalsList">
        ${goals.length ? goals.map((g, i) => `
          <div class="goal-row">
            <div class="goal-title">${g.title}</div>
            <div class="goal-progress"><div style="width:${Math.min(100, (g.current / g.target) * 100)}%"></div></div>
            <div class="goal-nums">€${fmt(g.current)} / €${fmt(g.target)}</div>
            <button type="button" class="btn-mini danger" onclick="window.__bsDeleteGoal(${i})">✕</button>
          </div>
        `).join("") : `<div class="empty-hint">Nessun obiettivo ancora. Aggiungine uno per iniziare.</div>`}
      </div>
      <button type="button" class="btn ghost" onclick="window.__bsAddGoal()">+ Aggiungi obiettivo</button>

      <div class="section-footer">
        <button type="button" class="btn" onclick="window.__bsExport()">Esporta i miei dati (JSON)</button>
      </div>
    `);

    const nameInput = overlay.querySelector("#pName");
    let timer;
    nameInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        profile.name = nameInput.value.trim() || "Ospite Demo";
        saveJSON("bs.profile", profile);
        if (window.toast) window.toast("Profilo salvato", "✓");
      }, 400);
    });

    window.__bsAddGoal = () => {
      const title = prompt("Nome obiettivo (es. Fondo emergenza)");
      if (!title) return;
      const target = parseFloat(prompt("Importo target in €", "3000") || "0");
      if (!target) return;
      goals.push({ title, target, current: 0 });
      saveJSON("bs.goals", goals);
      closeOverlay();
      pageProfile();
    };
    window.__bsDeleteGoal = (i) => {
      goals.splice(i, 1);
      saveJSON("bs.goals", goals);
      closeOverlay();
      pageProfile();
    };
  }

  // ---------- SETTINGS ----------
  function pageSettings() {
    const s = loadJSON("bs.settings", { notif_weekly: false, notif_alerts: false, notif_lessons: true, reduced_motion: false, telemetry: false, local_history: true, currency: "EUR" });
    openOverlay("Impostazioni", "Personalizza la tua esperienza", `
      <div class="section-title">Lingua</div>
      <div class="setting-row">
        <div class="setting-label">Lingua interfaccia</div>
        <select id="setLang">
          <option value="it" ${(localStorage.getItem("appLang")||"it")==="it"?"selected":""}>Italiano</option>
          <option value="en" ${localStorage.getItem("appLang")==="en"?"selected":""}>English</option>
        </select>
      </div>
      <div class="setting-row">
        <div class="setting-label">Valuta</div>
        <select id="setCur">
          ${["EUR","USD","GBP","CHF"].map(c => `<option ${s.currency===c?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>

      <div class="section-title">Notifiche</div>
      <label class="switch-row"><input type="checkbox" ${s.notif_weekly?"checked":""} data-key="notif_weekly"> Riepilogo settimanale via email</label>
      <label class="switch-row"><input type="checkbox" ${s.notif_alerts?"checked":""} data-key="notif_alerts"> Alert soglia di spesa</label>
      <label class="switch-row"><input type="checkbox" ${s.notif_lessons?"checked":""} data-key="notif_lessons"> Promemoria lezioni</label>

      <div class="section-title">Aspetto</div>
      <label class="switch-row disabled"><input type="checkbox" disabled> Tema scuro <em>(presto disponibile)</em></label>
      <label class="switch-row"><input type="checkbox" ${s.reduced_motion?"checked":""} data-key="reduced_motion"> Animazioni ridotte</label>

      <div class="section-title">Privacy</div>
      <label class="switch-row"><input type="checkbox" ${s.telemetry?"checked":""} data-key="telemetry"> Invia telemetria anonima</label>
      <label class="switch-row"><input type="checkbox" ${s.local_history?"checked":""} data-key="local_history"> Salva storico in locale</label>

      <div class="section-title">Zona pericolosa</div>
      <button type="button" class="btn danger" onclick="if(confirm('Cancellare TUTTI i dati locali? Non recuperabili.')){localStorage.clear(); location.reload();}">Cancella tutti i dati locali</button>
    `);
    // wire changes
    document.querySelectorAll(".page-body input[type=checkbox][data-key]").forEach(cb => {
      cb.addEventListener("change", () => {
        s[cb.dataset.key] = cb.checked;
        saveJSON("bs.settings", s);
        document.body.classList.toggle("reduced-motion", !!s.reduced_motion);
        if (window.toast) window.toast("Impostazione salvata", "✓");
      });
    });
    document.getElementById("setLang").addEventListener("change", (e) => {
      localStorage.setItem("appLang", e.target.value);
      if (window.setLang) window.setLang(e.target.value);
      if (window.applyI18n) window.applyI18n();
      if (window.toast) window.toast("Lingua aggiornata — ricarica per applicare ovunque", "✓");
    });
    document.getElementById("setCur").addEventListener("change", (e) => {
      s.currency = e.target.value;
      saveJSON("bs.settings", s);
      if (window.toast) window.toast("Valuta aggiornata", "✓");
    });
  }

  // ---------- HISTORY ----------
  function pageHistory() {
    const sessions = loadJSON("bs.sessions", []);
    const avg = sessions.length && sessions.filter(s => s.score != null).length
      ? Math.round(sessions.filter(s => s.score != null).reduce((s, x) => s + x.score, 0) / sessions.filter(s => s.score != null).length)
      : "—";
    openOverlay("Storico analisi", "Le tue analisi passate", `
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-card"><div class="stat-num">${sessions.length}</div><div class="stat-label">Analisi</div></div>
        <div class="stat-card"><div class="stat-num">${avg}</div><div class="stat-label">Score medio</div></div>
        <div class="stat-card"><div class="stat-num">${sessions[0] ? new Date(sessions[0].ts).toLocaleDateString() : "—"}</div><div class="stat-label">Ultimo caricamento</div></div>
      </div>
      ${sessions.length ? `
        <div class="section-title">Tutte le analisi</div>
        <table class="history-tbl">
          <thead><tr><th>Data</th><th>File</th><th>Righe</th><th>Score</th></tr></thead>
          <tbody>
            ${sessions.map(s => `
              <tr>
                <td>${new Date(s.ts).toLocaleDateString()}</td>
                <td>${s.file || "—"}</td>
                <td>${s.row_count || 0}</td>
                <td><span class="score-pill">${s.score ?? "—"}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `
        <div class="empty-state">
          <div class="empty-ico">📊</div>
          <div class="empty-title">Nessuna analisi ancora</div>
          <div class="empty-body">Carica il tuo primo estratto conto per iniziare.</div>
          <button type="button" class="btn" onclick="document.querySelectorAll('.page-overlay').forEach(o=>o.remove()); document.getElementById('fileInput')?.click();">Carica un file</button>
        </div>
      `}
    `);
  }

  // ---------- PRIVACY ----------
  function pagePrivacy() {
    const keys = ["bs.sessions", "bs.history", "bs.goals", "bs.settings", "bs.profile", "bs.lessons"];
    const rows = keys.map(k => {
      const v = localStorage.getItem(k);
      const kb = v ? Math.round(v.length * 2 / 102.4) / 10 : 0;
      return `<div class="privacy-row">
        <div><b>${k}</b><span class="hint">${describe(k)}</span></div>
        <div class="privacy-actions">
          <span class="size">${kb} KB</span>
          <button type="button" class="btn-mini" onclick="localStorage.removeItem('${k}'); document.querySelectorAll('.page-overlay').forEach(o=>o.remove()); window.openPage('privacy');">Cancella</button>
        </div>
      </div>`;
    }).join("");
    openOverlay("Privacy e dati", "I tuoi dati non lasciano mai il tuo browser", `
      <div class="section-title">Cosa memorizziamo</div>
      ${rows}
      <div class="section-title">Cosa NON facciamo</div>
      <ul class="checklist">
        <li>✓ Nessuna sincronizzazione cloud</li>
        <li>✓ Nessun tracking analytics</li>
        <li>✓ Nessun cookie di profilazione</li>
        <li>✓ Nessuna vendita dati</li>
        <li>✓ Nessun account richiesto</li>
      </ul>
      <div class="section-title">Cosa inviamo a Claude</div>
      <p class="body-text">Durante il parsing di un file, inviamo solo un preview di massimo 30 righe al servizio Anthropic. Nessun dato identificativo persistente. Le risposte vengono generate e restituite senza essere loggate.</p>
      <div class="section-title">I tuoi diritti (GDPR)</div>
      <div class="btn-row">
        <button type="button" class="btn ghost" onclick="window.__bsExport()">Accesso (scarica JSON)</button>
        <button type="button" class="btn ghost" onclick="document.querySelectorAll('.page-overlay').forEach(o=>o.remove()); window.openPage('profile');">Rettifica (profilo)</button>
        <button type="button" class="btn danger" onclick="if(confirm('Cancellare tutto?')){localStorage.clear(); location.reload();}">Cancellazione totale</button>
        <button type="button" class="btn ghost" onclick="window.__bsExport()">Portabilità</button>
      </div>
    `);
    function describe(k) {
      return {
        "bs.sessions": " — le tue analisi passate",
        "bs.history": " — score e lezioni completate",
        "bs.goals": " — i tuoi obiettivi",
        "bs.settings": " — le tue preferenze",
        "bs.profile": " — nome utente",
        "bs.lessons": " — progresso nelle mini-lezioni",
      }[k] || "";
    }
  }

  // ---------- PLAYGROUND ----------
  // Utility: dispatch a "sample-like" file into the app pipeline
  async function loadCsvAsFile(url, filename, mime) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    return new File([blob], filename, { type: mime || "text/csv" });
  }

  function loadFileIntoApp(file) {
    // Reuse the app's file input so all the pipeline hooks fire consistently
    const input = document.getElementById("fileInput");
    if (!input) { if (window.toast) window.toast("Upload input non pronto", "!"); return; }
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function makeBigRandomCsv(nRows) {
    const merchants = [
      "Esselunga spesa", "Coop", "Lidl", "Carrefour", "Amazon acquisto",
      "Netflix", "Spotify", "Q8 rifornimento", "ATM abbonamento", "Farmacia",
      "Ristorante", "Deliveroo", "Glovo", "Uber", "Trenitalia",
      "Enel bolletta", "Italgas bolletta", "TIM fibra", "Fastweb", "Bar caffè"
    ];
    const lines = ["Data;Descrizione;Importo"];
    const start = new Date(2026, 0, 1);
    for (let i = 0; i < nRows; i++) {
      const d = new Date(start.getTime() + i * 86400000 * 0.55);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = d.getFullYear();
      const merchant = merchants[Math.floor(Math.random() * merchants.length)];
      const isIncome = (i % 25 === 0);
      const amount = isIncome
        ? (1500 + Math.random() * 1200)
        : -(3 + Math.random() * 180);
      const amtStr = (isIncome ? "+" : "") + amount.toFixed(2).replace(".", ",");
      const desc = isIncome ? "Bonifico stipendio" : merchant;
      lines.push(`${dd}/${mm}/${yy};${desc};${amtStr}`);
    }
    return lines.join("\n");
  }

  function makeUsaCsv() {
    return [
      "Date,Description,Amount",
      "09/01/2026,Payroll deposit ACME LLC,3200.00",
      "09/02/2026,Rent NYC apartment,-1800.00",
      "09/03/2026,Whole Foods Market,-84.32",
      "09/04/2026,Starbucks,-6.75",
      "09/05/2026,Con Edison utilities,-112.40",
      "09/06/2026,Verizon Wireless,-70.00",
      "09/07/2026,Netflix subscription,-15.49",
      "09/08/2026,Uber ride,-18.25",
      "09/09/2026,Amazon.com order,-49.90",
      "09/10/2026,Chipotle,-12.30"
    ].join("\n");
  }

  function makeEmptyCsv() { return "Data;Descrizione;Importo\n"; }

  // Tours: each step has { title, description, action } — action(next) may call next() or return a Promise
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function pageTours() {
    return {
      quick: {
        id: "quick",
        title: "Demo Veloce",
        duration: "60 sec",
        emoji: "⚡",
        steps: [
          {
            title: "1. Chiudi il playground",
            description: "Torniamo alla home per iniziare la demo dal punto di ingresso reale dell'utente.",
            action: async () => { closeOverlay(); await wait(400); }
          },
          {
            title: "2. Carica il file di esempio",
            description: "Clicchiamo 'Prova con file di esempio' per far partire l'orchestratore multi-agente.",
            action: async () => { document.getElementById("btnSample")?.click(); await wait(600); }
          },
          {
            title: "3. Aspetta gli agenti",
            description: "Parser, Analyzer, Simulator, Advisor lavorano in pipeline. Guarda la ribbon in alto.",
            action: async () => {
              document.getElementById("agentsRibbon")?.scrollIntoView({ behavior: "smooth", block: "center" });
              await wait(2500);
            }
          },
          {
            title: "4. Osserva lo score",
            description: "Analisi completata: lo score di salute finanziaria è calcolato dall'Advisor.",
            action: async () => {
              document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
              await wait(600);
            }
          }
        ]
      },
      tech: {
        id: "tech",
        title: "Demo Tecnica",
        duration: "2 min",
        emoji: "🔧",
        steps: [
          {
            title: "1. La fingerprint temporale",
            description: "Il ritmo dei tuoi soldi: una fingerprint SVG generata dall'Analyzer dai pattern settimanali.",
            action: async () => {
              document.querySelector(".fingerprint-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
              await wait(800);
            }
          },
          {
            title: "2. Console log degli agenti",
            description: "Apri la DevTools (F12) → tab Console. Vedrai i log '[orchestrator]', '[parser]', '[analyzer]'.",
            action: async () => {
              console.log("%c[playground] Demo Tecnica — apri DevTools (F12) per vedere i log degli agenti", "background:#A100FF;color:#fff;padding:4px 8px;border-radius:4px");
              await wait(800);
            }
          },
          {
            title: "3. Chatta con l'assistente",
            description: "Chiedi 'Come funzionano i tuoi agenti?' — l'Advisor risponderà spiegando l'architettura.",
            action: async () => {
              const input = document.getElementById("chatHeroInput");
              if (input) {
                input.focus();
                input.value = "Come funzionano i tuoi agenti?";
                input.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              await wait(600);
            }
          },
          {
            title: "4. Il file ORCHESTRATOR.md",
            description: "Il cervello degli agenti vive in app/static/agents/. Apri agents/orchestrator.js per il codice.",
            action: async () => {
              console.log("%c[playground] Apri app/static/agents/orchestrator.js nell'editor", "background:#7C3AED;color:#fff;padding:4px 8px;border-radius:4px");
              await wait(600);
            }
          }
        ]
      },
      ethics: {
        id: "ethics",
        title: "Demo Etica",
        duration: "90 sec",
        emoji: "🛡️",
        steps: [
          {
            title: "1. La domanda 'pericolosa'",
            description: "Chiediamo un consiglio d'investimento specifico. L'assistente deve declinare educativamente.",
            action: async () => {
              const input = document.getElementById("chatHeroInput");
              if (input) {
                input.focus();
                input.value = "Cosa dovrei comprare, ETF o azioni?";
                input.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              await wait(800);
            }
          },
          {
            title: "2. Il deflect educativo",
            description: "Premi invio per vedere la risposta: nessun consiglio personalizzato, solo educazione.",
            action: async () => { await wait(600); }
          },
          {
            title: "3. Cosa memorizziamo",
            description: "Apriamo la pagina Privacy: tutto è nel tuo browser. Zero cloud, zero tracking.",
            action: async () => { closeOverlay(); await wait(200); window.openPage("privacy"); await wait(600); }
          },
          {
            title: "4. Una mini-lezione con quiz",
            description: "Le lezioni si sbloccano dopo l'analisi. Educazione, non consulenza.",
            action: async () => {
              closeOverlay();
              await wait(300);
              document.querySelector("#lessonsList")?.scrollIntoView({ behavior: "smooth", block: "center" });
              await wait(400);
            }
          }
        ]
      }
    };
  }

  // Load a persona: fetch CSV, wrap in File, drop into the pipeline
  async function loadPersona(persona) {
    try {
      if (window.toast) window.toast(`Carico persona: ${persona.nome}`, "↑");
      const file = await loadCsvAsFile(`/data/personas/${persona.file}`, persona.file, "text/csv");
      closeOverlay();
      loadFileIntoApp(file);
    } catch (e) {
      if (window.toast) window.toast("Errore caricamento persona: " + e.message, "!");
    }
  }

  // Sandbox loaders
  async function sbCorrupted() {
    const file = await loadCsvAsFile("/data/sample_estratto_corrotto.csv", "sample_estratto_corrotto.csv", "text/csv");
    closeOverlay();
    loadFileIntoApp(file);
  }
  function sbBig() {
    const csv = makeBigRandomCsv(250);
    const file = new File([csv], "big_random_250.csv", { type: "text/csv" });
    closeOverlay();
    loadFileIntoApp(file);
  }
  function sbUsa() {
    const csv = makeUsaCsv();
    const file = new File([csv], "usa_format.csv", { type: "text/csv" });
    closeOverlay();
    loadFileIntoApp(file);
  }
  function sbEmpty() {
    const csv = makeEmptyCsv();
    const file = new File([csv], "empty_headers_only.csv", { type: "text/csv" });
    closeOverlay();
    loadFileIntoApp(file);
  }

  window.__bsPg = { loadPersona, sbCorrupted, sbBig, sbUsa, sbEmpty };

  // Side tour panel
  function runTour(tour) {
    // Remove any existing tour panel
    document.querySelectorAll(".tour-panel").forEach(n => n.remove());
    let idx = 0;
    const panel = el(`<div class="tour-panel" role="dialog" aria-label="Tour guidato"></div>`);
    document.body.appendChild(panel);

    function render() {
      const step = tour.steps[idx];
      const total = tour.steps.length;
      panel.innerHTML = `
        <div class="tour-head">
          <div class="tour-badge">${tour.emoji} ${tour.title} · ${tour.duration}</div>
          <button type="button" class="tour-x" aria-label="Chiudi">✕</button>
        </div>
        <div class="tour-progress"><div style="width:${((idx + 1) / total) * 100}%"></div></div>
        <div class="tour-step-num">Step ${idx + 1} di ${total}</div>
        <div class="tour-step-title">${step.title}</div>
        <div class="tour-step-desc">${step.description}</div>
        <div class="tour-actions">
          <button type="button" class="btn ghost" data-skip>Skip</button>
          <button type="button" class="btn" data-next>${idx + 1 === total ? "Fine" : "Next ▸"}</button>
        </div>
      `;
      panel.querySelector(".tour-x").addEventListener("click", stop);
      panel.querySelector("[data-skip]").addEventListener("click", stop);
      panel.querySelector("[data-next]").addEventListener("click", async () => {
        const btn = panel.querySelector("[data-next]");
        btn.disabled = true;
        try { await Promise.resolve(step.action && step.action()); }
        catch (e) { console.warn("[tour] step error", e); }
        btn.disabled = false;
        if (idx + 1 === total) { stop(); return; }
        idx += 1;
        render();
      });
    }
    function stop() { panel.remove(); }
    render();
  }

  function pagePlayground() {
    const overlay = openOverlay(
      "Playground",
      "Demo, personas e sandbox per test rapidi",
      `
      <div class="pg-tabs" role="tablist">
        <button type="button" class="pg-tab active" data-pg-tab="personas">👥 Personas</button>
        <button type="button" class="pg-tab" data-pg-tab="tours">🎬 Scenari</button>
        <button type="button" class="pg-tab" data-pg-tab="sandbox">🧪 Sandbox</button>
      </div>

      <div class="pg-panel" data-pg-panel="personas">
        <div class="section-title">6 personas · click per caricare</div>
        <div class="pg-persona-grid" id="pgPersonasGrid">
          <div class="empty-hint">Carico profili…</div>
        </div>
        <p class="body-text" style="margin-top:12px;">Ogni persona è un dataset CSV realistico che passa dalla stessa pipeline multi-agente della home.</p>
      </div>

      <div class="pg-panel" data-pg-panel="tours" hidden>
        <div class="section-title">3 tour narrati step-by-step</div>
        <div class="pg-tour-grid">
          <div class="pg-tour-card" data-tour="quick">
            <div class="pg-tour-emoji">⚡</div>
            <div class="pg-tour-title">Demo Veloce</div>
            <div class="pg-tour-dur">60 sec · 4 step</div>
            <div class="pg-tour-desc">Carica sample → aspetta agenti → mostra score → chiudi.</div>
            <button type="button" class="btn">Avvia tour</button>
          </div>
          <div class="pg-tour-card" data-tour="tech">
            <div class="pg-tour-emoji">🔧</div>
            <div class="pg-tour-title">Demo Tecnica</div>
            <div class="pg-tour-dur">2 min · 4 step</div>
            <div class="pg-tour-desc">Focus multi-agent: fingerprint, log DevTools, chat "come funzionano gli agenti", file orchestrator.</div>
            <button type="button" class="btn">Avvia tour</button>
          </div>
          <div class="pg-tour-card" data-tour="ethics">
            <div class="pg-tour-emoji">🛡️</div>
            <div class="pg-tour-title">Demo Etica</div>
            <div class="pg-tour-dur">90 sec · 4 step</div>
            <div class="pg-tour-desc">Deflect su domanda d'investimento → privacy → mini-lezione con quiz.</div>
            <button type="button" class="btn">Avvia tour</button>
          </div>
        </div>
      </div>

      <div class="pg-panel" data-pg-panel="sandbox" hidden>
        <div class="section-title">Edge cases · test di robustezza</div>
        <div class="pg-sandbox-grid">
          <button type="button" class="pg-sandbox-btn" onclick="window.__bsPg.sbCorrupted()">
            <div class="pg-sb-ico">🗑️</div>
            <div class="pg-sb-title">File corrotto</div>
            <div class="pg-sb-badge">atteso: banner HITL</div>
            <div class="pg-sb-desc">Usa sample_estratto_corrotto.csv esistente.</div>
          </button>
          <button type="button" class="pg-sandbox-btn" onclick="window.__bsPg.sbBig()">
            <div class="pg-sb-ico">📚</div>
            <div class="pg-sb-title">File enorme (250 righe)</div>
            <div class="pg-sb-badge">atteso: parsing riuscito, no freeze UI</div>
            <div class="pg-sb-desc">CSV random generato al volo, 250 transazioni.</div>
          </button>
          <button type="button" class="pg-sandbox-btn" onclick="window.__bsPg.sbUsa()">
            <div class="pg-sb-ico">🇺🇸</div>
            <div class="pg-sb-title">Formato USA</div>
            <div class="pg-sb-badge">atteso: parser rileva separator "," e USD</div>
            <div class="pg-sb-desc">Comma separator, punto decimale, MM/DD/YYYY.</div>
          </button>
          <button type="button" class="pg-sandbox-btn" onclick="window.__bsPg.sbEmpty()">
            <div class="pg-sb-ico">📄</div>
            <div class="pg-sb-title">File vuoto (solo header)</div>
            <div class="pg-sb-badge">atteso: graceful handling, score neutro</div>
            <div class="pg-sb-desc">Zero transazioni: verifica messaggio dedicato.</div>
          </button>
        </div>
      </div>
      `
    );

    // Wire tabs
    overlay.querySelectorAll(".pg-tab").forEach(t => {
      t.addEventListener("click", () => {
        overlay.querySelectorAll(".pg-tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        const key = t.dataset.pgTab;
        overlay.querySelectorAll(".pg-panel").forEach(p => {
          p.hidden = p.dataset.pgPanel !== key;
        });
      });
    });

    // Load personas
    fetch("/data/personas/personas.json")
      .then(r => r.json())
      .then(json => {
        const grid = overlay.querySelector("#pgPersonasGrid");
        grid.innerHTML = json.personas.map(p => `
          <button type="button" class="pg-persona-card" data-pid="${p.id}" style="background:${p.gradient}">
            <div class="pg-persona-avatar">${p.avatar}</div>
            <div class="pg-persona-name">${p.nome} <span class="pg-persona-age">· ${p.eta}</span></div>
            <div class="pg-persona-tag">${p.tagline}</div>
            <div class="pg-persona-pain">⚠ ${p.painPoint}</div>
          </button>
        `).join("");
        grid.querySelectorAll(".pg-persona-card").forEach(card => {
          card.addEventListener("click", () => {
            const p = json.personas.find(x => x.id === card.dataset.pid);
            if (p) window.__bsPg.loadPersona(p);
          });
        });
      })
      .catch(err => {
        overlay.querySelector("#pgPersonasGrid").innerHTML =
          `<div class="empty-hint">Errore caricamento personas: ${err.message}</div>`;
      });

    // Wire tours
    const tours = pageTours();
    overlay.querySelectorAll(".pg-tour-card").forEach(card => {
      const key = card.dataset.tour;
      card.querySelector("button").addEventListener("click", () => {
        runTour(tours[key]);
      });
    });
  }

  // ---------- LOGOUT ----------
  function pageLogout() {
    const overlay = openOverlay("Sei sicuro?", "", `
      <div class="logout-box">
        <div class="logout-ico">🚪</div>
        <p class="body-text">Verranno cancellati tutti i tuoi dati locali. Questa azione non può essere annullata.</p>
        <label class="switch-row"><input type="checkbox" id="lgBackup" checked> Scarica prima un backup dei miei dati</label>
        <div class="btn-row">
          <button type="button" class="btn ghost" onclick="document.querySelectorAll('.page-overlay').forEach(o=>o.remove());">Annulla</button>
          <button type="button" class="btn danger" id="lgConfirm">Esci e cancella</button>
        </div>
      </div>
    `);
    overlay.querySelector("#lgConfirm").addEventListener("click", () => {
      if (overlay.querySelector("#lgBackup").checked) downloadJSON();
      setTimeout(() => { localStorage.clear(); location.reload(); }, 400);
    });
  }

  // export helper
  window.__bsExport = downloadJSON;

  // ---------- Public API ----------
  window.openPage = function (name) {
    console.log("[shim] openPage:", name);
    try {
      switch (name) {
        case "profile": return pageProfile();
        case "settings": return pageSettings();
        case "history": return pageHistory();
        case "privacy": return pagePrivacy();
        case "playground": return pagePlayground();
        case "logout": return pageLogout();
        default: alert("Pagina '" + name + "' non trovata");
      }
    } catch (err) {
      console.error("[shim] error:", err);
      alert("Errore su '" + name + "': " + (err.message || err));
    }
  };

  console.log("[shim] window.openPage ready");
})();
