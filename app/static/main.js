import { detectLang, setLang, getLang, t, dict } from "./lib/i18n.js";
import { readFile } from "./lib/fileReaders.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import { askAdvisor } from "./agents/advisor.js";
import { loadSessions } from "./agents/state.js";

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

// ---------- Agent progress UI ----------
function setAgentStatus(agent, status) {
  const el = document.querySelector(`.agent[data-agent="${agent}"]`);
  if (!el) return;
  el.dataset.status = status;
  el.querySelector(".state").textContent = t(status) || status;
}
function resetAgents() {
  ["parser", "analyzer", "simulator", "advisor"].forEach(a => setAgentStatus(a, "pending"));
}

// ---------- Pie chart (canvas vanilla) ----------
const PIE_COLORS = ["#A100FF", "#BE82FF", "#7B00CC", "#D6B0FF", "#5C1A99", "#E8D0FF", "#9333EA", "#4A0080"];
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
  // hole
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fillStyle = "#1a0530"; ctx.fill();
}

// ---------- Renderers ----------
let LAST_RESULT = null;

function renderDashboard(res) {
  LAST_RESULT = res;
  $("#secDashboard").classList.remove("hidden");
  // score
  const adv = res.advice;
  if (adv) {
    $("#scoreValue").textContent = adv.score;
    $("#scoreInterp").textContent = adv.interpretation || "";
    $("#scoreBreakdown").innerHTML = Object.entries(adv.score_breakdown || {}).map(([k, v]) => `
      <div class="breakdown-row">
        <span class="label">${k.replace(/_/g, " ")}</span>
        <span class="bar"><div style="width:${v}%"></div></span>
        <span class="val">${v}</span>
      </div>`).join("");
  }
  // categorie + pie
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
      <span>${e.label} — €${e.value.toFixed(0)} (${cats[e.label].pct_of_expenses}%)</span>
    </div>`).join("");
  // story
  $("#storyText").textContent = res.analysis?.narrative || "";
  // scenarios
  $("#scenariosList").innerHTML = (res.simulation?.scenarios || []).map(s => `
    <div class="scenario">
      <h4>${s.title}</h4>
      <div>${s.narrative || ""}</div>
      <div class="proj">3m: €${s.projections?.["3m"] || 0} · 6m: €${s.projections?.["6m"] || 0} · 12m: €${s.projections?.["12m"] || 0}</div>
    </div>`).join("");
  // lessons
  $("#lessonsList").innerHTML = (adv?.mini_lessons || []).map((l, i) => `
    <div class="lesson">
      <h4>${l.title}</h4>
      <div class="meta">${l.difficulty || ""} · ${l.duration_min || 0} min</div>
      <button data-lesson-idx="${i}">Apri lezione</button>
    </div>`).join("");
  $$("#lessonsList button[data-lesson-idx]").forEach(b => b.onclick = () => openLesson(adv.mini_lessons[+b.dataset.lessonIdx]));
  // history
  const sess = loadSessions();
  $("#historyTable tbody").innerHTML = sess.slice(0, 10).map(s => `
    <tr>
      <td>${new Date(s.ts).toLocaleDateString()}</td>
      <td>${s.file}</td>
      <td>${s.score ?? "—"}</td>
      <td>${s.row_count}</td>
    </tr>`).join("");
}

function openLesson(lesson) {
  if (!lesson) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <button class="close ghost">✕</button>
      <h2>${lesson.title}</h2>
      <div class="meta" style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">${lesson.difficulty || ""} · ${lesson.duration_min || 0} min</div>
      <ol>${(lesson.steps || []).map(s => `<li>${s}</li>`).join("")}</ol>
      ${(lesson.quiz || []).map((q, qi) => `
        <div class="quiz">
          <div style="font-weight:500;margin-bottom:8px;">${q.q}</div>
          ${q.a.map((opt, ai) => `<button class="option" data-q="${qi}" data-a="${ai}">${opt}</button>`).join("")}
        </div>`).join("")}
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelectorAll(".quiz .option").forEach(btn => {
    btn.onclick = () => {
      const qi = +btn.dataset.q, ai = +btn.dataset.a;
      const correct = lesson.quiz[qi].correct;
      btn.classList.add(ai === correct ? "correct" : "wrong");
      if (ai !== correct) {
        btn.parentElement.querySelectorAll(".option").forEach((o, i) => { if (i === correct) o.classList.add("correct"); });
      }
    };
  });
}

// ---------- Chat ----------
function appendMsg(text, who = "bot", extra = null) {
  const log = $("#chatLog");
  const m = document.createElement("div");
  m.className = `msg ${who}`;
  m.textContent = text;
  if (extra?.lessonCta) {
    const a = document.createElement("span");
    a.className = "lesson-cta"; a.textContent = `→ ${extra.lessonCta.title}`;
    a.onclick = () => openLesson(extra.lessonCta);
    m.appendChild(a);
  }
  log.appendChild(m); log.scrollTop = log.scrollHeight;
}

$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#chatInput").value.trim(); if (!q) return;
  appendMsg(q, "user"); $("#chatInput").value = "";
  const typing = document.createElement("div"); typing.className = "msg bot"; typing.textContent = "…";
  $("#chatLog").appendChild(typing);
  try {
    const res = await askAdvisor(q, LAST_RESULT?.analysis || {});
    typing.remove();
    let lessonCta = null;
    if (res.suggested_lesson && LAST_RESULT?.advice?.mini_lessons) {
      lessonCta = LAST_RESULT.advice.mini_lessons.find(l => l.id === res.suggested_lesson.id) || res.suggested_lesson;
    }
    appendMsg(res.answer, "bot", lessonCta ? { lessonCta } : null);
  } catch (err) {
    typing.remove(); appendMsg(String(err), "bot");
  }
});

// ---------- Upload flow ----------
async function handleFile(file) {
  $("#secAgents").classList.remove("hidden");
  resetAgents();
  const fileMeta = { name: file.name, type: file.type || file.name.split(".").pop(), size_bytes: file.size };
  let fileData;
  try {
    fileData = await readFile(file);
  } catch (e) {
    alert("Errore lettura file: " + e.message); return;
  }
  const res = await runOrchestrator({
    fileMeta, fileData,
    onStep: (agent, status) => setAgentStatus(agent, status),
  });
  if (res.hitl_required) $("#hitlBanner").classList.remove("hidden");
  renderDashboard(res);
}

$("#fileInput").addEventListener("change", (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });
$("#dropzone").addEventListener("click", () => $("#fileInput").click());
$("#dropzone").addEventListener("dragover", (e) => { e.preventDefault(); $("#dropzone").classList.add("hover"); });
$("#dropzone").addEventListener("dragleave", () => $("#dropzone").classList.remove("hover"));
$("#dropzone").addEventListener("drop", (e) => {
  e.preventDefault(); $("#dropzone").classList.remove("hover");
  const f = e.dataTransfer.files[0]; if (f) handleFile(f);
});

$("#btnSample").addEventListener("click", async (e) => {
  e.stopPropagation();
  const r = await fetch("/data/sample_estratto.csv");
  const blob = await r.blob();
  const file = new File([blob], "sample_estratto.csv", { type: "text/csv" });
  handleFile(file);
});

$("#btnReload").addEventListener("click", () => location.reload());
$("#btnConfirmHitl").addEventListener("click", () => $("#hitlBanner").classList.add("hidden"));

// sample serving path adjustment: server serves static only, sample is under data/. Route /data → static/../data.
// We'll create data as static/data/ symlink or just put sample under static/data for simplicity.

$("#langSelect").addEventListener("change", (e) => { setLang(e.target.value); applyI18n(); });

// bootstrap
setLang(detectLang());
$("#langSelect").value = getLang();
applyI18n();
