// ============================================================
// Budget Storyteller — user menu pages.
// Fullscreen overlays: profile / settings / history / privacy
// + logout confirmation. Namespaced under .page-overlay/.page
// so it does NOT collide with the mini-lesson .modal-overlay.
// ============================================================

import {
  loadSessions, loadHistory,
  loadGoals, saveGoals,
  loadSettings, saveSettings,
  loadProfile, saveProfile,
  exportAllData, deleteSession,
  clearEverything, storageSizeKB,
} from "./agents/state.js";
import { setLang, getLang, t } from "./lib/i18n.js";

// ---------- Utilities ----------

const uid = () => "g_" + Math.random().toString(36).slice(2, 10);

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(getLang() === "en" ? "en-US" : "it-IT", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return String(ts); }
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  const hr = Math.round(diff / 3600000);
  const day = Math.round(diff / 86400000);
  const en = getLang() === "en";
  if (min < 1) return en ? "just now" : "adesso";
  if (min < 60) return en ? `${min}m ago` : `${min}m fa`;
  if (hr < 24) return en ? `${hr}h ago` : `${hr}h fa`;
  if (day < 30) return en ? `${day}d ago` : `${day}g fa`;
  return fmtDate(ts);
}

function currencySymbol(code) {
  return ({ EUR: "€", USD: "$", GBP: "£", CHF: "CHF " }[code] || "€");
}

function fmtMoney(n, code) {
  const s = currencySymbol(code || (loadSettings().currency || "EUR"));
  const val = Number(n) || 0;
  return `${s}${val.toLocaleString(getLang() === "en" ? "en-US" : "it-IT", { maximumFractionDigits: 0 })}`;
}

// Debounced save
function debounce(fn, ms = 300) {
  let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

// ---------- Toast ----------

const CHECK_ICON = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
const ERR_ICON = `<svg viewBox="0 0 24 24"><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="17" r="1"/></svg>`;

let _toastEl = null;
let _toastHide = null;

export function toast(msg, kind = "ok") {
  if (!_toastEl) {
    _toastEl = document.createElement("div");
    _toastEl.className = "page-toast";
    document.body.appendChild(_toastEl);
  }
  _toastEl.className = "page-toast" + (kind === "error" ? " error" : "");
  _toastEl.innerHTML = `${kind === "error" ? ERR_ICON : CHECK_ICON}<span></span>`;
  _toastEl.querySelector("span").textContent = msg;
  requestAnimationFrame(() => _toastEl.classList.add("show"));
  clearTimeout(_toastHide);
  _toastHide = setTimeout(() => _toastEl.classList.remove("show"), 1800);
}
// Expose so other modules can reuse it
try { window.pageToast = toast; } catch {}

// ---------- Icons (Feather-style) ----------

const ICONS = {
  user: `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  shield: `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  file: `<svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  award: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
  check: CHECK_ICON,
  upload: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  empty: `<svg viewBox="0 0 24 24" fill="none" stroke="#BE82FF" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><circle cx="7.5" cy="7" r="0.6" fill="#BE82FF"/><circle cx="10" cy="7" r="0.6" fill="#BE82FF"/></svg>`,
};

// ---------- Avatar dropdown injection ----------

function initials(name) {
  const s = (name || "Ospite").trim();
  return s.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "O";
}

let _dropdownMounted = false;

function mountAvatarDropdown() {
  if (_dropdownMounted) return;
  const actions = document.querySelector(".nav-actions") || document.querySelector(".topbar-actions");
  if (!actions) return;
  actions.querySelectorAll(".user-menu, .avatar-wrap").forEach(el => el.remove());
  _dropdownMounted = true;

  const profile = loadProfile();
  const name = profile.name || (getLang() === "en" ? "Guest Demo" : "Ospite Demo");
  const email = profile.email || "guest@budgetstoryteller.local";

  // esporta subito le funzioni sul window (le usano gli onclick inline)
  window.__bsOpenPage = (n) => {
    try {
      const menu = document.getElementById("avatarMenu");
      if (menu) menu.classList.remove("open");
      openPage(n);
    } catch (err) {
      console.error("[pages] openPage error:", err);
      alert("Errore apertura '" + n + "': " + (err.message || err));
    }
    return false;
  };
  window.__bsToggleMenu = () => {
    const menu = document.getElementById("avatarMenu");
    if (menu) menu.classList.toggle("open");
    return false;
  };

  const wrap = document.createElement("div");
  wrap.className = "avatar-wrap";
  wrap.innerHTML = `
    <button class="avatar-btn" id="avatarBtn" onclick="return window.__bsToggleMenu()" aria-haspopup="true">${initials(name)}</button>
    <div class="avatar-menu" id="avatarMenu" role="menu">
      <div class="avatar-menu-header">
        <div class="avatar-menu-name" data-name>${name}</div>
        <div class="avatar-menu-email">${email}</div>
      </div>
      <ul>
        <li><button type="button" onclick="return window.__bsOpenPage('profile')">${ICONS.user}<span>${t("menu_profile")}</span></button></li>
        <li><button type="button" onclick="return window.__bsOpenPage('settings')">${ICONS.settings}<span>${t("menu_settings")}</span></button></li>
        <li><button type="button" onclick="return window.__bsOpenPage('history')">${ICONS.clock}<span>${t("menu_history")}</span></button></li>
        <li><button type="button" onclick="return window.__bsOpenPage('privacy')">${ICONS.shield}<span>${t("menu_privacy")}</span></button></li>
      </ul>
      <div class="avatar-menu-sep"></div>
      <ul>
        <li><button type="button" class="danger" onclick="return window.__bsOpenPage('logout')">${ICONS.logout}<span>${t("menu_logout")}</span></button></li>
      </ul>
    </div>
  `;
  actions.appendChild(wrap);

  // chiudi al click fuori
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      const m = document.getElementById("avatarMenu");
      if (m) m.classList.remove("open");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const m = document.getElementById("avatarMenu");
      if (m) m.classList.remove("open");
    }
  });
}

function refreshAvatar() {
  const profile = loadProfile();
  const name = profile.name || (getLang() === "en" ? "Guest Demo" : "Ospite Demo");
  const btn = document.getElementById("avatarBtn");
  const label = document.querySelector("#avatarMenu [data-name]");
  if (btn) btn.textContent = initials(name);
  if (label) label.textContent = name;
}

// ---------- Overlay scaffolding ----------

function createOverlay({ title, subtitle, bodyEl, footerEl }) {
  const overlay = el(`<div class="page-overlay" role="dialog" aria-modal="true"></div>`);
  const page = el(`<div class="page"></div>`);
  const header = el(`
    <div class="page-header">
      <button class="icon-btn" data-close aria-label="${t("close")}">${ICONS.close}</button>
      <div class="page-header-titles">
        <h2 class="page-title"></h2>
        <div class="page-subtitle"></div>
      </div>
    </div>
  `);
  header.querySelector(".page-title").textContent = title;
  header.querySelector(".page-subtitle").textContent = subtitle || "";
  const body = el(`<div class="page-body"></div>`);
  body.appendChild(bodyEl);
  page.appendChild(header);
  page.appendChild(body);
  if (footerEl) {
    const footer = el(`<div class="page-footer"></div>`);
    footer.appendChild(footerEl);
    page.appendChild(footer);
  }
  overlay.appendChild(page);

  const close = () => { overlay.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  header.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", esc);

  document.body.appendChild(overlay);
  return { overlay, page, body, close };
}

// ============================================================
// 1) PROFILE PAGE
// ============================================================

function computeProfileStats() {
  const sessions = loadSessions();
  const history = loadHistory();
  const scores = (history.prev_scores || []).filter(x => x != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : "—";
  const uniqueDays = new Set(sessions.map(s => new Date(s.ts).toDateString())).size;
  return {
    uploads: sessions.length,
    avgScore: avg,
    lessons: (history.completed_lessons || []).length,
    days: uniqueDays,
  };
}

function levelFor(lessonCount) {
  const en = getLang() === "en";
  if (lessonCount >= 6) return { name: en ? "Aware investor" : "Investitore consapevole", desc: en ? "You've completed 6+ micro-lessons. Great job!" : "Hai completato 6+ micro-lezioni. Ottimo!" };
  if (lessonCount >= 3) return { name: en ? "Focused student" : "Studente attento", desc: en ? "Solid habits. Keep learning." : "Buone abitudini. Continua." };
  return { name: en ? "Financial novice" : "Novizio finanziario", desc: en ? "Complete a few lessons to level up." : "Completa qualche lezione per salire di livello." };
}

function renderProfile() {
  const profile = loadProfile();
  const name = profile.name || (getLang() === "en" ? "Guest Demo" : "Ospite Demo");
  const email = "guest@budgetstoryteller.local";
  const stats = computeProfileStats();
  const goals = loadGoals();
  const lv = levelFor((loadHistory().completed_lessons || []).length);

  const body = el(`<div></div>`);

  // Head
  const head = el(`
    <div class="profile-head">
      <div class="profile-avatar" data-initials>${initials(name)}</div>
      <div class="profile-info">
        <input type="text" class="profile-name-input" value="" maxlength="60" />
        <div class="profile-email">${email}</div>
        <div class="profile-badge">${t("profile_demo_badge")}</div>
      </div>
    </div>
  `);
  const nameInput = head.querySelector(".profile-name-input");
  nameInput.value = name;
  const avatarLbl = head.querySelector("[data-initials]");
  const saveName = debounce((v) => {
    const p = loadProfile(); p.name = v; saveProfile(p);
    avatarLbl.textContent = initials(v || "O");
    refreshAvatar();
    toast(t("profile_saved"));
  }, 400);
  nameInput.addEventListener("input", (e) => saveName(e.target.value.trim()));
  body.appendChild(head);

  // Stats
  const statsSec = el(`
    <div class="page-section" style="margin-top:28px">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Usage" : "Utilizzo"}</div>
        <h3 class="page-section-title">${getLang() === "en" ? "Your activity" : "La tua attività"}</h3>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${stats.uploads}</div><div class="stat-label">${t("profile_stats_uploads")}</div></div>
        <div class="stat-card"><div class="stat-value">${stats.avgScore}</div><div class="stat-label">${t("profile_stats_score")}</div></div>
        <div class="stat-card"><div class="stat-value">${stats.lessons}</div><div class="stat-label">${t("profile_stats_lessons")}</div></div>
        <div class="stat-card"><div class="stat-value">${stats.days}</div><div class="stat-label">${t("profile_stats_days")}</div></div>
      </div>
    </div>
  `);
  body.appendChild(statsSec);

  // Level
  const lvSec = el(`
    <div class="page-section" style="margin-top:28px">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Progress" : "Progresso"}</div>
        <h3 class="page-section-title">${t("profile_level_title")}</h3>
      </div>
      <div class="level-badge">
        <div class="level-icon">${ICONS.award}</div>
        <div>
          <div class="level-name">${lv.name}</div>
          <div class="level-desc">${lv.desc}</div>
        </div>
      </div>
    </div>
  `);
  body.appendChild(lvSec);

  // Goals
  const goalsSec = el(`
    <div class="page-section" style="margin-top:28px">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Goals" : "Obiettivi"}</div>
        <h3 class="page-section-title">${t("profile_goals_title")}</h3>
      </div>
      <div class="goal-form">
        <label class="field"><span>${getLang() === "en" ? "Goal title" : "Titolo obiettivo"}</span><input type="text" id="goalTitle" placeholder="${getLang() === "en" ? "e.g. Emergency fund" : "es. Fondo emergenza"}" /></label>
        <label class="field"><span>${getLang() === "en" ? "Target" : "Obiettivo"}</span><input type="number" id="goalTarget" min="1" placeholder="3000" /></label>
        <label class="field"><span>${getLang() === "en" ? "Saved" : "Risparmiato"}</span><input type="number" id="goalCurrent" min="0" value="0" /></label>
        <button class="btn btn-primary" id="goalAdd">${ICONS.plus}<span>${t("profile_add_goal")}</span></button>
      </div>
      <div id="goalList"></div>
    </div>
  `);
  body.appendChild(goalsSec);

  const goalList = goalsSec.querySelector("#goalList");
  function renderGoals() {
    const current = loadGoals();
    if (!current.length) {
      goalList.innerHTML = `<div class="goal-empty">${t("profile_goals_empty")}</div>`;
      return;
    }
    goalList.innerHTML = "";
    current.forEach(g => {
      const pct = Math.max(0, Math.min(100, Math.round((g.current / (g.target || 1)) * 100)));
      const card = el(`
        <div class="goal-card">
          <div class="goal-head">
            <div class="goal-title"></div>
            <div class="goal-amounts">${fmtMoney(g.current)} / ${fmtMoney(g.target)} · ${pct}%</div>
          </div>
          <div class="goal-progress"><div class="goal-progress-bar" style="width:${pct}%"></div></div>
          <div class="goal-actions">
            <input type="number" min="0" value="${g.current}" title="${getLang() === "en" ? "Update saved amount" : "Aggiorna importo risparmiato"}" />
            <button class="btn btn-ghost btn-sm" data-save>${t("save")}</button>
            <button class="btn btn-ghost btn-sm" data-del style="margin-left:auto;color:#fca5a5">${ICONS.trash}</button>
          </div>
        </div>
      `);
      card.querySelector(".goal-title").textContent = g.title;
      const inp = card.querySelector('input[type="number"]');
      card.querySelector("[data-save]").addEventListener("click", () => {
        const list = loadGoals();
        const i = list.findIndex(x => x.id === g.id);
        if (i >= 0) { list[i].current = Math.max(0, Number(inp.value) || 0); saveGoals(list); renderGoals(); toast(t("settings_saved")); }
      });
      card.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm(getLang() === "en" ? "Delete this goal?" : "Eliminare questo obiettivo?")) return;
        saveGoals(loadGoals().filter(x => x.id !== g.id));
        renderGoals();
      });
      goalList.appendChild(card);
    });
  }
  renderGoals();

  goalsSec.querySelector("#goalAdd").addEventListener("click", () => {
    const title = goalsSec.querySelector("#goalTitle").value.trim();
    const target = Number(goalsSec.querySelector("#goalTarget").value) || 0;
    const current = Number(goalsSec.querySelector("#goalCurrent").value) || 0;
    if (!title || target <= 0) {
      toast(getLang() === "en" ? "Please fill title and target" : "Compila titolo e obiettivo", "error");
      return;
    }
    const list = loadGoals();
    list.push({ id: uid(), title, target, current, created: Date.now() });
    saveGoals(list);
    goalsSec.querySelector("#goalTitle").value = "";
    goalsSec.querySelector("#goalTarget").value = "";
    goalsSec.querySelector("#goalCurrent").value = "0";
    renderGoals();
    toast(t("settings_saved"));
  });

  // Footer
  const footer = el(`<div style="display:flex;gap:10px"></div>`);
  const exportBtn = el(`<button class="btn btn-primary">${ICONS.download}<span>${t("profile_export_btn")}</span></button>`);
  exportBtn.addEventListener("click", () => {
    downloadJSON(exportAllData(), `budget-storyteller-export-${Date.now()}.json`);
    toast(getLang() === "en" ? "Exported" : "Esportato");
  });
  footer.appendChild(exportBtn);

  return createOverlay({ title: t("menu_profile"), subtitle: t("profile_subtitle"), bodyEl: body, footerEl: footer });
}

// ============================================================
// 2) SETTINGS PAGE
// ============================================================

const DEFAULT_SETTINGS = {
  currency: "EUR",
  notif: { weekly: false, threshold: false, lessons: false },
  darkTheme: true,   // display-only (already dark)
  reducedMotion: false,
  telemetry: false,
  localHistory: true,
  parsePrecision: "balanced",
  narrativeLang: "auto",
};

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(loadSettings() || {}) };
}

function persistSetting(patch) {
  const merged = { ...getSettings(), ...patch };
  saveSettings(merged);
  applySettings(merged);
  return merged;
}

export function applySettings(s) {
  s = s || getSettings();
  document.body.classList.toggle("reduced-motion", !!s.reducedMotion);
}

function switchBtn(on) {
  const b = el(`<button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on ? "true" : "false"}"></button>`);
  return b;
}

function switchRow({ title, hint, checked, onChange, disabled }) {
  const row = el(`
    <div class="switch-row ${disabled ? "disabled" : ""}">
      <div class="switch-info">
        <div class="switch-title"></div>
        <div class="switch-hint"></div>
      </div>
    </div>
  `);
  row.querySelector(".switch-title").textContent = title;
  row.querySelector(".switch-hint").textContent = hint || "";
  const sw = switchBtn(!!checked);
  if (disabled) sw.setAttribute("disabled", "");
  sw.addEventListener("click", () => {
    if (disabled) return;
    const nowOn = !sw.classList.contains("on");
    sw.classList.toggle("on", nowOn);
    sw.setAttribute("aria-checked", nowOn ? "true" : "false");
    onChange && onChange(nowOn);
  });
  row.appendChild(sw);
  return row;
}

function renderSettings() {
  const s = getSettings();
  const body = el(`<div></div>`);
  const debSave = debounce(() => toast(t("settings_saved")), 250);
  const change = (patch) => { persistSetting(patch); debSave(); };

  // Language
  const langSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Language" : "Lingua"}</div>
        <h3 class="page-section-title">${t("settings_language")}</h3>
        <div class="page-section-hint">${getLang() === "en" ? "UI text language." : "Lingua dell'interfaccia."}</div>
      </div>
      <select id="langSel">
        <option value="it">Italiano</option>
        <option value="en">English</option>
      </select>
    </div>
  `);
  langSec.querySelector("#langSel").value = getLang();
  langSec.querySelector("#langSel").addEventListener("change", (e) => {
    setLang(e.target.value);
    // Re-render page + notify main topbar select
    const globalSel = document.getElementById("langSelect");
    if (globalSel) { globalSel.value = e.target.value; globalSel.dispatchEvent(new Event("change")); }
    toast(t("settings_saved"));
    // Rebuild overlay to reflect new labels
    document.querySelectorAll(".page-overlay").forEach(o => o.remove());
    openPage("settings");
  });
  body.appendChild(langSec);

  // Currency
  const curSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Currency" : "Valuta"}</div>
        <h3 class="page-section-title">${t("settings_currency")}</h3>
        <div class="page-section-hint">${getLang() === "en" ? "Applied to money formatting." : "Applicata ai formati numerici."}</div>
      </div>
      <select id="curSel">
        <option value="EUR">EUR (€)</option>
        <option value="USD">USD ($)</option>
        <option value="GBP">GBP (£)</option>
        <option value="CHF">CHF</option>
      </select>
    </div>
  `);
  curSec.querySelector("#curSel").value = s.currency;
  curSec.querySelector("#curSel").addEventListener("change", (e) => change({ currency: e.target.value }));
  body.appendChild(curSec);

  // Notifications
  const notifSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Notifications" : "Notifiche"}</div>
        <h3 class="page-section-title">${t("settings_notifications")}</h3>
        <div class="page-section-hint">${getLang() === "en" ? "Choose what to hear about." : "Scegli su cosa essere avvisato."}</div>
      </div>
    </div>
  `);
  notifSec.appendChild(switchRow({
    title: t("settings_notif_weekly"),
    hint: getLang() === "en" ? "A concise recap every Monday." : "Un riepilogo ogni lunedì.",
    checked: s.notif.weekly,
    onChange: v => change({ notif: { ...s.notif, weekly: v } }),
  }));
  notifSec.appendChild(switchRow({
    title: t("settings_notif_threshold"),
    hint: getLang() === "en" ? "Alert when a category exceeds its typical value." : "Avviso quando una categoria supera il valore tipico.",
    checked: s.notif.threshold,
    onChange: v => change({ notif: { ...s.notif, threshold: v } }),
  }));
  notifSec.appendChild(switchRow({
    title: t("settings_notif_lessons"),
    hint: getLang() === "en" ? "Nudges when a new lesson is ready." : "Promemoria quando c'è una nuova lezione.",
    checked: s.notif.lessons,
    onChange: v => change({ notif: { ...s.notif, lessons: v } }),
  }));
  body.appendChild(notifSec);

  // Appearance
  const appSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Appearance" : "Aspetto"}</div>
        <h3 class="page-section-title">${t("settings_appearance")}</h3>
      </div>
    </div>
  `);
  appSec.appendChild(switchRow({
    title: t("settings_dark"),
    hint: t("settings_dark_soon"),
    checked: true,
    disabled: true,
  }));
  appSec.appendChild(switchRow({
    title: t("settings_reduced_motion"),
    hint: getLang() === "en" ? "Removes animations and transitions." : "Rimuove animazioni e transizioni.",
    checked: s.reducedMotion,
    onChange: v => change({ reducedMotion: v }),
  }));
  body.appendChild(appSec);

  // Privacy
  const privSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Privacy" : "Privacy"}</div>
        <h3 class="page-section-title">${t("settings_privacy")}</h3>
      </div>
    </div>
  `);
  privSec.appendChild(switchRow({
    title: t("settings_telemetry"),
    hint: getLang() === "en" ? "Anonymous usage counters — off by default." : "Contatori d'uso anonimi — off di default.",
    checked: s.telemetry,
    onChange: v => change({ telemetry: v }),
  }));
  privSec.appendChild(switchRow({
    title: t("settings_localhistory"),
    hint: getLang() === "en" ? "Keeps your past analyses in this browser." : "Conserva le analisi passate in questo browser.",
    checked: s.localHistory,
    onChange: v => change({ localHistory: v }),
  }));
  body.appendChild(privSec);

  // Analysis
  const anSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${getLang() === "en" ? "Analysis" : "Analisi"}</div>
        <h3 class="page-section-title">${t("settings_analysis")}</h3>
        <div class="page-section-hint">${getLang() === "en" ? "Fine tune how your files are read." : "Regola come vengono elaborati i tuoi file."}</div>
      </div>
      <label class="field"><span>${t("settings_parse_precision")}</span>
        <select id="prec">
          <option value="fast">${t("settings_parse_fast")}</option>
          <option value="balanced">${t("settings_parse_balanced")}</option>
          <option value="accurate">${t("settings_parse_accurate")}</option>
        </select>
      </label>
      <label class="field"><span>${t("settings_narrative_lang")}</span>
        <select id="nlang">
          <option value="auto">${t("settings_narrative_auto")}</option>
          <option value="it">Italiano</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  `);
  anSec.querySelector("#prec").value = s.parsePrecision;
  anSec.querySelector("#nlang").value = s.narrativeLang;
  anSec.querySelector("#prec").addEventListener("change", e => change({ parsePrecision: e.target.value }));
  anSec.querySelector("#nlang").addEventListener("change", e => change({ narrativeLang: e.target.value }));
  body.appendChild(anSec);

  // Danger zone
  const danger = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow" style="color:#fca5a5">${getLang() === "en" ? "Danger" : "Pericolo"}</div>
        <h3 class="page-section-title">${t("settings_danger")}</h3>
        <div class="page-section-hint">${getLang() === "en" ? "Irreversible actions on your local data." : "Azioni irreversibili sui tuoi dati locali."}</div>
      </div>
      <button class="btn btn-danger" id="clearAll">${ICONS.trash}<span>${t("settings_clear_all")}</span></button>
    </div>
  `);
  danger.querySelector("#clearAll").addEventListener("click", () => {
    if (!confirm(getLang() === "en" ? "Delete ALL local data? This cannot be undone." : "Cancellare TUTTI i dati locali? Azione irreversibile.")) return;
    if (!confirm(getLang() === "en" ? "Really sure?" : "Confermi definitivamente?")) return;
    clearEverything();
    toast(getLang() === "en" ? "All local data cleared" : "Tutti i dati cancellati");
    setTimeout(() => location.reload(), 700);
  });
  body.appendChild(danger);

  return createOverlay({ title: t("menu_settings"), subtitle: t("settings_subtitle"), bodyEl: body });
}

// ============================================================
// 3) HISTORY PAGE
// ============================================================

function sparkline(values, w = 60, h = 20) {
  if (!values || !values.length) return `<svg class="sparkline" width="${w}" height="${h}"></svg>`;
  const max = Math.max(...values, 1);
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#BE82FF" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function renderHistory() {
  const body = el(`<div></div>`);
  const sessions = loadSessions();

  // Header stats
  const scores = sessions.map(s => s.score).filter(x => x != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : "—";
  const last = sessions[0]?.ts ? relativeTime(sessions[0].ts) : "—";
  const stats = el(`
    <div class="detail-block">
      <div class="detail-grid">
        <div class="detail-kv"><span class="k">${t("history_stats_count")}</span><span class="v">${sessions.length}</span></div>
        <div class="detail-kv"><span class="k">${t("history_stats_avg")}</span><span class="v">${avg}</span></div>
        <div class="detail-kv"><span class="k">${t("history_stats_last")}</span><span class="v">${last}</span></div>
      </div>
    </div>
  `);
  body.appendChild(stats);

  if (!sessions.length) {
    const empty = el(`
      <div class="empty-state">
        ${ICONS.empty}
        <h3>${t("history_empty")}</h3>
        <p>${getLang() === "en" ? "Your uploads will appear here." : "Le tue analisi appariranno qui."}</p>
        <button class="btn btn-primary" id="emptyCta">${ICONS.upload}<span>${t("history_empty_cta")}</span></button>
      </div>
    `);
    empty.querySelector("#emptyCta").addEventListener("click", () => {
      document.querySelectorAll(".page-overlay").forEach(o => o.remove());
      document.getElementById("fileInput")?.click();
    });
    body.appendChild(empty);
    return createOverlay({ title: t("menu_history"), subtitle: t("history_subtitle"), bodyEl: body });
  }

  // Toolbar
  const toolbar = el(`
    <div class="history-toolbar">
      <input type="text" id="histSearch" placeholder="${t("history_search")}" />
      <button class="btn btn-ghost btn-sm" id="csvBtn">${ICONS.download}<span>${t("history_export")}</span></button>
    </div>
  `);
  body.appendChild(toolbar);

  const list = el(`<div class="history-list"></div>`);
  body.appendChild(list);

  function scorePillClass(s) {
    if (s == null) return "";
    if (s >= 70) return "good";
    if (s < 40) return "warn";
    return "";
  }

  function renderList(filter = "") {
    const q = filter.toLowerCase();
    const filtered = sessions.filter(s => !q || (s.file || "").toLowerCase().includes(q));
    list.innerHTML = "";
    if (!filtered.length) {
      list.innerHTML = `<div class="goal-empty">${getLang() === "en" ? "No results" : "Nessun risultato"}</div>`;
      return;
    }
    filtered.forEach(s => {
      const spark = sparkline([s.parse_quality || 0, s.score || 0, s.row_count ? Math.min(100, s.row_count) : 0].map(x => Number(x) || 0));
      const item = el(`
        <div class="history-item">
          <div class="file-icon">${ICONS.file}</div>
          <div class="file-meta">
            <div class="file-name"></div>
            <div class="file-sub">${relativeTime(s.ts)} · ${s.row_count || 0} ${getLang() === "en" ? "rows" : "righe"}</div>
          </div>
          ${spark}
          <span class="score-pill ${scorePillClass(s.score)}">${s.score != null ? s.score : "—"}</span>
          <button class="delete-btn" title="${t("history_delete")}">${ICONS.trash}</button>
        </div>
      `);
      item.querySelector(".file-name").textContent = s.file || "—";
      item.addEventListener("click", (e) => {
        if (e.target.closest(".delete-btn")) return;
        openHistoryDetail(s);
      });
      item.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(getLang() === "en" ? `Delete "${s.file}"?` : `Eliminare "${s.file}"?`)) return;
        deleteSession(s.ts);
        // Rebuild
        document.querySelectorAll(".page-overlay").forEach(o => o.remove());
        openPage("history");
      });
      list.appendChild(item);
    });
  }
  renderList();

  toolbar.querySelector("#histSearch").addEventListener("input", (e) => renderList(e.target.value));
  toolbar.querySelector("#csvBtn").addEventListener("click", () => {
    const rows = [["date", "file", "score", "parse_quality", "row_count"]];
    sessions.forEach(s => rows.push([new Date(s.ts).toISOString(), s.file || "", s.score ?? "", s.parse_quality ?? "", s.row_count ?? ""]));
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), `history-${Date.now()}.csv`);
    toast(getLang() === "en" ? "CSV exported" : "CSV esportato");
  });

  return createOverlay({ title: t("menu_history"), subtitle: t("history_subtitle"), bodyEl: body });
}

function openHistoryDetail(sess) {
  const body = el(`<div></div>`);
  const detail = el(`
    <div class="detail-block">
      <div class="detail-grid">
        <div class="detail-kv"><span class="k">${getLang() === "en" ? "File" : "File"}</span><span class="v"></span></div>
        <div class="detail-kv"><span class="k">${getLang() === "en" ? "Uploaded" : "Caricato"}</span><span class="v">${fmtDate(sess.ts)}</span></div>
        <div class="detail-kv"><span class="k">${getLang() === "en" ? "Score" : "Score"}</span><span class="v">${sess.score ?? "—"}</span></div>
        <div class="detail-kv"><span class="k">${getLang() === "en" ? "Rows" : "Righe"}</span><span class="v">${sess.row_count ?? 0}</span></div>
        <div class="detail-kv"><span class="k">${getLang() === "en" ? "Parse quality" : "Qualità parsing"}</span><span class="v">${sess.parse_quality ?? "—"}</span></div>
      </div>
    </div>
  `);
  detail.querySelector(".v").textContent = sess.file || "—";
  body.appendChild(detail);
  body.appendChild(el(`<p style="color:var(--page-dim);font-size:13px;line-height:1.6">${getLang() === "en" ? "This is a read-only summary. Full transaction detail is only available for the current session on the dashboard." : "Questo è un riepilogo di sola lettura. I dettagli delle transazioni sono visibili solo per la sessione corrente in dashboard."}</p>`));
  createOverlay({ title: sess.file || "Analisi", subtitle: relativeTime(sess.ts), bodyEl: body });
}

// ============================================================
// 4) PRIVACY PAGE
// ============================================================

function renderPrivacy() {
  const body = el(`<div></div>`);
  const en = getLang() === "en";

  // What we store
  const storeSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${en ? "Local storage" : "Storage locale"}</div>
        <h3 class="page-section-title">${t("privacy_what_we_store")}</h3>
        <div class="page-section-hint">${en ? "Everything lives in your browser's localStorage." : "Tutto risiede nel localStorage del tuo browser."}</div>
      </div>
      <div class="storage-list" id="storageList"></div>
    </div>
  `);
  body.appendChild(storeSec);

  function refreshStorage() {
    const rows = [
      { key: "bs.sessions", desc: en ? "Your past analyses" : "Le tue analisi passate" },
      { key: "bs.history", desc: en ? "Your scores & completed lessons" : "I tuoi score e lezioni completate" },
      { key: "bs.goals", desc: en ? "Your financial goals" : "I tuoi obiettivi" },
      { key: "bs.settings", desc: en ? "Your preferences" : "Le tue preferenze" },
      { key: "bs.profile", desc: en ? "Your profile info" : "Le tue info profilo" },
    ];
    const list = storeSec.querySelector("#storageList");
    list.innerHTML = "";
    rows.forEach(r => {
      const size = storageSizeKB(r.key);
      const row = el(`
        <div class="storage-row">
          <code>${r.key}</code>
          <span class="desc">${r.desc}</span>
          <span class="size">${size} KB</span>
          <button class="btn btn-ghost btn-sm">${t("privacy_clear_key")}</button>
        </div>
      `);
      row.querySelector("button").addEventListener("click", () => {
        if (!confirm(en ? `Clear ${r.key}?` : `Cancellare ${r.key}?`)) return;
        localStorage.removeItem(r.key);
        refreshStorage();
        toast(en ? "Cleared" : "Cancellato");
      });
      list.appendChild(row);
    });
  }
  refreshStorage();

  // What we DON'T do
  const noSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow" style="color:var(--page-mint)">${en ? "Privacy by design" : "Privacy by design"}</div>
        <h3 class="page-section-title">${t("privacy_what_we_dont")}</h3>
      </div>
      <div class="no-list">
        <ul>
          <li>${ICONS.check}<span>${en ? "No cloud sync" : "Nessuna sincronizzazione cloud"}</span></li>
          <li>${ICONS.check}<span>${en ? "No tracking analytics" : "Nessun tracking analytics"}</span></li>
          <li>${ICONS.check}<span>${en ? "No profiling cookies" : "Nessun cookie di profilazione"}</span></li>
          <li>${ICONS.check}<span>${en ? "No data selling" : "Nessuna vendita di dati"}</span></li>
          <li>${ICONS.check}<span>${en ? "No user accounts" : "Nessun account utente"}</span></li>
        </ul>
      </div>
    </div>
  `);
  body.appendChild(noSec);

  // What we send to Claude
  const claudeSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${en ? "Transparency" : "Trasparenza"}</div>
        <h3 class="page-section-title">${t("privacy_what_to_claude")}</h3>
      </div>
      <div class="detail-block" style="font-size:14px;color:var(--page-dim);line-height:1.6">
        ${en
          ? "During parsing we send at most a <strong>30-line preview</strong> of your file to Claude to detect its structure. No personally identifying data is stored on our side, and no request contains your name, email or full statement. All aggregation happens locally in this tab."
          : "In fase di parsing inviamo a Claude un <strong>preview di massimo 30 righe</strong> del tuo file per riconoscerne la struttura. Nessun dato identificativo viene memorizzato sui nostri sistemi, nessuna richiesta contiene il tuo nome, la tua email o l'estratto conto completo. L'aggregazione avviene tutta in locale."}
      </div>
    </div>
  `);
  body.appendChild(claudeSec);

  // GDPR rights
  const rightsSec = el(`
    <div class="page-section">
      <div class="page-section-head">
        <div class="page-section-eyebrow">${en ? "Rights" : "Diritti"}</div>
        <h3 class="page-section-title">${t("privacy_rights")}</h3>
      </div>
      <div class="rights-grid">
        <button class="btn btn-ghost" id="rAccess">${ICONS.download}<span class="rt-label">${t("privacy_access")}</span><span class="rt-desc">${en ? "Download all your data" : "Scarica tutti i tuoi dati"}</span></button>
        <button class="btn btn-ghost" id="rRect">${ICONS.edit}<span class="rt-label">${t("privacy_rectify")}</span><span class="rt-desc">${en ? "Edit in profile" : "Modifica nel profilo"}</span></button>
        <button class="btn btn-ghost" id="rDel">${ICONS.trash}<span class="rt-label">${t("privacy_erasure")}</span><span class="rt-desc">${en ? "Erase everything" : "Cancella tutto"}</span></button>
        <button class="btn btn-ghost" id="rPort">${ICONS.download}<span class="rt-label">${t("privacy_portability")}</span><span class="rt-desc">${en ? "Standard JSON export" : "Export JSON standard"}</span></button>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:12px">
        <a href="https://github.com/" target="_blank" rel="noopener" style="color:var(--page-lavender)">${en ? "Read the full privacy policy on GitHub →" : "Leggi la privacy policy completa su GitHub →"}</a>
      </div>
    </div>
  `);
  rightsSec.querySelector("#rAccess").addEventListener("click", () => {
    downloadJSON(exportAllData(), `bs-access-${Date.now()}.json`);
    toast(en ? "Exported" : "Esportato");
  });
  rightsSec.querySelector("#rRect").addEventListener("click", () => {
    document.querySelectorAll(".page-overlay").forEach(o => o.remove());
    openPage("profile");
  });
  rightsSec.querySelector("#rDel").addEventListener("click", () => {
    if (!confirm(en ? "Erase all data?" : "Cancellare tutti i dati?")) return;
    clearEverything();
    toast(en ? "Erased" : "Cancellato");
    setTimeout(() => location.reload(), 700);
  });
  rightsSec.querySelector("#rPort").addEventListener("click", () => {
    downloadJSON(exportAllData(), `bs-portability-${Date.now()}.json`);
    toast(en ? "Exported" : "Esportato");
  });
  body.appendChild(rightsSec);

  return createOverlay({ title: t("menu_privacy"), subtitle: t("privacy_subtitle"), bodyEl: body });
}

// ============================================================
// 5) LOGOUT DIALOG
// ============================================================

function renderLogout() {
  const en = getLang() === "en";
  const overlay = el(`<div class="page-overlay logout-overlay" role="dialog" aria-modal="true"><div class="logout-wrap"></div></div>`);
  const card = el(`
    <div class="logout-card">
      <div class="logout-icon">${ICONS.logout}</div>
      <h2>${t("logout_title")}</h2>
      <p>${t("logout_body")}</p>
      <label class="logout-check">
        <input type="checkbox" id="chkBackup" checked />
        <span>${t("logout_backup")}</span>
      </label>
      <div class="logout-actions">
        <button class="btn btn-ghost" id="btnCancel">${t("logout_cancel")}</button>
        <button class="btn btn-danger" id="btnLogout">${ICONS.logout}<span>${t("logout_confirm")}</span></button>
      </div>
    </div>
  `);
  overlay.querySelector(".logout-wrap").appendChild(card);

  const close = () => { overlay.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  card.querySelector("#btnCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", esc);
  card.querySelector("#btnLogout").addEventListener("click", () => {
    const backup = card.querySelector("#chkBackup").checked;
    if (backup) {
      downloadJSON(exportAllData(), `bs-backup-${Date.now()}.json`);
    }
    clearEverything();
    toast(en ? "Logged out" : "Uscita completata");
    setTimeout(() => location.reload(), 700);
  });

  document.body.appendChild(overlay);
  return { close };
}

// ---------- Downloads ----------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function downloadJSON(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
}

// ============================================================
// Public API
// ============================================================

export function openPage(name) {
  // Ensure single overlay at a time
  document.querySelectorAll(".page-overlay").forEach(o => o.remove());
  switch (name) {
    case "profile": return renderProfile();
    case "settings": return renderSettings();
    case "history": return renderHistory();
    case "privacy": return renderPrivacy();
    case "logout": return renderLogout();
    default: console.warn("openPage: unknown", name);
  }
}

// Boot: solo applySettings (il menu è ora statico nell'HTML)
function boot() {
  try { applySettings(); } catch (e) { console.warn("applySettings failed:", e); }
  // mountAvatarDropdown DISABILITATO — il menu è statico in index.html
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

// Expose for main.js monkey-patch and external triggers
try {
  window.openPage = openPage;
  window.openProfileModal = () => openPage("profile");
  window.openSettingsModal = () => openPage("settings");
  window.openPrivacyModal = () => openPage("privacy");
  window.openHistoryPage = () => openPage("history");
  window.openLogoutDialog = () => openPage("logout");
} catch {}

// Delegated global click — CAPTURE + POINTERDOWN (doppia rete)
function handleMenuClick(e) {
  const t = e.target && e.target.closest && e.target.closest("[data-page]");
  if (!t) return;
  const name = t.dataset.page;
  if (!name) return;
  e.preventDefault();
  e.stopPropagation();
  console.log("[pages] fired on", e.type, "→ openPage(" + name + ")");
  try {
    openPage(name);
    console.log("[pages] openPage OK, overlays in DOM:", document.querySelectorAll(".page-overlay").length);
  } catch (err) {
    console.error("[pages] openPage error:", err);
    alert("Errore JS su '" + name + "':\n" + (err.stack || err.message));
  }
  document.querySelectorAll(".avatar-menu.open, .dropdown.open").forEach(el => el.classList.remove("open"));
}
document.addEventListener("click", handleMenuClick, true);
document.addEventListener("pointerdown", handleMenuClick, true);
