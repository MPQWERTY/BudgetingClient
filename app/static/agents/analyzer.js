import { callAgent, loadSystemPrompt } from "../lib/claude.js";
import { CATEGORY_KEYWORDS, getLang } from "../lib/i18n.js";

const MOCK = {
  categories: {
    housing: { total: -850, count: 1, pct_of_expenses: 47.5, examples: ["Mutuo casa"] },
    food: { total: -320, count: 4, pct_of_expenses: 17.9, examples: ["Esselunga", "Ristorante"] },
    utilities: { total: -180, count: 2, pct_of_expenses: 10.1, examples: ["Enel", "TIM"] },
    transport: { total: -240, count: 3, pct_of_expenses: 13.4, examples: ["Q8", "ATM"] },
    entertainment: { total: -200, count: 3, pct_of_expenses: 11.2, examples: ["Netflix", "Spotify"] },
    savings: { total: 0, count: 0, pct_of_expenses: 0, examples: [] },
    income: { total: 2400, count: 1, pct_of_expenses: 0, examples: ["Bonifico stipendio"] },
  },
  totals: { income: 2400, expenses: -1790, net: 610, essential_pct: 75, discretionary_pct: 11, savings_pct: 0 },
  narrative: "A settembre hai ricevuto €2.400 di stipendio. Il 75% è andato a spese essenziali (casa, cibo, utenze). Sono avanzati €610, ma nessun bonifico verso risparmi: potrebbe essere un buon momento per iniziare un fondo di emergenza.",
  anomalies: [{ description: "Nessun accantonamento a risparmio nel mese", severity: "medium" }],
};

// Fallback deterministico: categorizza via keyword.
function deterministicAnalyze(transactions, lang) {
  const kw = CATEGORY_KEYWORDS[lang] || CATEGORY_KEYWORDS.it;
  const cats = {};
  const catOf = (desc) => {
    const d = desc.toLowerCase();
    for (const [c, words] of Object.entries(kw)) if (words.some(w => d.includes(w))) return c;
    return "other";
  };
  let income = 0, expenses = 0;
  for (const t of transactions) {
    const c = t.amount > 0 ? "income" : catOf(t.description);
    const bucket = cats[c] ||= { total: 0, count: 0, pct_of_expenses: 0, examples: [] };
    bucket.total += t.amount; bucket.count += 1;
    if (bucket.examples.length < 3) bucket.examples.push(t.description);
    if (t.amount > 0) income += t.amount; else expenses += t.amount;
  }
  for (const [c, b] of Object.entries(cats)) {
    if (c !== "income") b.pct_of_expenses = expenses ? +(100 * b.total / expenses).toFixed(1) : 0;
  }
  const essentialKeys = ["housing", "food", "utilities", "transport"];
  const essential = essentialKeys.reduce((s, k) => s + Math.abs(cats[k]?.total || 0), 0);
  return {
    categories: cats,
    totals: {
      income, expenses, net: income + expenses,
      essential_pct: income ? Math.round(100 * essential / income) : 0,
      discretionary_pct: income ? Math.round(100 * Math.abs(cats.entertainment?.total || 0) / income) : 0,
      savings_pct: income ? Math.round(100 * (cats.savings?.total || 0) / income) : 0,
    },
    narrative: lang === "en"
      ? `Deterministic breakdown of ${transactions.length} transactions across ${Object.keys(cats).length} categories.`
      : `Analisi euristica di ${transactions.length} transazioni in ${Object.keys(cats).length} categorie.`,
    anomalies: [],
  };
}

export async function runAnalyzer({ transactions }) {
  const lang = getLang();
  const system = await loadSystemPrompt("ANALYZER_AGENT.md");
  const user = [
    `Lingua utente: ${lang}. Rispondi nella lingua utente.`,
    `Transazioni (${transactions.length}):`,
    JSON.stringify(transactions.slice(0, 100), null, 2),
    `\nRestituisci SOLO JSON valido conforme all'output schema. Narrativa max 500 caratteri, tono neutro.`,
  ].join("\n\n");
  try {
    const { json } = await callAgent({
      agent: "analyzer", systemPrompt: system, userMessage: user,
      tier: "fast", maxTokens: 2500, timeoutMs: 25000, retries: 1,
      mockResponse: MOCK,
    });
    if (json?.categories && json?.totals) return json;
    throw new Error("output non valido");
  } catch (e) {
    return deterministicAnalyze(transactions, lang);
  }
}
