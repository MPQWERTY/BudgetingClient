import { callAgent, loadSystemPrompt, isMock } from "../lib/claude.js";
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
  // unisci IT + EN: le descrizioni bancarie sono in italiano anche se UI in inglese
  const kwIT = CATEGORY_KEYWORDS.it || {};
  const kwEN = CATEGORY_KEYWORDS.en || {};
  const merged = {};
  for (const cat of new Set([...Object.keys(kwIT), ...Object.keys(kwEN)])) {
    merged[cat] = [...(kwIT[cat] || []), ...(kwEN[cat] || [])];
  }
  const cats = {};
  const catOf = (desc) => {
    const d = desc.toLowerCase();
    for (const [c, words] of Object.entries(merged)) if (words.some(w => d.includes(w))) return c;
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
  const essential_pct = income ? Math.round(100 * essential / income) : 0;
  const savings_pct = income ? Math.round(100 * (cats.savings?.total || 0) / income) : 0;
  const net = income + expenses;
  const discretionary_pct = income ? Math.round(100 * Math.abs(cats.entertainment?.total || 0) / income) : 0;

  // top categorie non-income ordinate per spesa
  const topExpense = Object.entries(cats)
    .filter(([k]) => k !== "income")
    .sort((a, b) => a[1].total - b[1].total)[0];
  const catLabel = (k) => {
    const it = { housing: "casa", food: "cibo e spesa", utilities: "bollette e utenze", transport: "trasporti", entertainment: "intrattenimento", shopping: "shopping", health: "salute", savings: "risparmi", other: "altre spese" };
    const en = { housing: "housing", food: "food & groceries", utilities: "bills & utilities", transport: "transport", entertainment: "entertainment", shopping: "shopping", health: "health", savings: "savings", other: "other" };
    return lang === "en" ? (en[k] || k) : (it[k] || k);
  };

  const narrative = lang === "en"
    ? [
        income > 0 ? `This period you received €${income.toFixed(0)} in income.` : `No income transactions in this period.`,
        topExpense ? `Your biggest expense category is ${catLabel(topExpense[0])} at €${Math.abs(topExpense[1].total).toFixed(0)} (${topExpense[1].pct_of_expenses}% of outflows).` : "",
        essential_pct > 0 ? `Essentials (housing, food, utilities, transport) absorb ${essential_pct}% of your income.` : "",
        savings_pct === 0 && income > 0 ? `No transfers to savings detected — a small automatic deposit could change your trajectory.` : (savings_pct > 0 ? `You saved ${savings_pct}% of your income this period. Nice.` : ""),
        net > 0 ? `Net balance: +€${net.toFixed(0)} — a positive month.` : (net < 0 ? `Net balance: -€${Math.abs(net).toFixed(0)} — expenses exceeded income.` : ""),
      ].filter(Boolean).join(" ")
    : [
        income > 0 ? `In questo periodo hai ricevuto €${income.toFixed(0)} di entrate.` : `Nessuna entrata rilevata nel periodo.`,
        topExpense ? `La tua categoria di spesa principale è ${catLabel(topExpense[0])} con €${Math.abs(topExpense[1].total).toFixed(0)} (${topExpense[1].pct_of_expenses}% delle uscite).` : "",
        essential_pct > 0 ? `Le spese essenziali (casa, cibo, bollette, trasporti) assorbono il ${essential_pct}% del tuo reddito.` : "",
        savings_pct === 0 && income > 0 ? `Nessun bonifico verso risparmi rilevato — un piccolo accantonamento automatico può cambiare la tua traiettoria.` : (savings_pct > 0 ? `Hai risparmiato il ${savings_pct}% del reddito. Bene.` : ""),
        net > 0 ? `Bilancio netto: +€${net.toFixed(0)} — mese in positivo.` : (net < 0 ? `Bilancio netto: -€${Math.abs(net).toFixed(0)} — spese sopra le entrate.` : ""),
      ].filter(Boolean).join(" ");

  // Anomalies: categoria dove hai speso molto più della media
  const anomalies = [];
  const nonIncome = Object.entries(cats).filter(([k]) => k !== "income");
  if (nonIncome.length > 2) {
    const totals = nonIncome.map(([, v]) => Math.abs(v.total));
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    for (const [k, v] of nonIncome) {
      if (Math.abs(v.total) > avg * 2 && k !== "housing") {
        anomalies.push({
          description: lang === "en"
            ? `${catLabel(k)} spending is notably above your other categories (€${Math.abs(v.total).toFixed(0)}).`
            : `La spesa in ${catLabel(k)} è nettamente sopra le altre categorie (€${Math.abs(v.total).toFixed(0)}).`,
          severity: "medium",
        });
      }
    }
  }

  return {
    categories: cats,
    totals: { income, expenses, net, essential_pct, discretionary_pct, savings_pct },
    narrative,
    anomalies,
  };
}

export async function runAnalyzer({ transactions }) {
  const lang = getLang();
  if (isMock()) {
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    return deterministicAnalyze(transactions, lang);
  }
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
