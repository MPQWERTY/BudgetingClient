# Architecture

## Stack scelto e perché
- **Frontend statico HTML + JS vanilla** — zero build, il codice che il giudice legge è quello che gira.
- **Mini server Python (`http.server` + `requests`)** — ~90 righe, unico ruolo: nascondere la API key Anthropic + servire i file. Nessun framework, dipendenze: `requests`, `python-dotenv`.
- **Anthropic Claude** via REST direct: `claude-haiku-4-5-20251001` per parser/analyzer/simulator (velocità + costo), `claude-sonnet-5` per advisor (qualità della sintesi + mini-lezioni).

## Flusso end-to-end

```
Utente ─► Browser ─► /api/upload (client-side reader)
                       │
                       ▼
              Orchestrator.run(fileMeta, fileData)
                       │
                       ▼
                 ┌───────────┐   quality<0.6
                 │  PARSER   │─────────────► HITL banner (chiedi CSV)
                 └─────┬─────┘
                       │ transactions[]
                       ▼
                 ┌───────────┐
                 │ ANALYZER  │  (categories + narrative)
                 └─────┬─────┘
                       │
                 ┌─────┴─────┐   Promise.all
                 ▼           ▼
           ┌─────────┐ ┌─────────┐
           │SIMULATOR│ │ ADVISOR │
           └─────┬───┘ └────┬────┘
                 │          │
                 └────┬─────┘
                      ▼
              State Manager (localStorage)
                      │
                      ▼
              UI Dashboard + Chat Q&A + Lessons
```

## Contratti I/O (JSON schema)

Vedi `agents/*.md` per lo schema completo di ciascun agente. Il campo chiave è la **struttura degli output**: mai testo libero dove serve struttura. Il wrapper `lib/claude.js#extractJson` tollera code fence e testo attorno.

## Robustezza — matrice fallback

| Livello | Trigger | Azione |
|---------|---------|--------|
| Parser LLM fail | timeout/exception/JSON invalido | Parser deterministico (papaparse + normalize date) |
| Parser quality < 0.6 | JSON valido ma bassa confidence | HITL banner, utente conferma |
| Analyzer fail | timeout | Categorizzazione euristica keyword da `lib/i18n.js` |
| Simulator fail | qualsiasi | Skip, non blocca dashboard |
| Advisor fail | timeout | Score 50 + lesson generica "budget basics" |
| API 429 rate limit | qualsiasi | Backoff esponenziale 1s/2s/4s, poi errore chiaro |
| API 5xx | qualsiasi | Retry 2x |
| API key mancante | tutti | 500 dal proxy; UI mostra istruzione di setup |
| Anthropic irraggiungibile | tutti | `?mock=1` attiva risposte pre-registrate |

## Efficienza token
- **Model tiering**: task strutturati → Haiku 4.5 (~$0.001/agente); sintesi + lezioni → Sonnet 5 solo quando necessario.
- **Output JSON strict** riduce verbosità del 40-60% vs testo libero.
- **Few-shot minimale**: 1-2 esempi in ogni prompt, non 5+.
- **Chunking**: se >200 transazioni, batch da 50 nel Parser.
- **System prompt caching**: `loadSystemPrompt()` cachea i `.md` in memoria dopo il primo fetch.
- **Budget medio per analisi completa**: ~17k token I/O totali (~$0.005 con Haiku).

## Qualità tecnica
- Retry con backoff esponenziale nel wrapper `callAgent`.
- Timeout per agente (Parser 30s, Analyzer 25s, Simulator 20s, Advisor 30s).
- `AbortController` sul fetch per hard-kill oltre timeout.
- Secrets in `.env`, mai committati (`.gitignore` esplicito).
- Nessun accoppiamento tra agenti: solo passaggio di JSON.

## Adeguatezza tool
- **Papa Parse** per CSV: robusto su separatori misti (`,` vs `;`), quote, righe vuote.
- **SheetJS** per XLSX: unico standard de facto.
- **pdf.js** per PDF: text extraction pura, no OCR (out of scope per hackathon).
- **Claude via REST**: no SDK per ridurre superficie di dipendenze.
- **Canvas nativo** per la pie chart: nessuna libreria di charting (evita ~150KB di bundle).

## Cosa NON abbiamo fatto (e perché)
- **No database**: `localStorage` basta per prototipo, zero setup.
- **No autenticazione**: single-user demo.
- **No OCR PDF scansionati**: fuori scope 5h.
- **No integrazione bancaria PSD2**: roadmap beta.
- **No mobile responsive spinto**: layout desktop-first per demo giudici.
