import { callAgent, loadSystemPrompt, isMock } from "../lib/claude.js";
import { CATEGORY_KEYWORDS, getLang } from "../lib/i18n.js";

const MOCK = {
  transactions: [
    { date: "2026-09-01", description: "Bonifico stipendio", amount: 2400, currency: "EUR", confidence: 0.99 },
    { date: "2026-09-02", description: "Mutuo casa", amount: -850, currency: "EUR", confidence: 0.98 },
    { date: "2026-09-05", description: "Esselunga", amount: -92.4, currency: "EUR", confidence: 0.95 },
  ],
  parse_quality: 0.9, warnings: [], detected_columns: {}, row_count: 3,
};

// Fallback deterministico: se abbiamo già rows dal CSV/XLSX, li normalizza senza LLM.
function deterministicFromRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  // cerca header nelle prime 5 righe (banche mettono spesso preamboli)
  let headerRow = -1, header = null, idxDate = -1, idxDesc = -1, idxAmt = -1;
  for (let h = 0; h < Math.min(5, rows.length); h++) {
    const cand = rows[h].map(x => String(x).toLowerCase());
    const d = cand.findIndex(x => /data|date/.test(x));
    const de = cand.findIndex(x => /descr|desc|causale|payee|merchant|note/.test(x));
    const a = cand.findIndex(x => /import|amount|valore|value/.test(x));
    if (d >= 0 && a >= 0) { headerRow = h; header = cand; idxDate = d; idxDesc = de; idxAmt = a; break; }
  }
  if (headerRow < 0) return null;
  const txs = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[idxDate]) continue;
    const dateRaw = String(r[idxDate]);
    const iso = normDate(dateRaw);
    const amtRaw = String(r[idxAmt]).replace(/\./g, "").replace(",", ".").replace(/[^0-9\-.]/g, "");
    const amount = parseFloat(amtRaw);
    if (!iso || Number.isNaN(amount)) continue;
    txs.push({
      date: iso,
      description: String(r[idxDesc] ?? "").trim(),
      amount, currency: "EUR", confidence: 0.7,
    });
  }
  return {
    transactions: txs,
    parse_quality: txs.length > 3 ? 0.75 : 0.5,
    warnings: ["Parsing deterministico (fallback senza LLM)"],
    detected_columns: { date: header[idxDate], desc: header[idxDesc], amount: header[idxAmt] },
    row_count: txs.length,
  };
}

function normDate(s) {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const [_, d, mo, y] = m;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return null;
}

export async function runParser({ fileMeta, fileData }) {
  // Mock mode: usa il deterministico sui dati veri caricati dall'utente
  if (isMock()) {
    await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
    const fb = deterministicFromRows(fileData.rows);
    if (fb) return fb;
  }
  const system = await loadSystemPrompt("PARSER_AGENT.md");
  const user = [
    `File: ${fileMeta.name} (${fileMeta.type}, ${fileMeta.size_bytes} bytes)`,
    `Lingua utente: ${getLang()}`,
    `PREVIEW (max 30 righe):\n${fileData.preview}`,
    `\nRestituisci SOLO JSON valido conforme all'output schema.`,
  ].join("\n\n");

  try {
    const { json } = await callAgent({
      agent: "parser", systemPrompt: system, userMessage: user,
      tier: "fast", maxTokens: 3000, timeoutMs: 30000, retries: 1,
      mockResponse: MOCK,
    });
    if (json && Array.isArray(json.transactions) && json.transactions.length) return json;
    throw new Error("output non valido");
  } catch (e) {
    const fb = deterministicFromRows(fileData.rows);
    if (fb) return fb;
    return { transactions: [], parse_quality: 0, warnings: [String(e)], detected_columns: {}, row_count: 0 };
  }
}
