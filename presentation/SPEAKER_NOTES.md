# Speaker Notes — Budget Storyteller (5 min)

Timing target: **60 sec per slide**. Frecce ← → per navigare.

## Slide 1 · Il Problema (0:00 – 0:45)
> "Ogni giorno milioni di persone ricevono estratti conto pieni di sigle e importi. Non sanno dove finiscono i soldi, non capiscono cos'è un TAEG, e l'educazione finanziaria disponibile è pensata per chi già capisce di finanza. Ci occupiamo del pezzo mancante: **inclusione tramite comprensione**."

## Slide 2 · La Soluzione (0:45 – 1:30)
> "Budget Storyteller carica il file, lo interpreta con più agenti AI, e restituisce un racconto in linguaggio semplice, un punteggio di salute finanziaria, e micro-lezioni personalizzate sulle aree deboli dell'utente. Non diciamo mai *compra X* o *vendi Y*: solo educazione."

## Slide 3 · Architettura (1:30 – 2:45)
> "Cinque agenti specializzati coordinati da un orchestrator. Parser legge il file, Analyzer categorizza e narra, Simulator produce scenari what-if, Advisor calcola score e propone lezioni, State Manager persiste la sessione. Ogni agente ha input/output JSON tipizzato, timeout, retry, e — se l'LLM fallisce — un **fallback deterministico** che tiene la demo in piedi. Punto chiave: le istruzioni nei file `agents/*.md` sono lette dal frontend come system prompt, quindi **quello che il giudice legge è letteralmente ciò che gira**."

## Slide 4 · In Azione (2:45 – 3:45)
> "In 15 secondi dall'upload vedete: score numerico, breakdown per dimensione, torta delle categorie, narrativa in italiano o inglese secondo il browser, scenari 'e se…', chat che spiega termini e propone lezioni, storico locale. Tutto client-side, nessun dato bancario in cloud."

*(Se demo live: passa a http://localhost:8000, carica sample, mostra flusso.)*

## Slide 5 · Impatto (3:45 – 5:00)
> "L'impatto è misurabile: un utente che completa 3 mini-lezioni riesce a spiegare i termini chiave — target +40% di comprensione. Perché funziona: è agentico vero, non un wrapper; è educativo, non consulenziale; è robusto grazie ai fallback; ed è trasparente perché la spec e il codice degli agenti coincidono. Grazie."

---

## Contingency
- **API Anthropic down** → aggiungi `?mock=1` all'URL, gli agenti rispondono con JSON pre-registrato.
- **Salta la demo live** se il tempo scivola: mostra screenshot in `assets/screenshots/`.
- **Domanda "quale banca supportate"** → "Formato standard CSV/PDF/XLSX, funziona con qualsiasi esportazione."
- **Domanda "date consigli d'investimento"** → "No. Educazione e comprensione. Deflect esplicito nel prompt dell'Advisor."
