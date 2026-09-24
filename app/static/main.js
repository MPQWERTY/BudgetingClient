import { detectLang, setLang, getLang, t } from "./lib/i18n.js";
import { readFile } from "./lib/fileReaders.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import { askAdvisor, getLessonById } from "./agents/advisor.js";
import { loadSessions, clearAll, saveLessonProgress, getLessonProgress, updateHistory } from "./agents/state.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- i18n rendering ----------
function applyI18n() {
  document.documentElement.lang = getLang();
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-attr]").forEach(el => {
    const [attr, key] = el.dataset.i18nAttr.split(",");
    el.setAttribute(attr, t(key));
  });
}

// ---------- Toast ----------
function toast(msg, icon = "✓") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="toast-icon">${icon}</span><span></span>`;
  el.querySelector("span:last-child").textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------- Pie chart ----------
const PIE_COLORS = ["#A100FF", "#F472B6", "#34D399", "#F59E0B", "#BE82FF", "#7C3AED", "#EC4899", "#10B981"];
function drawPie(canvas, entries) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
  ctx.clearRect(0, 0, w, h);
  const total = entries.reduce((s, e) => s + e.value, 0) || 1;
  let a = -Math.PI / 2;
  entries.forEach((e, i) => {
    const slice = (e.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + slice); ctx.closePath();
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length]; ctx.fill();
    a += slice;
  });
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
}

function animateNumber(el, target, duration = 900) {
  const t0 = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- State ----------
let LAST_RESULT = null;
const chatHistory = []; // [{role, content}]

// ---------- Agents ribbon ----------
const AGENTS = ["parser", "analyzer", "simulator", "advisor"];
function ribbonReset() {
  AGENTS.forEach(a => {
    const d = document.querySelector(`.agents-ribbon .dot[data-agent="${a}"]`);
    if (d) d.removeAttribute("data-state");
  });
}
function ribbonShow() {
  ribbonReset();
  $("#agentsRibbonLabel").textContent = t("analysis_in_progress");
  $("#agentsRibbon").classList.add("active");
}
function ribbonSet(agent, status) {
  const d = document.querySelector(`.agents-ribbon .dot[data-agent="${agent}"]`);
  if (!d) return;
  if (status === "running") d.setAttribute("data-state", "running");
  else if (status === "done") d.setAttribute("data-state", "done");
}
function ribbonComplete() {
  $("#agentsRibbonLabel").textContent = t("analysis_done");
  setTimeout(() => {
    const el = $("#agentsRibbon");
    el.style.transition = "opacity 0.5s";
    el.style.opacity = "0";
    setTimeout(() => {
      el.classList.remove("active");
      el.style.opacity = "";
      el.style.transition = "";
    }, 500);
  }, 1500);
}

// ---------- Dashboard ----------
// ---------- Rhythm fingerprint (per-weekday temporal signature) ----------
// Diverso dal pie: qui il tempo (giorno della settimana), non la categoria.
function renderFingerprint(transactions) {
  const svgShape = $("#fpShape"), svgOutline = $("#fpOutline"), dotsG = $("#fpDots");
  if (!svgShape) return;
  const lang = getLang();
  const dayLabels = lang === "en" ? ["S","M","T","W","T","F","S"] : ["D","L","M","M","G","V","S"];
  // aggrega spese assolute per giorno della settimana (0=Dom .. 6=Sab)
  const byDay = new Array(7).fill(0);
  const countDay = new Array(7).fill(0);
  (transactions || []).forEach(t => {
    if (!t.date || t.amount >= 0) return; // solo uscite
    const d = new Date(t.date);
    const idx = d.getDay();
    if (Number.isNaN(idx)) return;
    byDay[idx] += Math.abs(t.amount);
    countDay[idx] += 1;
  });
  const max = Math.max(...byDay, 1);
  const N = 7;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = 30 + (byDay[i] / max) * 55;
    pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, r, angle, day: i, val: byDay[i], count: countDay[i] });
  }
  // shape smoothed
  const path = pts.map((p, i) => {
    const next = pts[(i + 1) % pts.length];
    const mx = (p.x + next.x) / 2, my = (p.y + next.y) / 2;
    return i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }).join(" ") + " Z";
  svgShape.setAttribute("d", path);
  svgOutline.setAttribute("d", path);
  // dots + etichette giorno attorno
  const labelRadius = 92;
  dotsG.innerHTML = pts.map((p, i) => {
    const lx = Math.cos(p.angle) * labelRadius;
    const ly = Math.sin(p.angle) * labelRadius + 3;
    const isPeak = p.val === max && max > 0;
    return `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isPeak ? 3.2 : 1.8}" fill="${isPeak ? '#F472B6' : '#0a0022'}" opacity="${isPeak ? 1 : 0.55}"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" font-weight="${isPeak ? '700' : '500'}" fill="${isPeak ? '#A100FF' : '#6b7280'}">${dayLabels[i]}</text>
    `;
  }).join("");
  // aggiorna caption con insight rapido
  const cap = $(".fp-caption");
  if (cap) {
    const peakIdx = byDay.indexOf(max);
    const peakName = lang === "en"
      ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][peakIdx]
      : ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"][peakIdx];
    cap.innerHTML = max > 0
      ? (lang === "en"
          ? `Peak spending day: <b>${peakName}</b> · €${max.toFixed(0)}`
          : `Il tuo picco di spesa: <b>${peakName}</b> · €${max.toFixed(0)}`)
      : (lang === "en" ? "Not enough data yet" : "Dati insufficienti");
  }
}

// ---------- Life equivalents ----------
const EQUIV_UNITS = {
  it: [
    { label: "caffè al bar", unit: 1.5, ico: "☕" },
    { label: "pranzi al ristorante", unit: 15, ico: "🍝" },
    { label: "abbonamenti Netflix mensili", unit: 12.99, ico: "🎬" },
    { label: "pieni di benzina (50L)", unit: 90, ico: "⛽" },
    { label: "voli low-cost Milano→Barcellona", unit: 80, ico: "✈️" },
    { label: "libri Feltrinelli", unit: 18, ico: "📚" },
    { label: "cene romantiche a due", unit: 60, ico: "🍷" },
    { label: "corsi online (Udemy)", unit: 15, ico: "🎓" },
    { label: "abbonamenti palestra mensili", unit: 40, ico: "💪" },
    { label: "vacanze weekend (2 notti)", unit: 250, ico: "🏝️" },
  ],
  en: [
    { label: "cups of coffee", unit: 1.5, ico: "☕" },
    { label: "restaurant lunches", unit: 15, ico: "🍝" },
    { label: "Netflix months", unit: 12.99, ico: "🎬" },
    { label: "gas tank fills (50L)", unit: 90, ico: "⛽" },
    { label: "low-cost flights (short-haul)", unit: 80, ico: "✈️" },
    { label: "hardcover books", unit: 18, ico: "📚" },
    { label: "romantic dinners for two", unit: 60, ico: "🍷" },
    { label: "online courses (Udemy)", unit: 15, ico: "🎓" },
    { label: "gym months", unit: 40, ico: "💪" },
    { label: "weekend getaways (2 nights)", unit: 250, ico: "🏝️" },
  ],
};

// ---------- Before / After ----------
// Genera 5 righe "cripitche" ricostruite dalle transazioni reali, per contrasto con la narrativa.
function renderBeforeAfter(transactions) {
  const box = $("#baBefore");
  if (!box || !transactions?.length) return;
  const sample = transactions.slice(0, 5);
  const cryptify = (t) => {
    const d = t.date ? t.date.split("-").reverse().join("/") : "??/??/????";
    const desc = String(t.description || "").toUpperCase()
      .replace(/BONIFICO/g, "DISP.BONIFICO")
      .replace(/STIPENDIO/g, "ACC.STIPENDIO ACCENTURE SPA REF.98771")
      .replace(/MUTUO/g, "DISP.PERIODICA MUTUO PRIMA CASA")
      .replace(/ENEL/g, "ADD.SDD ENEL ENERGIA MANDATO IT98K7823...")
      .replace(/TIM|VODAFONE|WIND|ILIAD/g, "ADD.DIR.RID $& CID.IT1234ABCDE...")
      .replace(/NETFLIX|SPOTIFY|DISNEY|AMAZON PRIME/g, "ADD.SDD $& INTL BV")
      .replace(/AMAZON/g, "PAG.POS $& EU SARL LUX")
      .replace(/(ESSELUNGA|CARREFOUR|COOP|CONAD|LIDL)/g, "PAG.POS $1 SUPERSTORE")
      .replace(/RISTORANTE|BAR|PIZZ/g, "PAG.POS $&")
      .replace(/Q8|ENI|ESSO|AGIP/g, "PAG.POS $& STAZIONE SERVIZIO")
      .replace(/ATM|GTT|TRENITALIA|ITALO/g, "PAG.POS $& APP MOBILE")
      .replace(/FARMACIA/g, "PAG.POS $& COMUNALE")
      .slice(0, 45);
    const amt = t.amount >= 0
      ? `+${t.amount.toFixed(2).replace(".", ",")}`
      : `-${Math.abs(t.amount).toFixed(2).replace(".", ",")}`;
    return `${d}  ${desc.padEnd(45, " ")}  ${amt} EUR`;
  };
  box.innerHTML = sample.map((t, i) => `<div class="ba-line${i > 2 ? " dim" : ""}">${cryptify(t)}</div>`).join("");
}

function renderLifeEquivalents(entries) {
  const box = $("#lifeEquiv");
  if (!box || !entries.length) return;
  const lang = getLang();
  const bank = EQUIV_UNITS[lang] || EQUIV_UNITS.it;
  // prendi top 3 spese e traducile in unità di vita diverse
  const top = entries.slice(0, 3);
  const shuffled = bank.slice().sort(() => Math.random() - 0.5);
  const rows = top.map((cat, i) => {
    const unit = shuffled[i % shuffled.length];
    const count = Math.round(cat.value / unit.unit);
    if (count < 1) return null;
    const catLabel = cat.label;
    const template = lang === "en"
      ? `<b>€${cat.value.toFixed(0)}</b> in ${catLabel} = <b>${count}</b> ${unit.label}`
      : `<b>€${cat.value.toFixed(0)}</b> in ${catLabel} = <b>${count}</b> ${unit.label}`;
    return `<div class="row"><span class="ico">${unit.ico}</span><span>${template}</span></div>`;
  }).filter(Boolean).join("");
  box.innerHTML = rows || `<div class="row"><span class="ico">✨</span><span>${lang === "en" ? "Upload more data to see equivalents." : "Carica più dati per vedere gli equivalenti."}</span></div>`;
}

function renderDashboard(res) {
  LAST_RESULT = res;
  $("#dashboard").style.display = "";
  const how = $("#howItWorks");
  if (how) how.style.display = "none";
  const adv = res.advice;
  if (adv) {
    animateNumber($("#scoreValue"), adv.score);
    // Animate SVG ring: circumference = 2*PI*50 ≈ 314
    const ring = $("#scoreRingFg");
    if (ring) {
      const C = 314;
      const pct = Math.max(0, Math.min(100, adv.score || 0)) / 100;
      // reset to full offset then, next frame, transition to target
      ring.style.strokeDashoffset = C;
      requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(C * (1 - pct));
      });
    }
    $("#scoreInterp").textContent = adv.interpretation || "";
    $("#scoreBreakdown").innerHTML = Object.entries(adv.score_breakdown || {}).map(([k, v]) => `
      <div class="breakdown-row">
        <span class="label">${k.replace(/_/g, " ")}</span>
        <span class="bar"><div style="width:${v}%"></div></span>
        <span class="val">${v}</span>
      </div>`).join("");
  }
  const cats = res.analysis?.categories || {};
  const entries = Object.entries(cats)
    .filter(([k]) => k !== "income")
    .map(([k, v]) => ({ label: k, value: Math.abs(v.total) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value);
  drawPie($("#pieCanvas"), entries);
  $("#pieLegend").innerHTML = entries.map((e, i) => `
    <div class="legend-row">
      <span class="legend-swatch" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span>${e.label}</span>
      <span class="legend-amount">€${e.value.toFixed(0)}</span>
    </div>`).join("");
  renderFingerprint(res.parse?.transactions || []);
  renderLifeEquivalents(entries);
  $("#storyText").textContent = res.analysis?.narrative || "";
  renderBeforeAfter(res.parse?.transactions || []);
  $("#scenariosList").innerHTML = (res.simulation?.scenarios || []).map(s => `
    <div class="scenario">
      <h4>${s.title}</h4>
      <div>${s.narrative || ""}</div>
      <div class="proj">3m: €${s.projections?.["3m"] || 0} · 6m: €${s.projections?.["6m"] || 0} · 12m: €${s.projections?.["12m"] || 0}</div>
    </div>`).join("");
  $("#lessonsList").innerHTML = (adv?.mini_lessons || []).map((l, i) => `
    <div class="lesson-card">
      <h4>${l.title}</h4>
      <div class="meta">${l.difficulty || ""} · ${l.duration_min || 0} min</div>
      <button class="btn" data-lesson-idx="${i}">Apri lezione</button>
    </div>`).join("");
  $$("#lessonsList button[data-lesson-idx]").forEach(b => b.onclick = () => openLesson(adv.mini_lessons[+b.dataset.lessonIdx]));
  renderHistory();
}
function renderHistory() {
  const sess = loadSessions();
  $("#historyTable tbody").innerHTML = sess.slice(0, 10).map(s => `
    <tr>
      <td>${new Date(s.ts).toLocaleDateString()}</td>
      <td>${s.file}</td>
      <td>${s.score ?? "—"}</td>
      <td>${s.row_count}</td>
    </tr>`).join("");
}

// ---------- Generic modal helper ----------
function openModal(builder) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<button class="close" aria-label="close">✕</button>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  modal.querySelector(".close").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
  builder(modal, close);
  return { overlay, modal, close };
}

function lessonThumbSvg() {
  return `<svg viewBox="0 0 60 46" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="8" width="48" height="30" rx="4" stroke="#A100FF" stroke-width="1.5"/>
    <path d="M14 26 L24 18 L34 24 L46 14" stroke="#F472B6" stroke-width="1.5" fill="none"/>
    <circle cx="46" cy="14" r="2.5" fill="#F472B6"/>
  </svg>`;
}

// ---------- Lesson wizard ----------
// Normalizza qualsiasi lezione (nuovo formato o vecchio) in una struttura wizard.
function normalizeLesson(lesson) {
  if (!lesson) return null;
  const chapters = Array.isArray(lesson.chapters) && lesson.chapters.length
    ? lesson.chapters
    : (Array.isArray(lesson.quiz) ? lesson.quiz.map((q, i) => ({
        teach: (lesson.steps && lesson.steps[i]) || "",
        quiz: q,
      })) : []);
  // se ci sono steps ma non chapters/quiz, crea capitoli senza quiz (rari)
  if (!chapters.length && Array.isArray(lesson.steps) && lesson.steps.length) {
    lesson.steps.forEach(s => chapters.push({ teach: s, quiz: null }));
  }
  const personalization = Array.isArray(lesson.personalization) ? lesson.personalization : [];
  return {
    id: lesson.id || `lesson-${Math.random().toString(36).slice(2, 8)}`,
    title: lesson.title || "",
    difficulty: lesson.difficulty || "",
    duration_min: lesson.duration_min || 0,
    hook: lesson.hook || "",
    thumb_emoji: lesson.thumb_emoji || "✨",
    personalization,
    chapters,
    action_plan: typeof lesson.action_plan === "function" ? lesson.action_plan
      : (Array.isArray(lesson.action_plan) ? () => lesson.action_plan : null),
    wrap_up: typeof lesson.wrap_up === "function" ? lesson.wrap_up
      : (typeof lesson.wrap_up === "string" ? () => lesson.wrap_up : null),
  };
}

function openLessonWizard(rawLesson) {
  const lesson = normalizeLesson(rawLesson);
  if (!lesson) return;

  // Struttura step: 0 intro, 1..N personalizzazione, poi 1 per capitolo, poi wrap
  const steps = [{ kind: "intro" }];
  lesson.personalization.forEach((p, i) => steps.push({ kind: "perso", idx: i }));
  lesson.chapters.forEach((c, i) => steps.push({ kind: "chapter", idx: i }));
  steps.push({ kind: "wrap" });

  // stato wizard
  const state = {
    currentStep: 0,
    answers: {},           // { chapterIdx: chosenOption }
    personalization: {},   // { key: value }
  };
  // riprendi progresso salvato (personalization)
  const prev = getLessonProgress(lesson.id);
  if (prev?.personalization) state.personalization = { ...prev.personalization };

  openModal((modal, close) => {
    modal.classList.add("lesson-wizard");
    modal.insertAdjacentHTML("beforeend", `
      <div class="wizard-progress" aria-hidden="true">
        <div class="wizard-progress-bar"><div class="wizard-progress-fill"></div></div>
        <div class="wizard-progress-label"></div>
      </div>
      <div class="wizard-body"></div>
      <div class="wizard-nav">
        <button class="btn ghost wz-back" type="button">${t("lesson_back")}</button>
        <button class="btn wz-next" type="button">${t("lesson_next")}</button>
      </div>
    `);
    const bodyEl = modal.querySelector(".wizard-body");
    const fillEl = modal.querySelector(".wizard-progress-fill");
    const labelEl = modal.querySelector(".wizard-progress-label");
    const backBtn = modal.querySelector(".wz-back");
    const nextBtn = modal.querySelector(".wz-next");

    function progressLabel(step) {
      if (step.kind === "intro") return t("lesson_progress_intro");
      if (step.kind === "perso") return t("lesson_progress_about_you");
      if (step.kind === "chapter") return t("lesson_progress_learn");
      return t("lesson_progress_wrap");
    }

    function render() {
      const step = steps[state.currentStep];
      const pct = ((state.currentStep) / (steps.length - 1)) * 100;
      fillEl.style.width = `${pct}%`;
      labelEl.textContent = `${progressLabel(step)} · ${state.currentStep + 1} ${t("lesson_step_of")} ${steps.length}`;

      // fade
      bodyEl.classList.remove("wz-fade-in");
      // rimuovi contenuto e ricostruisci
      bodyEl.innerHTML = "";
      if (step.kind === "intro") renderIntro();
      else if (step.kind === "perso") renderPerso(step.idx);
      else if (step.kind === "chapter") renderChapter(step.idx);
      else renderWrap();

      // nav visibility
      backBtn.style.visibility = state.currentStep === 0 ? "hidden" : "visible";
      updateNextBtn();
      // forza reflow poi aggiungi classe fade
      void bodyEl.offsetWidth;
      bodyEl.classList.add("wz-fade-in");
    }

    function updateNextBtn() {
      const step = steps[state.currentStep];
      if (step.kind === "intro") {
        nextBtn.textContent = t("lesson_start");
        nextBtn.disabled = false;
        return;
      }
      if (step.kind === "perso") {
        const p = lesson.personalization[step.idx];
        nextBtn.textContent = t("lesson_next");
        nextBtn.disabled = !state.personalization[p.key];
        return;
      }
      if (step.kind === "chapter") {
        const q = lesson.chapters[step.idx]?.quiz;
        // se non c'è quiz, next abilitato
        if (!q) { nextBtn.textContent = t("lesson_next"); nextBtn.disabled = false; return; }
        const answered = state.answers[step.idx] !== undefined;
        nextBtn.textContent = t("lesson_next");
        nextBtn.disabled = !answered;
        return;
      }
      // wrap
      nextBtn.textContent = t("lesson_finish");
      nextBtn.disabled = false;
    }

    function renderIntro() {
      bodyEl.innerHTML = `
        <div class="wz-hero">
          <div class="wz-emoji">${lesson.thumb_emoji}</div>
          <div class="wz-meta">${lesson.difficulty || ""} · ${lesson.duration_min || 0} min</div>
          <h2 class="wz-title">${escapeHtml(lesson.title)}</h2>
          <div class="wz-hook-label">${t("lesson_intro_why")}</div>
          <p class="wz-hook">${escapeHtml(lesson.hook || "")}</p>
        </div>
      `;
    }

    function renderPerso(idx) {
      const p = lesson.personalization[idx];
      const current = state.personalization[p.key];
      bodyEl.innerHTML = `
        <h3 class="wz-q">${escapeHtml(p.q)}</h3>
        <div class="wz-perso-options"></div>
      `;
      const optsEl = bodyEl.querySelector(".wz-perso-options");
      p.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wz-perso-opt" + (current === opt ? " selected" : "");
        btn.textContent = opt;
        btn.onclick = () => {
          state.personalization[p.key] = opt;
          saveLessonProgress(lesson.id, { personalization: state.personalization });
          Array.from(optsEl.children).forEach(c => c.classList.remove("selected"));
          btn.classList.add("selected");
          updateNextBtn();
        };
        optsEl.appendChild(btn);
      });
    }

    function renderChapter(idx) {
      const ch = lesson.chapters[idx];
      const q = ch.quiz;
      const chosen = state.answers[idx];
      bodyEl.innerHTML = `
        <div class="wz-teach">${escapeHtml(ch.teach || "")}</div>
        ${q ? `
          <div class="wz-quiz">
            <div class="wz-quiz-q">${escapeHtml(q.q)}</div>
            <div class="wz-quiz-opts"></div>
            <div class="wz-feedback" style="display:none;"></div>
          </div>` : ""}
      `;
      if (!q) return;
      const optsEl = bodyEl.querySelector(".wz-quiz-opts");
      const fbEl = bodyEl.querySelector(".wz-feedback");
      q.a.forEach((opt, ai) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wz-quiz-opt";
        btn.textContent = opt;
        btn.onclick = () => selectAnswer(ai);
        optsEl.appendChild(btn);
      });

      function selectAnswer(ai) {
        state.answers[idx] = ai;
        const correct = q.correct;
        const isRight = ai === correct;
        Array.from(optsEl.children).forEach((b, i) => {
          b.classList.remove("correct", "wrong");
          b.disabled = true;
          if (i === correct) b.classList.add("correct");
          else if (i === ai) b.classList.add("wrong");
        });
        fbEl.style.display = "";
        fbEl.className = "wz-feedback " + (isRight ? "ok" : "err");
        const head = isRight
          ? `<b>✓ ${t("lesson_correct")}</b> — `
          : `<b>${t("lesson_wrong")}.</b> ${getLang() === "en" ? "The correct answer is" : "La risposta corretta è"}: <b>${escapeHtml(q.a[correct])}</b>. `;
        fbEl.innerHTML = head + escapeHtml(q.explanation || "");
        updateNextBtn();
      }

      // se già risposto in questa sessione (utente torna indietro), ripristina lo stato
      if (chosen !== undefined) selectAnswer(chosen);
    }

    function renderWrap() {
      // score sui capitoli con quiz
      const withQuiz = lesson.chapters.filter(c => c.quiz);
      const total = withQuiz.length;
      let ok = 0;
      lesson.chapters.forEach((ch, i) => {
        if (ch.quiz && state.answers[i] === ch.quiz.correct) ok++;
      });
      const scoreText = total
        ? `${t("lesson_score_prefix")} <b>${ok}/${total}</b> ${t("lesson_score_of")}`
        : "";

      const wrapText = lesson.wrap_up ? (lesson.wrap_up(state.personalization) || "") : "";
      const actions = lesson.action_plan ? (lesson.action_plan(state.personalization) || []) : [];

      bodyEl.innerHTML = `
        <div class="wz-wrap-hero">
          <div class="wz-wrap-badge">✓</div>
          <h2 class="wz-wrap-title">${t("lesson_well_done")}</h2>
          ${total ? `<div class="wz-score">${scoreText}</div>` : ""}
        </div>
        ${wrapText ? `
          <div class="wz-plan-card">
            <div class="wz-plan-label">${t("lesson_your_plan")}</div>
            <p class="wz-plan-text">${escapeHtml(wrapText)}</p>
          </div>` : ""}
        ${actions.length ? `
          <div class="wz-actions">
            <div class="wz-actions-label">${t("lesson_actions_title")}</div>
            <ul class="wz-checklist"></ul>
          </div>` : ""}
      `;
      const ul = bodyEl.querySelector(".wz-checklist");
      if (ul) actions.forEach(a => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="wz-check">□</span><span></span>`;
        li.querySelector("span:last-child").textContent = a;
        li.onclick = () => {
          li.classList.toggle("done");
          li.querySelector(".wz-check").textContent = li.classList.contains("done") ? "✓" : "□";
        };
        ul.appendChild(li);
      });
    }

    // nav handlers
    backBtn.onclick = () => {
      if (state.currentStep > 0) { state.currentStep--; render(); }
    };
    nextBtn.onclick = () => {
      const step = steps[state.currentStep];
      // salva a ogni passo
      saveLessonProgress(lesson.id, {
        personalization: state.personalization,
        answers: state.answers,
        last_step: state.currentStep,
      });
      if (step.kind === "wrap") {
        // completa lezione
        const withQuiz = lesson.chapters.filter(c => c.quiz);
        let ok = 0;
        lesson.chapters.forEach((ch, i) => { if (ch.quiz && state.answers[i] === ch.quiz.correct) ok++; });
        saveLessonProgress(lesson.id, { completed_at: Date.now(), score: `${ok}/${withQuiz.length}` });
        // aggiorna history globale
        try { updateHistory({ score: null, completedLesson: lesson.id }); } catch {}
        close();
        toast(t("lesson_completed_toast"), "🎉");
        return;
      }
      if (state.currentStep < steps.length - 1) {
        state.currentStep++;
        render();
      }
    };

    render();
  });
}

// escape helper (per evitare XSS su testi di lezione)
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// backward-compat alias — mantiene i vecchi call site funzionanti
function openLesson(lesson) { return openLessonWizard(lesson); }

function openProfileModal() {
  openModal((modal, close) => {
    modal.insertAdjacentHTML("beforeend", `
      <div class="modal-thumb" style="background:linear-gradient(135deg,#EDE9FE,#FCE7F3);"></div>
      <div class="modal-body">
        <div class="profile-avatar">O</div>
        <div class="profile-info">
          <div class="p-name">${t("profile_name")}</div>
          <div class="p-email">${t("profile_email")}</div>
          <div class="profile-badge">${t("profile_badge")}</div>
        </div>
        <p class="profile-desc">${t("profile_desc")}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-close>${t("close")}</button>
        </div>
      </div>`);
    modal.querySelector("[data-close]").onclick = close;
  });
}

function openSettingsModal() {
  openModal((modal, close) => {
    modal.insertAdjacentHTML("beforeend", `
      <div class="modal-thumb" style="background:linear-gradient(135deg,#D1FAE5,#EDE9FE);"></div>
      <div class="modal-body">
        <h2>${t("menu_settings")}</h2>
        <div class="meta">${t("settings_sub")}</div>
        <div class="settings-list">
          <div class="settings-row">
            <div><div class="s-label">${t("settings_notif")}</div><div class="s-hint">${t("settings_notif_hint")}</div></div>
            <label class="switch"><input type="checkbox" id="setNotif"><span class="slider"></span></label>
          </div>
          <div class="settings-row">
            <div><div class="s-label">${t("settings_dark")}</div><div class="s-hint">${t("settings_soon")}</div></div>
            <label class="switch"><input type="checkbox" disabled><span class="slider"></span></label>
          </div>
          <div class="settings-row">
            <div class="s-label">${t("settings_lang")}</div>
            <select id="setLang">
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="settings-row">
            <div class="s-label">${t("settings_currency")}</div>
            <select id="setCurrency">
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
          <div class="settings-row">
            <div><div class="s-label">${t("settings_analytics")}</div><div class="s-hint">${t("settings_analytics_hint")}</div></div>
            <label class="switch"><input type="checkbox" id="setAnalytics"><span class="slider"></span></label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" data-close>${t("close")}</button>
          <button class="btn" data-save>${t("save")}</button>
        </div>
      </div>`);
    modal.querySelector("#setLang").value = getLang();
    modal.querySelector("[data-close]").onclick = close;
    modal.querySelector("[data-save]").onclick = () => {
      const l = modal.querySelector("#setLang").value;
      if (l !== getLang()) {
        setLang(l);
        $("#langSelect").value = l;
        applyI18n();
      }
      toast(t("settings_saved"), "✓");
      close();
    };
  });
}

// ---------- Info modal helper (footer links, etc.) ----------
function openInfoModal(title, htmlBody) {
  openModal((modal, close) => {
    modal.insertAdjacentHTML("beforeend", `
      <div class="modal-thumb" style="background:linear-gradient(135deg,#EDE9FE,#FCE7F3);"></div>
      <div class="modal-body">
        <h2></h2>
        <div class="info-body"></div>
        <div class="modal-actions">
          <button class="btn" data-close></button>
        </div>
      </div>`);
    modal.querySelector("h2").textContent = title;
    modal.querySelector(".info-body").innerHTML = htmlBody;
    const btn = modal.querySelector("[data-close]");
    btn.textContent = t("close");
    btn.onclick = close;
  });
}

// Content dictionary for footer info links (localized).
// Each key returns { title, body } for current lang.
const FOOTER_INFO = {
  security: {
    it: { title: "Sicurezza", body: "<p>Budget Storyteller è pensato con la privacy al primo posto. Tutti i tuoi dati bancari restano nel tuo browser, salvati in <b>localStorage</b>: non finiscono mai in cloud, non transitano su nostri server. Le chiavi API di Claude vivono solo lato server, mai esposte al client. L'estratto conto viene inviato in preview minimo (max ~30 righe) al modello AI per il parsing, poi tutto il resto dell'analisi avviene in locale. Puoi cancellare tutto con un click dal menu utente.</p>" },
    en: { title: "Security", body: "<p>Budget Storyteller is built privacy-first. All your banking data stays in your browser, kept in <b>localStorage</b>: it never touches our cloud, never transits our servers. Claude API keys live server-side only, never exposed to the client. A minimal preview of your statement (max ~30 rows) is sent to the AI for parsing, then the rest of the analysis happens locally. You can wipe everything with one click from the user menu.</p>" },
  },
  pricing: {
    it: { title: "Prezzi", body: "<p><b>Gratis in demo.</b> Questa versione è un prototipo hackathon: nessun account, nessun pagamento, nessun limite.</p><p>Se il progetto evolvesse in prodotto reale, il piano prospettato è <b>freemium</b>: analisi base sempre gratuita, mini-lezioni premium e scenari avanzati a <b>4,90€/mese</b>. Nessun addebito automatico, nessuna carta richiesta per iniziare.</p>" },
    en: { title: "Pricing", body: "<p><b>Free in demo.</b> This is a hackathon prototype: no account, no payment, no limits.</p><p>If the project ever ships as a real product, the plan would be <b>freemium</b>: basic analysis always free, premium mini-lessons and advanced scenarios at <b>€4.90/month</b>. No auto-billing, no card required to start.</p>" },
  },
  roadmap: {
    it: { title: "Roadmap", body: "<p>Cosa immaginiamo dopo l'hackathon, in ordine di priorità:</p><ul><li><b>Previsioni</b> — proiezioni di cassa a 3/6/12 mesi in base ai pattern reali.</li><li><b>PSD2 / Open Banking</b> — connessione diretta e sicura al tuo conto (con revoca in un click).</li><li><b>Gamification</b> — obiettivi settimanali, badge, streak di risparmio.</li><li><b>Export PDF</b> — report scaricabile e condivisibile.</li><li><b>App mobile</b> — versione PWA installabile.</li></ul>" },
    en: { title: "Roadmap", body: "<p>What we imagine after the hackathon, by priority:</p><ul><li><b>Forecasts</b> — 3/6/12-month cash projections from real patterns.</li><li><b>PSD2 / Open Banking</b> — direct, secure connection to your account (one-click revoke).</li><li><b>Gamification</b> — weekly goals, badges, savings streaks.</li><li><b>PDF export</b> — downloadable, shareable report.</li><li><b>Mobile app</b> — installable PWA version.</li></ul>" },
  },
  glossary: {
    it: { title: "Glossario", body: "<ul><li><b>TAEG</b> — costo totale annuo di un finanziamento, include interessi e spese.</li><li><b>TAN</b> — tasso di interesse nominale, senza spese accessorie.</li><li><b>Spread</b> — margine che la banca aggiunge sopra l'indice di riferimento (es. Euribor).</li><li><b>Rateo</b> — quota di interessi maturata ma non ancora pagata.</li><li><b>Insoluto</b> — rata non pagata alla scadenza.</li><li><b>Fondo di emergenza</b> — riserva liquida per imprevisti, tipicamente 3–6 mesi di spese.</li></ul>" },
    en: { title: "Glossary", body: "<ul><li><b>APR</b> — annual percentage rate: total yearly cost of a loan, including fees.</li><li><b>Interest rate</b> — nominal rate, excluding fees.</li><li><b>Spread</b> — margin the bank adds on top of the reference index (e.g. Euribor).</li><li><b>Accrued interest</b> — interest earned but not yet paid.</li><li><b>Missed payment</b> — installment not paid by its due date.</li><li><b>Emergency fund</b> — liquid reserve for the unexpected, typically 3–6 months of expenses.</li></ul>" },
  },
  blog: {
    it: { title: "Blog", body: "<p>Il blog sarà lanciato con la beta. L'idea è raccontare storie reali di educazione finanziaria — non consigli su cosa comprare, ma piccoli casi concreti su come le persone hanno riletto le loro spese.</p><p>Nel frattempo, segui gli aggiornamenti sul repository GitHub del progetto.</p>" },
    en: { title: "Blog", body: "<p>The blog will launch with the beta. The idea: real stories of financial education — not advice on what to buy, but small concrete cases of how people re-read their spending.</p><p>In the meantime, follow updates on the project's GitHub repository.</p>" },
  },
  faq: {
    it: { title: "FAQ", body: "<p><b>Che dati mi servono?</b><br>Un estratto conto in CSV, PDF o Excel. Nessun accesso alla tua banca, nessun login.</p><p><b>Posso usarlo per la famiglia?</b><br>Sì: carica più estratti separatamente. Ogni analisi resta indipendente e locale.</p><p><b>Funziona con la mia banca?</b><br>Il parser gestisce i formati più comuni di banche italiane. Se qualcosa non torna, un banner ti chiede conferma.</p><p><b>È consulenza finanziaria?</b><br>No. È solo contenuto educativo per capire meglio i tuoi numeri. Non ti diciamo mai cosa comprare o vendere.</p>" },
    en: { title: "FAQ", body: "<p><b>What data do I need?</b><br>A bank statement in CSV, PDF or Excel. No bank access, no login.</p><p><b>Can I use it for my family?</b><br>Yes: upload multiple statements separately. Each analysis stays independent and local.</p><p><b>Does it work with my bank?</b><br>The parser handles most common formats. If something looks off, a banner asks you to confirm.</p><p><b>Is this financial advice?</b><br>No. It's educational content to help you understand your numbers. We never tell you what to buy or sell.</p>" },
  },
  courses: {
    it: { title: "Mini-corsi", body: "<p>Percorsi brevi, pensati per essere completati in una pausa caffè:</p><ul><li><b>Fondamenti di finanza personale</b> — 20 min</li><li><b>Come costruire un fondo di emergenza</b> — 15 min</li><li><b>Interessi composti spiegati semplice</b> — 12 min</li><li><b>Debito buono vs debito cattivo</b> — 18 min</li></ul><p>Disponibili nella beta. Iscriviti alle novità sul repository GitHub.</p>" },
    en: { title: "Mini-courses", body: "<p>Short paths, designed to fit a coffee break:</p><ul><li><b>Personal finance foundations</b> — 20 min</li><li><b>How to build an emergency fund</b> — 15 min</li><li><b>Compound interest, simply explained</b> — 12 min</li><li><b>Good debt vs bad debt</b> — 18 min</li></ul><p>Available in the beta. Follow updates on the GitHub repository.</p>" },
  },
  privacyPolicy: {
    it: { title: "Privacy Policy", body: "<p>Budget Storyteller non raccoglie dati personali identificativi. Non usiamo cookie di tracciamento, non facciamo profilazione, non condividiamo dati con terze parti.</p><p>Gli unici dati che elaboriamo transitano temporaneamente per il modello AI (Claude di Anthropic) sotto forma di preview del tuo estratto conto (massimo ~30 righe), esclusivamente per il parsing. Nessun log persistente lato server, nessuna copia trattenuta.</p><p>Tutto il resto — analisi, storico, preferenze — vive solo nel tuo browser (localStorage). Cancellare i dati richiede un click dal menu utente.</p>" },
    en: { title: "Privacy Policy", body: "<p>Budget Storyteller does not collect personally identifying data. We use no tracking cookies, no profiling, no third-party sharing.</p><p>The only data we process transits temporarily through the AI model (Anthropic's Claude) as a preview of your statement (max ~30 rows), strictly for parsing. No persistent server logs, no retained copies.</p><p>Everything else — analysis, history, preferences — lives only in your browser (localStorage). Deleting your data is one click from the user menu.</p>" },
  },
  terms: {
    it: { title: "Termini di Servizio", body: "<p>Usando Budget Storyteller accetti che il servizio sia fornito \"così com'è\", senza garanzie sull'accuratezza dei risultati generati dall'AI. Il contenuto è puramente educativo: non costituisce consulenza finanziaria, fiscale, legale o d'investimento.</p><p>Non siamo un istituto finanziario né un intermediario. Non deteniamo, non movimentiamo, non gestiamo denaro. Il servizio è pensato per uso personale non commerciale; il codice sorgente è aperto su GitHub sotto licenza open source.</p><p>In caso di controversia, si applica la legge italiana.</p>" },
    en: { title: "Terms of Service", body: "<p>By using Budget Storyteller you accept that the service is provided \"as is\", without warranties on the accuracy of AI-generated results. Content is purely educational: it does not constitute financial, tax, legal or investment advice.</p><p>We are not a financial institution nor an intermediary. We do not hold, move or manage money. The service is intended for personal non-commercial use; source code is open on GitHub under an open-source license.</p><p>Any dispute is governed by Italian law.</p>" },
  },
  cookie: {
    it: { title: "Cookie", body: "<p>Budget Storyteller <b>non usa cookie di tracciamento</b>, né di profilazione, né di analytics di terze parti. Non c'è Google Analytics, non c'è pixel Facebook, non c'è nessun script esterno che ti segue.</p><p>Usiamo solo <b>localStorage</b> — che tecnicamente non è un cookie — per ricordare le tue preferenze di lingua e conservare i risultati delle tue analisi. Tutto resta sul tuo dispositivo e puoi cancellarlo in ogni momento dal menu utente.</p>" },
    en: { title: "Cookies", body: "<p>Budget Storyteller <b>does not use tracking cookies</b>, profiling cookies, or third-party analytics. There is no Google Analytics, no Facebook pixel, no external script following you.</p><p>We only use <b>localStorage</b> — which technically isn't a cookie — to remember your language preference and store your analyses. Everything stays on your device and you can wipe it any time from the user menu.</p>" },
  },
  aiDisclaimer: {
    it: { title: "Disclaimer AI", body: "<p>Budget Storyteller usa modelli di linguaggio (Claude di Anthropic) per generare narrative, spiegazioni e mini-lezioni personalizzate. L'AI può <b>sbagliare</b>: numeri approssimati, categorizzazioni imperfette, spiegazioni semplificate.</p><p>Verifica sempre le informazioni importanti prima di prendere decisioni finanziarie. L'output dell'AI è pensato come punto di partenza per riflettere, non come verità assoluta. In modalità demo il contenuto è pre-generato e serve solo a mostrare come funzionerebbe il sistema in produzione.</p>" },
    en: { title: "AI Disclaimer", body: "<p>Budget Storyteller uses language models (Anthropic's Claude) to generate narratives, explanations and personalized mini-lessons. AI <b>can be wrong</b>: approximate numbers, imperfect categorization, oversimplified explanations.</p><p>Always verify important information before making financial decisions. AI output is meant as a starting point for reflection, not absolute truth. In demo mode content is pre-generated and only shows how the system would work in production.</p>" },
  },
  gdpr: {
    it: { title: "GDPR", body: "<p>Nel rispetto del Regolamento (UE) 2016/679 (GDPR), Budget Storyteller minimizza per design la raccolta dati. Non trattiamo dati personali identificativi né dati di categorie particolari.</p><p>Diritti dell'utente: accesso, rettifica, cancellazione, portabilità. Poiché tutti i tuoi dati risiedono nel tuo browser, puoi esercitarli direttamente cancellandoli dal menu utente (Esci → \"Cancella tutti i dati locali\").</p><p>Per richieste specifiche sui dati che transitano per il modello AI, contattaci aprendo una issue sul repository GitHub.</p>" },
    en: { title: "GDPR", body: "<p>In compliance with Regulation (EU) 2016/679 (GDPR), Budget Storyteller minimizes data collection by design. We do not process personally identifying data nor special-category data.</p><p>User rights: access, rectification, erasure, portability. Since all your data resides in your browser, you can exercise them directly by wiping the storage from the user menu (Sign out → \"Delete all local data\").</p><p>For specific requests about data transiting through the AI model, contact us by opening an issue on the GitHub repository.</p>" },
  },
  about: {
    it: { title: "Chi siamo", body: "<p>Siamo un team di due persone all'<b>Accenture Hagenthon 2026</b>. Budget Storyteller è nato in 48 ore come prototipo per rispondere a una domanda semplice: <em>perché tante persone non capiscono il proprio estratto conto?</em></p><p>Questo non è un prodotto commerciale: è un esperimento di educazione finanziaria personalizzata via AI. Codice aperto, dati locali, zero pretese. Se ti piace, forkalo. Se hai idee, apri una issue.</p>" },
    en: { title: "About", body: "<p>We're a two-person team at <b>Accenture Hagenthon 2026</b>. Budget Storyteller was built in 48 hours as a prototype to answer a simple question: <em>why do so many people not understand their own bank statement?</em></p><p>This is not a commercial product: it's an experiment in AI-powered personalized financial education. Open code, local data, zero pretense. If you like it, fork it. If you have ideas, open an issue.</p>" },
  },
  careers: {
    it: { title: "Careers", body: "<p>Non stiamo assumendo: siamo un prototipo hackathon, non un'azienda. Se il progetto dovesse evolvere in qualcosa di reale, aggiorneremo questa pagina.</p><p>Se sei interessato/a a contribuire come volontario/a open source, apri pure una issue o una pull request sul repository GitHub — ogni contributo è benvenuto.</p>" },
    en: { title: "Careers", body: "<p>We're not hiring: this is a hackathon prototype, not a company. If the project ever evolves into something real, we'll update this page.</p><p>If you're interested in contributing as an open-source volunteer, feel free to open an issue or a pull request on the GitHub repository — every contribution is welcome.</p>" },
  },
  press: {
    it: { title: "Press", body: "<p>Non abbiamo ancora un kit stampa: il progetto è un prototipo hackathon e non un prodotto lanciato. Per informazioni, richieste di intervista o collaborazioni editoriali, apri una issue sul repository GitHub e ti risponderemo.</p><p>Materiali visivi (logo, screenshot, palette colori) sono disponibili nella cartella <code>/presentation/assets</code> del repository.</p>" },
    en: { title: "Press", body: "<p>We don't have a press kit yet: the project is a hackathon prototype, not a launched product. For inquiries, interview requests or editorial collaborations, open an issue on the GitHub repository and we'll reply.</p><p>Visual assets (logo, screenshots, color palette) are available in the <code>/presentation/assets</code> folder of the repository.</p>" },
  },
};

function openFooterInfo(key) {
  const lang = getLang();
  const entry = FOOTER_INFO[key];
  if (!entry) return;
  const loc = entry[lang] || entry.it;
  openInfoModal(loc.title, loc.body);
}

// Delegated listener for footer links
document.addEventListener("click", (e) => {
  const el = e.target.closest("footer a[data-info], footer a[data-footer-action]");
  if (!el) return;
  e.preventDefault();
  const action = el.dataset.footerAction;
  if (action === "scrollHow") {
    const how = document.getElementById("howItWorks");
    if (how && how.style.display !== "none") {
      how.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      openFooterInfo("about"); // fallback if dashboard is open
    }
    return;
  }
  if (action === "contact") {
    window.open("https://github.com/MPQWERTY/BudgetingClient/issues/new", "_blank", "noopener");
    return;
  }
  const key = el.dataset.info;
  if (key) openFooterInfo(key);
});

function openPrivacyModal() {
  openModal((modal, close) => {
    modal.insertAdjacentHTML("beforeend", `
      <div class="modal-thumb" style="background:linear-gradient(135deg,#DBEAFE,#EDE9FE);"></div>
      <div class="modal-body">
        <h2>${t("menu_privacy")}</h2>
        <p style="color:var(--text-2);line-height:1.65;font-size:15px;">${t("privacy_body_1")}</p>
        <p style="color:var(--text-2);line-height:1.65;font-size:15px;margin-top:12px;">${t("privacy_body_2")}</p>
        <p style="margin-top:16px;"><a href="#" style="color:var(--violet-deep);text-decoration:none;font-weight:500;">${t("privacy_link")} →</a></p>
        <div class="modal-actions">
          <button class="btn" data-close>${t("close")}</button>
        </div>
      </div>`);
    modal.querySelector("[data-close]").onclick = close;
  });
}

function resetToHome() {
  // clear chat state
  chatHistory.length = 0;
  const log = $("#chatHeroLog");
  if (log) log.innerHTML = "";
  const chips = $("#promptChips");
  if (chips) chips.style.display = "";
  // hide dashboard, restore how-it-works
  const dash = $("#dashboard");
  if (dash) dash.style.display = "none";
  const how = $("#howItWorks");
  if (how) how.style.display = "";
  // scroll + focus
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => $("#chatHeroInput")?.focus(), 300);
}

// ---------- Chat ----------
function appendMsg(text, who = "bot", extra = null) {
  const log = $("#chatHeroLog");
  const m = document.createElement("div");
  m.className = `msg ${who}`;
  m.textContent = text;
  if (extra?.lessonCta) {
    const a = document.createElement("span");
    a.className = "lesson-cta";
    a.textContent = `→ ${extra.lessonCta.title}`;
    a.onclick = () => openLesson(extra.lessonCta);
    m.appendChild(document.createElement("br"));
    m.appendChild(a);
  }
  log.appendChild(m);
  log.scrollTop = log.scrollHeight;
  return m;
}

async function sendChat(question) {
  if (!question) return;
  // hide chips after first message
  const chips = $("#promptChips");
  if (chips) chips.style.display = "none";
  appendMsg(question, "user");
  chatHistory.push({ role: "user", content: question });
  const typing = document.createElement("div");
  typing.className = "msg bot typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  $("#chatHeroLog").appendChild(typing);
  $("#chatHeroLog").scrollTop = $("#chatHeroLog").scrollHeight;
  try {
    const res = await askAdvisor(question, {
      context: LAST_RESULT?.analysis || {},
      history: chatHistory.slice(0, -1), // history without current
    });
    typing.remove();
    let lessonCta = null;
    if (res.suggested_lesson) {
      const fromResult = LAST_RESULT?.advice?.mini_lessons?.find(l => l.id === res.suggested_lesson.id);
      const fromBank = getLessonById(res.suggested_lesson.id);
      lessonCta = fromResult || fromBank || res.suggested_lesson;
    }
    appendMsg(res.answer, "bot", lessonCta ? { lessonCta } : null);
    chatHistory.push({ role: "assistant", content: res.answer });
  } catch (err) {
    typing.remove();
    appendMsg(String(err?.message || err), "bot");
  }
}

$("#chatHeroForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#chatHeroInput").value.trim();
  $("#chatHeroInput").value = "";
  sendChat(q);
});

$$("#promptChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const text = chip.textContent.trim();
    $("#chatHeroInput").value = text;
    sendChat(text);
    $("#chatHeroInput").value = "";
  });
});

// ---------- Upload flow ----------
async function handleFile(file) {
  ribbonShow();
  const fileMeta = { name: file.name, type: file.type || file.name.split(".").pop(), size_bytes: file.size };
  let fileData;
  try {
    fileData = await readFile(file);
  } catch (e) {
    ribbonComplete();
    toast("Errore lettura file: " + e.message, "!");
    return;
  }
  toast(getLang() === "en" ? `File loaded: ${file.name}` : `File caricato: ${file.name}`, "↑");
  $("#hitlBanner").style.display = "none";
  const res = await runOrchestrator({
    fileMeta, fileData,
    onStep: (agent, status) => {
      ribbonSet(agent, status);
    },
  });
  $("#hitlBanner").style.display = res.hitl_required ? "" : "none";
  ribbonComplete();
  if (res.status === "error" || !res.parse?.transactions?.length) {
    toast(getLang() === "en" ? "Could not parse the file. Try another format." : "Impossibile leggere il file. Prova un altro formato.", "!");
    return;
  }
  renderDashboard(res);
  toast(getLang() === "en" ? "Analysis complete" : "Analisi completata", "✓");
  setTimeout(() => $("#dashboard").scrollIntoView({ behavior: "smooth", block: "start" }), 400);
}

$("#fileInput").addEventListener("change", (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });
$("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
$("#btnSample").addEventListener("click", async () => {
  try {
    const r = await fetch("/data/sample_estratto.csv");
    const blob = await r.blob();
    const file = new File([blob], "sample_estratto.csv", { type: "text/csv" });
    handleFile(file);
  } catch (e) {
    toast("Sample non disponibile", "!");
  }
});
$("#btnConfirmHitl").addEventListener("click", () => { $("#hitlBanner").style.display = "none"; });

// ---------- User menu (legacy — sostituito da pages.js) ----------
const dropdown = $("#userDropdown");
if (dropdown && $("#avatarBtn")) {
$("#avatarBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target) && e.target.id !== "avatarBtn") {
    dropdown.classList.remove("open");
  }
});
dropdown.querySelectorAll(".dropdown-item").forEach(item => {
  item.addEventListener("click", () => {
    const action = item.dataset.action;
    dropdown.classList.remove("open");
    if (action === "profile") {
      openProfileModal();
    } else if (action === "settings") {
      openSettingsModal();
    } else if (action === "history") {
      const h = document.querySelector(".history-card");
      const dashOpen = $("#dashboard").style.display !== "none";
      if (h && dashOpen) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        toast(getLang() === "en" ? "No analyses yet. Load a bank statement." : "Nessuna analisi ancora. Carica un estratto conto.", "i");
        setTimeout(() => $("#fileInput").click(), 300);
      }
    } else if (action === "privacy") {
      openPrivacyModal();
    } else if (action === "logout") {
      const msg = getLang() === "en"
        ? "Delete all local data?"
        : "Cancellare tutti i dati locali?";
      if (confirm(msg)) {
        try { clearAll(); } catch {}
        try { localStorage.clear(); } catch {}
        location.reload();
      }
    }
  });
});
} // end legacy user-menu guard

// Brand → Home
$("#navBrand")?.addEventListener("click", () => {
  const hasChat = chatHistory.length > 0;
  const dashOpen = $("#dashboard").style.display !== "none";
  if (hasChat || dashOpen) resetToHome();
  else window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#btnHelp").addEventListener("click", () => {
  $("#chatHeroInput").focus();
});

// ---------- Language ----------
$("#langSelect").addEventListener("change", (e) => { setLang(e.target.value); applyI18n(); });

// ---------- Bootstrap ----------
setLang(detectLang());
$("#langSelect").value = getLang();
applyI18n();
