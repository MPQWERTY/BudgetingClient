# Process Note — come abbiamo usato l'AI

## Setup del team
- 2 persone, 5h di finestra effettiva (~4h dopo riunione di kick-off).
- Ambiente: **Claude Code** (Anthropic Opus 4.7) come pair programmer principale.

## Dove l'AI ha fatto il grosso del lavoro
1. **Planning strategico** — Claude ha valutato 3 temi hackathon, prodotto pro/contro, spinto verso Tema 02 come strategicamente vincente sui criteri 1+2+3 (58% del voto).
2. **Scrittura istruzioni agenti** (`agents/*.md`) — template Role/Input/Output/Fallback ripetuto coerentemente su 5 agenti + WORKFLOW.
3. **Scaffolding codice**: server proxy Python, wrapper `claude.js`, 5 agenti JS con fallback deterministici, UI HTML/CSS/JS.
4. **Presentazione HTML** brand Accenture con navigazione keyboard.
5. **Documentazione**: README, ARCHITECTURE, VALIDATION.

## Dove il team (umano) è intervenuto
- **Scelta stack**: rifiutato Flask (over-engineering per demo), rifiutato BYOK con key nel browser (UX pessima). Convergenza su static+mini-proxy Python.
- **Vincolo tematico**: enfasi esplicita "no consulenza personalizzata" — l'AI tendeva a produrre consigli d'investimento nelle prime bozze dell'Advisor. Corretto con istruzione hard nel system prompt.
- **Sample data**: verifica manuale che le 25 transazioni fossero realistiche e riconoscibili dalle euristiche fallback.
- **QA presentazione**: verificato che i 5 slide stiano nei 60s ciascuno.
- **Tempo**: allocazione delle 4h reali, taglio contingency (skip Simulator dettagliato se in ritardo — non attivato).

## Decisioni tecniche chiave
- **JSON strict I/O tra agenti**: elimina ambiguità, riduce token, permette fallback deterministici sostitutivi 1:1.
- **System prompt = file `.md` letto a runtime**: la spec valutata dai giudici è letteralmente il codice che gira. Elimina il rischio "documentazione divergente dal codice".
- **Model tiering**: Haiku 4.5 per task strutturati, Sonnet 5 solo per Advisor (sintesi + mini-lezioni). Bilancia costo/qualità.
- **Mock mode via `?mock=1`**: assicurazione per la demo. Se Anthropic ha rate limit / outage durante il pitch, la demo va comunque.
- **Zero build tool**: nessun webpack/vite. Il codice è leggibile e ispezionabile dai giudici senza tool.

## Limiti riconosciuti
- **Nessun test unitario Python del proxy**: valutato che 40 righe di HTTP passthrough non giustificassero la spesa di tempo.
- **Categorizzazione euristica IT/EN only**: se demo in altra lingua, LLM ok ma fallback povero.
- **Nessuna telemetria costi in produzione**: token accounting è in-memory, non persistente.
- **UX mobile non ottimizzata**: layout grid degrada a colonna singola ma non è responsive-first.
- **HITL banale**: il flag `hitl_required` viene mostrato ma non blocca l'analisi; sarebbe da rafforzare per casi reali.
- **Nessuna anonimizzazione**: nomi/IBAN nel preview vengono inviati a Anthropic. Per produzione servirebbe redazione.

## Prompt engineering — pattern applicati
- Ogni agente ha **schema di output esplicito** nel system prompt → riduce output malformato.
- **"Restituisci SOLO JSON"** ripetuto nell'user message → il wrapper estrae anche in caso di preambolo.
- **Deflect esplicito** per richieste out-of-scope (consulenza investimenti) → istruzione hard-coded nel prompt Advisor.
- **Lingua utente iniettata** dinamicamente nel user message → risposta nella lingua del browser senza cambiare system prompt.
- **Few-shot minimale** (1-2 esempi) → risparmio token, i giudici possono ispezionare i prompt facilmente.

## Cosa faremmo in una v2
- Streaming delle risposte LLM per UX più reattiva.
- Schema JSON validato lato server con pydantic prima di rispondere al client.
- Anonimizzazione automatica di IBAN/nomi prima dell'invio a Anthropic.
- Test di regressione end-to-end (Playwright) sul mock mode.
- Persistenza multi-utente con auth minimale.
