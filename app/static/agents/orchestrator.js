import { runParser } from "./parser.js";
import { runAnalyzer } from "./analyzer.js";
import { runSimulator } from "./simulator.js";
import { runAdvisor } from "./advisor.js";
import { saveSession, loadHistory, updateHistory } from "./state.js";
import { tokenStats } from "../lib/claude.js";

const HITL_THRESHOLD = 0.6;

/**
 * Orchestra il flusso completo con progress callback.
 * @param {object} args
 * @param {object} args.fileMeta   {name, type, size_bytes}
 * @param {object} args.fileData   {kind, raw, preview, rows?}
 * @param {(step:string, status:string, payload?:any)=>void} args.onStep
 * @returns {Promise<object>}
 */
export async function runOrchestrator({ fileMeta, fileData, onStep = () => {} }) {
  const t0 = performance.now();
  const result = { status: "ok", hitl_required: false, hitl_reason: null };

  // 1. Parser
  onStep("parser", "running");
  result.parse = await runParser({ fileMeta, fileData });
  onStep("parser", result.parse.transactions.length ? "done" : "failed", result.parse);
  if (result.parse.parse_quality < HITL_THRESHOLD) {
    result.hitl_required = true;
    result.hitl_reason = "parse_quality_low";
    result.status = "partial";
  }
  if (!result.parse.transactions.length) {
    result.status = "error";
    result.elapsed_ms = Math.round(performance.now() - t0);
    return result;
  }

  // 2. Analyzer
  onStep("analyzer", "running");
  result.analysis = await runAnalyzer({ transactions: result.parse.transactions });
  onStep("analyzer", "done", result.analysis);

  // 3. Simulator + Advisor in parallelo
  onStep("simulator", "running");
  onStep("advisor", "running");
  const history = loadHistory();
  const [sim, adv] = await Promise.all([
    runSimulator({ categories: result.analysis.categories, totals: result.analysis.totals })
      .then(x => { onStep("simulator", "done", x); return x; })
      .catch(e => { onStep("simulator", "failed", { error: String(e) }); return { scenarios: [], disclaimer: "" }; }),
    runAdvisor({ analysis: result.analysis, simulation: {}, history })
      .then(x => { onStep("advisor", "done", x); return x; })
      .catch(e => { onStep("advisor", "failed", { error: String(e) }); return null; }),
  ]);
  result.simulation = sim;
  result.advice = adv;

  // 4. Persistenza
  if (adv?.score != null) updateHistory({ score: adv.score });
  const session = {
    file: fileMeta.name,
    score: adv?.score,
    parse_quality: result.parse.parse_quality,
    row_count: result.parse.transactions.length,
  };
  saveSession(session);

  result.elapsed_ms = Math.round(performance.now() - t0);
  result.tokens_used = tokenStats();
  return result;
}
