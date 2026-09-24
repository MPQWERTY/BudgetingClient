// Wrapper unico per chiamare Claude via il proxy /api/claude.
// Retry con backoff, timeout, token accounting, mock mode via ?mock=1.

const MOCK = new URLSearchParams(location.search).get("mock") === "1";
export const isMock = () => MOCK;
const MODELS = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-5-20250929",
};

const _tokenTotals = { input: 0, output: 0, calls: 0 };
export const tokenStats = () => ({ ..._tokenTotals });

// Carica il .md dell'agente come system prompt.
const _sysCache = new Map();
export async function loadSystemPrompt(agentFile) {
  if (_sysCache.has(agentFile)) return _sysCache.get(agentFile);
  const r = await fetch(`/agents/${agentFile}`);
  if (!r.ok) throw new Error(`system prompt load fail: ${agentFile}`);
  const txt = await r.text();
  _sysCache.set(agentFile, txt);
  return txt;
}

async function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Estrae il primo blocco JSON da un testo (gestisce ```json ... ``` o oggetti nudi).
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const startArr = raw.indexOf("[");
  const s = (start === -1) ? startArr : (startArr === -1 ? start : Math.min(start, startArr));
  if (s === -1) return null;
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (end === -1) return null;
  try { return JSON.parse(raw.slice(s, end + 1)); } catch { return null; }
}

/**
 * callAgent — chiama un agente Claude con retry e timeout.
 * @param {object} opts
 * @param {string} opts.agent         nome logico (es. "parser")
 * @param {string} opts.systemPrompt  system prompt (dal .md)
 * @param {string} opts.userMessage   user turn
 * @param {"fast"|"smart"} [opts.tier="fast"]
 * @param {number} [opts.maxTokens=2048]
 * @param {number} [opts.timeoutMs=30000]
 * @param {number} [opts.retries=2]
 * @param {any}    [opts.mockResponse]  usato se ?mock=1
 * @returns {Promise<{text:string, json:any, raw:any}>}
 */
export async function callAgent({
  agent, systemPrompt, userMessage, messages,
  tier = "fast", maxTokens = 2048, timeoutMs = 30000,
  retries = 2, mockResponse = null,
}) {
  const payloadMessages = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: "user", content: userMessage }];
  if (MOCK && mockResponse != null) {
    await _sleep(300 + Math.random() * 500);
    const text = typeof mockResponse === "string" ? mockResponse : JSON.stringify(mockResponse);
    return { text, json: extractJson(text), raw: { mock: true } };
  }
  const model = MODELS[tier] || MODELS.fast;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch("/api/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: maxTokens,
          system: systemPrompt,
          messages: payloadMessages,
        }),
        signal: ctl.signal,
      });
      clearTimeout(t);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${r.status}`);
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      if (data.usage) {
        _tokenTotals.input += data.usage.input_tokens || 0;
        _tokenTotals.output += data.usage.output_tokens || 0;
        _tokenTotals.calls += 1;
      }
      return { text, json: extractJson(text), raw: data };
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries) await _sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error(`[${agent}] fallito dopo ${retries + 1} tentativi: ${lastErr?.message || lastErr}`);
}
