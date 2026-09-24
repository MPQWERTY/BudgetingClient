# WORKFLOW — Budget Storyteller DAG

## Flusso agentico

```
                    ┌──────────────┐
   FILE UPLOAD ────►│ ORCHESTRATOR │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐    quality<0.6
                    │   PARSER     │──────────────► HITL (chiedi CSV)
                    └──────┬───────┘
                           │ transactions
                           ▼
                    ┌──────────────┐
                    │  ANALYZER    │
                    └──────┬───────┘
                           │ categories + narrative
                     ┌─────┴─────┐
                     ▼           ▼
              ┌───────────┐ ┌──────────┐
              │ SIMULATOR │ │ ADVISOR  │  (paralleli)
              └─────┬─────┘ └────┬─────┘
                    │            │
                    └─────┬──────┘
                          ▼
                  ┌───────────────┐
                  │ STATE MANAGER │ (localStorage)
                  └───────┬───────┘
                          ▼
                  ┌───────────────┐
                  │  FRONTEND UI  │
                  └───────────────┘
```

## Trigger matrix

| Evento | Trigger | Handler |
|--------|---------|---------|
| File caricato | UI → Orchestrator.run(file) | Orchestrator |
| Parse ok | parser.done | Orchestrator → Analyzer |
| Parse quality < 0.6 | parser.done | Orchestrator → UI HITL banner |
| Analyzer ok | analyzer.done | Orchestrator → Promise.all(Simulator, Advisor) |
| User chiede Q&A | UI → Advisor.answer(q) | Advisor (single-shot) |
| User clicca mini-lesson | UI → Advisor.expandLesson(id) | Advisor |
| Utente chiede "cosa investire" | intent detect | Deflect a lesson "risk-101" |

## Fallback matrix

| Agente | Failure | Azione |
|--------|---------|--------|
| Parser LLM | timeout/error | Fallback deterministico (papaparse/SheetJS/pdf.js) |
| Analyzer LLM | timeout | Retry 1x → categorizzazione euristica keyword |
| Simulator | error | Skip (non-blocking) |
| Advisor | error | Retry 1x → score=50 + lesson generica |
| API 429 rate limit | any | Exp. backoff 2s/4s, poi mock mode |
| API 5xx | any | Retry 2x, poi UI toast "Riprova" |

## Token budget per run
- Parser: ~2k in / ~3k out
- Analyzer: ~3k in / ~2k out
- Simulator: ~1k in / ~1k out
- Advisor: ~3k in / ~2k out
- **Totale medio: ~17k token/analisi completa** (~$0.005 con Haiku 4.5)
