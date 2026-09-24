import { callAgent, loadSystemPrompt } from "../lib/claude.js";
import { getLang } from "../lib/i18n.js";

const MOCK = {
  score: 68,
  score_breakdown: { income_stability: 78, expense_ratio: 65, savings_rate: 40, emergency_fund: 30, debt_management: 85 },
  interpretation: "Punteggio nella media. Punto forte: gestione del debito. Da migliorare: fondo di emergenza e tasso di risparmio.",
  weak_areas: [
    { key: "emergency_fund", score: 30, why: "Nessun bonifico verso risparmio nel periodo analizzato." },
    { key: "savings_rate", score: 40, why: "Risparmi <10% del reddito." },
  ],
  mini_lessons: [
    {
      id: "emergency-fund-101", title: "Costruire un fondo di emergenza",
      difficulty: "beginner", duration_min: 8,
      steps: ["Cos'è un fondo di emergenza", "Quanto serve (3-6 mesi di spese)", "Dove tenerlo", "Come costruirlo con piccoli passi"],
      quiz: [{ q: "Quante mensilità di spese dovrebbe coprire?", a: ["1 mese", "3-6 mesi", "1 anno"], correct: 1 }],
    },
  ],
  disclaimer: "Contenuto educativo. Non è consulenza finanziaria personalizzata.",
};

function fallback(analysis, lang) {
  return {
    score: 50,
    score_breakdown: { income_stability: 50, expense_ratio: 50, savings_rate: 50, emergency_fund: 50, debt_management: 50 },
    interpretation: lang === "en" ? "Neutral score (fallback)." : "Punteggio neutro (fallback).",
    weak_areas: [],
    mini_lessons: [{
      id: "budget-basics", title: lang === "en" ? "Budgeting basics" : "Basi del budgeting",
      difficulty: "beginner", duration_min: 6,
      steps: ["50/30/20 rule", "Track expenses", "Set goals", "Review monthly"],
      quiz: [{ q: lang === "en" ? "What is 50/30/20?" : "Cos'è la regola 50/30/20?",
              a: ["Investimenti", lang === "en" ? "Needs/Wants/Savings" : "Bisogni/Desideri/Risparmi", "Debiti"], correct: 1 }],
    }],
    disclaimer: lang === "en" ? "Educational content, not advice." : "Contenuto educativo, non consulenza.",
  };
}

export async function runAdvisor({ analysis, simulation, history = {} }) {
  const lang = getLang();
  const system = await loadSystemPrompt("ADVISOR_AGENT.md");
  const user = [
    `Lingua utente: ${lang}. Rispondi nella lingua utente.`,
    `Analisi: ${JSON.stringify(analysis)}`,
    `Simulazioni: ${JSON.stringify(simulation)}`,
    `Storico utente: ${JSON.stringify(history)}`,
    `Restituisci SOLO JSON conforme allo schema. NON suggerire prodotti finanziari o titoli.`,
  ].join("\n\n");
  try {
    const { json } = await callAgent({
      agent: "advisor", systemPrompt: system, userMessage: user,
      tier: "smart", maxTokens: 2500, timeoutMs: 30000, retries: 1,
      mockResponse: MOCK,
    });
    if (typeof json?.score === "number") return json;
    throw new Error("no score");
  } catch {
    return fallback(analysis, lang);
  }
}

// Q&A single-shot per chat: risponde su termini finanziari, propone lezione se rilevante.
export async function askAdvisor(question, context = {}) {
  const lang = getLang();
  const system = await loadSystemPrompt("ADVISOR_AGENT.md");
  const user = [
    `Lingua utente: ${lang}. Rispondi nella lingua utente.`,
    `L'utente chiede: "${question}"`,
    `Contesto (analisi corrente): ${JSON.stringify(context).slice(0, 2000)}`,
    `Rispondi in linguaggio semplice, 2-4 frasi. Se il termine richiede approfondimento, proponi una mini-lezione.`,
    `Se l'utente chiede consigli di investimento, deflect a educazione (spiega il concetto senza raccomandare prodotti).`,
    `Restituisci JSON: {"answer": "...", "suggested_lesson": {"id":"...","title":"..."} | null}`,
  ].join("\n\n");
  try {
    const { json, text } = await callAgent({
      agent: "advisor-qa", systemPrompt: system, userMessage: user,
      tier: "fast", maxTokens: 700, timeoutMs: 20000, retries: 1,
      mockResponse: { answer: "TAEG = Tasso Annuale Effettivo Globale, il costo totale annuo di un prestito compresi interessi e spese.", suggested_lesson: { id: "taeg-101", title: "Capire il TAEG" } },
    });
    if (json?.answer) return json;
    return { answer: text || "…", suggested_lesson: null };
  } catch (e) {
    return { answer: lang === "en" ? "Sorry, service unavailable." : "Servizio non disponibile.", suggested_lesson: null };
  }
}
