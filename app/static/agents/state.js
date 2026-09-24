// Persistenza sessioni utente in localStorage.
const KEY = "bs.sessions";
const HIST_KEY = "bs.history";
const LESSON_KEY = "bs.lessons";

export function loadSessions() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function saveSession(session) {
  const list = loadSessions();
  list.unshift({ ...session, ts: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
}
export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "{}"); }
  catch { return {}; }
}
export function updateHistory({ score, completedLesson } = {}) {
  const h = loadHistory();
  if (typeof score === "number") {
    h.prev_scores = [...(h.prev_scores || []), score].slice(-10);
  }
  if (completedLesson) h.completed_lessons = [...new Set([...(h.completed_lessons || []), completedLesson])];
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
  return h;
}
export function clearAll() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(HIST_KEY);
  localStorage.removeItem(LESSON_KEY);
}

// -------- Lesson progress (wizard state) --------
function _loadAllLessons() {
  try { return JSON.parse(localStorage.getItem(LESSON_KEY) || "{}"); }
  catch { return {}; }
}
export function saveLessonProgress(id, data) {
  if (!id) return;
  const all = _loadAllLessons();
  all[id] = { ...(all[id] || {}), ...(data || {}), updated_at: Date.now() };
  try { localStorage.setItem(LESSON_KEY, JSON.stringify(all)); } catch {}
  return all[id];
}
export function getLessonProgress(id) {
  if (!id) return null;
  const all = _loadAllLessons();
  return all[id] || null;
}
export function loadLessonProgress() {
  return _loadAllLessons();
}

// -------- Estensioni pagine utente (profilo, obiettivi, impostazioni, export) --------
const GOALS_KEY = "bs.goals";
const SETTINGS_KEY = "bs.settings";
const PROFILE_KEY = "bs.profile";

export function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY) || "[]"); } catch { return []; }
}
export function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(Array.isArray(goals) ? goals : []));
}
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { return {}; }
}
export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s && typeof s === "object" ? s : {}));
}
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); } catch { return {}; }
}
export function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p && typeof p === "object" ? p : {}));
}
export function exportAllData() {
  const out = { _app: "budget-storyteller", _version: 1, _exported_at: new Date().toISOString(), data: {} };
  ["bs.sessions", "bs.history", "bs.goals", "bs.settings", "bs.profile", "bs.lessons", "appLang"].forEach(k => {
    const v = localStorage.getItem(k);
    if (v == null) return;
    try { out.data[k] = JSON.parse(v); } catch { out.data[k] = v; }
  });
  return out;
}
export function deleteSession(ts) {
  const list = loadSessions();
  const filtered = list.filter(s => s.ts !== ts);
  localStorage.setItem(KEY, JSON.stringify(filtered));
  return filtered;
}
export function clearEverything() {
  ["bs.sessions", "bs.history", "bs.goals", "bs.settings", "bs.profile", "bs.lessons"].forEach(k => localStorage.removeItem(k));
}
export function storageSizeKB(key) {
  const v = localStorage.getItem(key);
  if (!v) return 0;
  return Math.round((v.length * 2) / 102.4) / 10;
}
