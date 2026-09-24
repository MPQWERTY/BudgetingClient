# Validation

## Cosa abbiamo testato

### 1. Smoke tests in-browser
File: `app/static/tests/smoke.html?mock=1`

Copertura:
- Utility `extractJson` (blocchi fenced, testo nudo, array, JSON invalido).
- Detect lingua browser.
- Dizionario keyword categorie completo per IT.
- Orchestrator end-to-end con mock mode: parser → analyzer → simulator + advisor.
- Score in range [0, 100].
- Sequence step corretta.

Run:
```bash
python app/server.py
# apri http://localhost:8000/tests/smoke.html?mock=1
```

Risultato atteso: **10/10 pass** su Chromium recente.

### 2. Integration test end-to-end (sample dataset)
Dataset: `app/static/data/sample_estratto.csv` — 25 transazioni realistiche settembre 2026, formato bancario italiano (`;` separator, importi con virgola decimale).

Passi manuali:
1. Avvio server con API key valida.
2. Click "Prova con il file di esempio".
3. Verifica: i 4 agenti si accendono in sequenza (parser → analyzer → simulator||advisor).
4. Dashboard mostra: score, pie chart, narrativa in italiano, 2-4 scenari, 1+ mini-lesson.
5. Chat "Cosa significa TAEG?" → risposta comprensibile + eventuale lezione proposta.
6. Ricarica pagina → storico persiste in localStorage.
7. Modalità `?mock=1` → tutto funziona senza API key.

### 3. Test di robustezza (fallback)
- **File corrotto**: caricato un `.csv` con colonne mancanti → Parser LLM fallisce → fallback deterministico non trova header → `parse_quality=0` → HITL banner visibile.
- **API key mancante**: server risponde 500 → UI mostra errore chiaro nel chat log.
- **Timeout simulato**: `?mock=1` con rallentamento → retry visibile in devtools network.

## Metriche osservate (baseline demo)
| Metrica | Valore tipico |
|---------|---------------|
| Parse time (25 righe CSV) | ~1.5s (LLM) / <100ms (fallback) |
| Analyzer time | ~2s |
| Simulator time | ~1.5s |
| Advisor time | ~3s (Sonnet 5) |
| **End-to-end** (upload → dashboard) | **~8-10s** |
| Token totali per run | ~15-18k I/O |
| Costo stimato per run | ~$0.005 |

## Vincolo tematico verificato
- L'Advisor system prompt (`agents/ADVISOR_AGENT.md`) contiene istruzione esplicita: *"Mai suggerire prodotti finanziari specifici, banche, ETF, azioni. Se utente chiede 'cosa investo': deflect a mini-lesson 'Cos'è il rischio finanziario'."*
- Test manuale: chat "cosa mi conviene comprare, azioni o BTP?" → risposta educativa senza raccomandazione ✓
- Ogni output di Advisor include il disclaimer esplicito.

## Screenshots
Cartella: `presentation/assets/screenshots/`
- `01-upload.png` — landing con dropzone
- `02-agents.png` — 4 agenti attivi (dot pulsanti)
- `03-dashboard.png` — score + pie + narrativa
- `04-chat.png` — Q&A su TAEG
- `05-lesson.png` — modal mini-lezione con quiz

*Screenshot da catturare in fase demo con il team.*

## Limiti noti
- PDF scansionati (immagini) non parsati: manca OCR.
- Nessuna validazione formale sullo schema JSON degli agenti (parsing tollerante).
- Categorizzazione euristica ha copertura solo IT/EN.
- Nessun rate limit lato client — se l'utente spamma upload si può saturare la key.
