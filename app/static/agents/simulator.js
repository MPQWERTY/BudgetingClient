import { callAgent, loadSystemPrompt } from "../lib/claude.js";
import { getLang } from "../lib/i18n.js";

const MOCK = {
  scenarios: [
    { id: "reduce_entertainment_20", title: "Riduci intrattenimento del 20%", delta_monthly: 40,
      projections: { "3m": 120, "6m": 240, "12m": 480 },
      narrative: "Portando le spese di svago da €200 a €160 al mese risparmi €480 in un anno." },
    { id: "save_100_month", title: "Metti da parte €100 al mese", delta_monthly: 100,
      projections: { "3m": 300, "6m": 600, "12m": 1200 },
      narrative: "Con €100 al mese in un anno costruisci un piccolo fondo di emergenza da €1.200." },
  ],
  disclaimer: "Proiezioni lineari, non consulenza finanziaria.",
};

function fallback(categories, lang) {
  const disc = Object.entries(categories || {})
    .filter(([k]) => ["entertainment", "food"].includes(k))
    .sort((a, b) => a[1].total - b[1].total)[0];
  const target = disc ? Math.round(Math.abs(disc[1].total) * 0.15) : 30;
  return {
    scenarios: [{
      id: "reduce_top_discretionary",
      title: lang === "en" ? `Cut top discretionary by 15%` : `Riduci del 15% la spesa discrezionale principale`,
      delta_monthly: target,
      projections: { "3m": target * 3, "6m": target * 6, "12m": target * 12 },
      narrative: lang === "en"
        ? `Saving €${target}/month adds up to €${target * 12} in a year.`
        : `Risparmiando €${target} al mese arrivi a €${target * 12} in un anno.`,
    }],
    disclaimer: lang === "en" ? "Linear projections, not financial advice." : "Proiezioni lineari, non consulenza finanziaria.",
  };
}

export async function runSimulator({ categories, totals }) {
  const lang = getLang();
  const system = await loadSystemPrompt("SIMULATOR_AGENT.md");
  const user = [
    `Lingua utente: ${lang}.`,
    `Categorie:\n${JSON.stringify(categories)}`,
    `Totali:\n${JSON.stringify(totals)}`,
    `Restituisci 2-4 scenari what-if. SOLO JSON conforme allo schema. Nessuna raccomandazione di prodotti.`,
  ].join("\n\n");
  try {
    const { json } = await callAgent({
      agent: "simulator", systemPrompt: system, userMessage: user,
      tier: "fast", maxTokens: 1500, timeoutMs: 20000, retries: 1,
      mockResponse: MOCK,
    });
    if (json?.scenarios?.length) return json;
    throw new Error("no scenarios");
  } catch {
    return fallback(categories, lang);
  }
}
