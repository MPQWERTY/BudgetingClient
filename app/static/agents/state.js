// Persistenza sessioni utente in localStorage.
const KEY = "bs.sessions";
const HIST_KEY = "bs.history";

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
export function updateHistory({ score, completedLesson }) {
  const h = loadHistory();
  h.prev_scores = [...(h.prev_scores || []), score].slice(-10);
  if (completedLesson) h.completed_lessons = [...new Set([...(h.completed_lessons || []), completedLesson])];
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
  return h;
}
export function clearAll() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(HIST_KEY);
}
