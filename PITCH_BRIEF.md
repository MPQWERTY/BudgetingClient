# Budget Storyteller — Pitch Brief

> Web app agentica che trasforma un estratto conto illeggibile in una **storia comprensibile**, un **punteggio di salute finanziaria** e **micro-lezioni personalizzate**. Fatta per il tema *Inclusione Finanziaria* dell'Hagenthon Accenture 2026.

**Live**:
- GitHub Pages (mock): https://mpqwerty.github.io/BudgetingClient/
- Presentazione: https://mpqwerty.github.io/BudgetingClient/presentation/
- Repo: https://github.com/MPQWERTY/BudgetingClient

---

## 1. Il problema

Milioni di persone ogni mese ricevono un estratto conto con sigle criptiche (`ADD.SDD`, `COMM.OP`, `RID.INAIL`) e non capiscono dove finiscono i loro soldi. L'educazione finanziaria disponibile è scritta per chi già capisce di finanza — chi ne ha più bisogno resta escluso.

## 2. La soluzione in una riga

**L'estratto conto smette di essere un mistero: diventa una storia che ti insegna a capirlo.**

L'utente carica un CSV/PDF/XLSX. In ~15 secondi:
- **Racconto** in linguaggio semplice ("Dei tuoi €2400 di stipendio, il 75% è andato a spese essenziali...")
- **Score** 0-100 su 5 dimensioni (reddito / spese / risparmio / emergenza / debito)
- **Micro-lezioni** costruite sulle sue aree deboli reali
- **Chat** con un consulente educativo su termini finanziari
- **Scenari** what-if quantitativi ("se risparmi €50/mese, tra 12 mesi...")

**Vincolo etico non negoziabile**: mai raccomandazioni di prodotti o investimenti. Solo educazione e comprensione.

---

## 3. Come funziona (flusso utente)

```
┌────────────────────────────────────────────────────────┐
│  1. HERO CHAT                                          │
│     L'utente può chattare subito col consulente        │
│     ("cos'è un TAEG?") senza caricare nulla            │
└──────────────────────┬─────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────┐
│  2. UPLOAD (opzionale)                                 │
│     CSV/PDF/XLSX. In alternativa una delle 6 personas  │
│     precaricate nel Playground                         │
└──────────────────────┬─────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────┐
│  3. ANALISI MULTI-AGENT (15 sec)                       │
│     Orchestrator → Parser → Analyzer → Simulator+Advisor│
└──────────────────────┬─────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────┐
│  4. DASHBOARD                                          │
│     Score card + torta categorie + "Ritmo dei tuoi    │
│     soldi" (radar temporale) + storia + scenari +      │
│     mini-lezioni + equivalenti di vita                 │
└──────────────────────┬─────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────┐
│  5. LEZIONE WIZARD                                     │
│     Intro + 2 domande personalizzazione + 3 capitoli   │
│     con quiz+spiegazione + piano d'azione finale       │
└────────────────────────────────────────────────────────┘
```

---

## 4. Architettura: 6 agenti orchestrati

### 4.1 **ORCHESTRATOR** — il direttore
Riceve il file, coordina Parser → Analyzer → Simulator+Advisor, gestisce timeout/retry/escalation HITL, aggrega gli output, persiste la sessione. Unico entry point del frontend.

### 4.2 **PARSER** — legge il file
Normalizza CSV/PDF/XLSX in transazioni JSON strutturate. Riconosce colonne, normalizza date ISO 8601, importi decimali con segno.
- **Fallback deterministico**: PapaParse (CSV), SheetJS (XLSX), pdf.js (PDF)
- **HITL**: se `parse_quality < 0.6` → banner "verifica il file"

### 4.3 **ANALYZER** — categorizza e racconta
Categorizza in tassonomia fissa (housing/food/utilities/transport/entertainment/savings/income/other), calcola aggregati %, genera **narrativa in linguaggio semplice**, rileva anomalie (categorie con spesa >2x la media).
- **Fallback**: dizionario keyword IT+EN unificato — riconosce Esselunga, Enel, TIM, Q8, Netflix anche con UI in inglese

### 4.4 **SIMULATOR** — proiezioni what-if
Genera scenari matematici lineari ("se risparmi €X/mese in Y mesi hai Z"). Cap 4 scenari max, sempre con disclaimer.
- **Non consiglia mai** prodotti — solo aritmetica sulle spese reali

### 4.5 **ADVISOR** — score + lezioni + chat
- **Score 0-100** su 5 dimensioni (income_stability / expense_ratio / savings_rate / emergency_fund / debt_management)
- **Weak-area detection** con reason contestualizzato
- **Mini-lezioni personalizzate** (wizard 7 step: intro + 2 personalizzazione + 3 capitoli quiz + piano d'azione)
- **Chat multi-turn** con banca 17 risposte tematiche in mock mode
- **Vincolo etico hard-coded**: deflect esplicito su richieste di consulenza personalizzata

### 4.6 **STATE MANAGER** — persistenza
`localStorage`: sessioni, storico score, lezioni completate, obiettivi utente, profilo, impostazioni. Export JSON completo per GDPR.

---

## 5. Perché 6 agenti (non 1 monolitico)

Ogni agente ha:
- **Input/output JSON tipizzato** (schema documentato in `agents/*.md`)
- **Fallback deterministico dedicato** → la demo regge anche se Claude va giù
- **Timeout + retry esponenziale** individuali
- **Scope stretto** → prompt più corti, meno hallucination
- **Model tiering**: Haiku 4.5 per task strutturati, Sonnet 4.5 solo per Advisor (~$0.005 per analisi completa)

**Punto chiave da citare al pitch**: i file `agents/*.md` sono **letti a runtime dal frontend come system prompt**. Cioè quello che i giudici leggono nella repo è *letteralmente* il codice che gira. Spec = implementazione. Zero divergenza.

---

## 6. Features live

### Interfaccia principale
- **Chat-first**: dialoga col consulente educativo prima ancora di caricare un file
- **Upload multi-formato**: CSV, PDF, XLSX (drag-drop o click)
- **Dashboard cinematica**: score card con anello SVG animato, torta multi-colore, "Ritmo dei tuoi soldi" (radar temporale per giorno della settimana), narrativa personalizzata, scenari what-if, equivalenti di vita ("€200 in entertainment = 133 caffè al bar")
- **Wizard micro-lezioni**: 7 step con personalizzazione e feedback
- **Menu utente** con 6 sezioni funzionanti

### Playground (via menu → Playground)
- **6 personas** click-to-load con CSV realistici italiani (studente, freelance, coppia, pensionato, millennial, famiglia)
- **3 tour guidati** narrati (Demo Veloce 60s / Demo Tecnica 2min / Demo Etica 90s)
- **Sandbox test** con edge case (file corrotto, 250 righe, formato USA, vuoto)

### Pagine utente complete
- **Profilo**: nome editabile, statistiche, gamification (livello Novizio/Studente/Investitore), obiettivi CRUD, export JSON
- **Impostazioni**: lingua IT/EN, valuta, notifiche, aspetto, privacy, danger zone
- **Storico analisi**: KPI + timeline delle sessioni + export CSV
- **Privacy & data**: cosa memorizziamo (KB per chiave + cancella per chiave) + GDPR 4 diritti
- **Sign out**: conferma elegante con backup opzionale

### Robustezza
- **Mock mode automatico** su hosting statico (GitHub Pages) o esplicito con `?mock=1`
- **Fallback deterministici** per ogni agente
- **Multi-lingua**: auto-detect browser + selettore manuale IT/EN
- **Prefers-reduced-motion** rispettato

---

## 7. Stack tecnico

| Layer | Scelta | Perché |
|---|---|---|
| Frontend | HTML/CSS/JS vanilla, ES modules | Zero build, ispezionabile dai giudici |
| Font | Inter (UI) + Space Grotesk (brand) + Fraunces (titoli emotivi) | Coerenza con la presentazione |
| Backend | Python `http.server` + `requests` (~90 righe) | Un solo file, nasconde la API key |
| LLM | Anthropic Claude (Haiku 4.5 + Sonnet 4.5) | Model tiering costo/qualità |
| Parsing | PapaParse (CSV), SheetJS (XLSX), pdf.js (PDF) | Standard de facto, robusti |
| Charts | Canvas nativo + SVG inline | Nessuna libreria, ~150KB risparmiati |
| Persistenza | `localStorage` | Zero setup, GDPR-friendly |
| Deploy | GitHub Actions → Pages + Vercel serverless | Un push, live in 2 min |

---

## 8. Vincoli etici (Tema 02)

Il tema hackathon **vieta esplicitamente** consulenza personalizzata su investimenti. Rispettato in 3 livelli:

1. **System prompt hard-coded** nell'Advisor: *"Mai suggerire prodotti finanziari specifici, banche, ETF, azioni. Se utente chiede 'cosa investo': deflect a mini-lesson 'Cos'è il rischio finanziario'."*
2. **Deflect testato**: chat "cosa mi conviene comprare, azioni o BTP?" → risposta educativa senza raccomandazione ✓
3. **Disclaimer sempre presente**: ogni output di Advisor include `"Contenuto educativo. Non è consulenza finanziaria personalizzata."`

Inoltre:
- **Nessun dato bancario in cloud**: solo un preview di max 30 righe inviato a Claude per il parsing
- **Nessun account, nessun tracking, nessun cookie di profilazione**
- **Codice sorgente open**: le istruzioni degli agenti sono ispezionabili

---

## 9. Mapping criteri di valutazione (58% top-3)

| # | Criterio | Peso | Come lo copriamo |
|---|---|---|---|
| 1 | **Profondità agentica** | 24% | 6 agenti orchestrati, DAG documentato, JSON strict, orchestrazione con timeout+retry, HITL |
| 2 | **Qualità istruzioni** | 19% | 6 file `.md` uniformi (Role/Input/Output/Fallback/Escalation), letti a runtime come system prompt |
| 3 | **Robustezza** | 15% | Fallback deterministico per ogni agente, mock mode auto, HITL, retry esponenziale, graceful degradation |
| 4 | Efficienza token | 12% | JSON strict, few-shot minimale, chunking >200 righe, model tiering, cache system prompt |
| 5 | Qualità tecnica | 12% | Error handling ovunque, secrets in `.env` gitignored, timeout individuali, mock offline |
| 6 | Adeguatezza tool | 11% | Papa/SheetJS/pdf.js/canvas SVG native, Claude via REST, no bundler |
| 7 | Documentazione | 7% | README + ARCHITECTURE + VALIDATION + PROCESS_NOTE + SPEAKER_NOTES + QA_PREP + DATASETS + DEPLOY + questo file |

---

## 10. Come si presenta (5 min esatti)

Vedi `presentation/SPEAKER_NOTES.md` per lo script word-by-word cronometrato al secondo.

**Arco narrativo dei 5 slide**:
1. **Il dolore** (0:00–1:00) — Fullscreen di un estratto conto reale, illeggibile → titolo "Chi lo capisce, questo?"
2. **La promessa** (1:00–2:00) — "E se invece diventasse *una storia semplice?*"
3. **Il prodotto** (2:00–3:00) — Dashboard 3D con cards fluttuanti in prospettiva
4. **La filosofia** (3:00–4:00) — "Dalle persone, per le persone" + 4 capability (adatta / segue / prevede / semplice)
5. **L'evoluzione** (4:00–5:00) — Timeline dell'utente + CTA "PROVA ORA →"

---

## 11. Contingency (per il pitch)

- **API Anthropic down** → `?mock=1` — la UI resta identica, analizza dati veri con logica deterministica
- **Localhost non parte** → GitHub Pages online, funziona sempre in mock
- **Domanda "quale banca supportate"** → "Qualsiasi, leggiamo CSV/PDF/XLSX standard"
- **Domanda "date consigli"** → "No, per scelta. Deflect esplicito nel system prompt Advisor"

Vedi `docs/QA_PREP.md` per 16 domande giudici probabili con risposte pronte.

---

## 12. Cosa NON abbiamo fatto (limiti dichiarati)

- Nessun OCR su PDF scansionati (solo estrazione testo)
- Nessuna autenticazione multi-utente
- Nessuna integrazione bancaria PSD2 (roadmap beta)
- Nessuna anonimizzazione automatica di IBAN/nomi prima dell'invio a Claude
- Categorizzazione keyword copertura IT+EN (altre lingue via LLM)

---

**Team**: 2 persone · **Durata**: 5h effettive · **Made in Turin**
