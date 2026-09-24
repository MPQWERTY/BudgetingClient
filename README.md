# Budget Storyteller

> Web app agentica che trasforma un estratto conto confuso in una **storia comprensibile**, un **punteggio di salute finanziaria** e **micro-lezioni personalizzate**. Consegna Hagenthon 2026 — Tema 02 Inclusione Finanziaria.

## In 30 secondi

Un utente con bassa alfabetizzazione finanziaria carica un CSV/PDF/XLSX del suo estratto conto. **5 agenti** orchestrati (Parser → Analyzer → Simulator + Advisor → State) lo interpretano, generano una narrativa in linguaggio semplice, calcolano uno score 0-100 e propongono micro-lezioni sulle aree deboli. L'utente può poi chiedere in chat "cos'è il TAEG?" e ricevere risposta + lezione mirata.

**Vincolo tematico rispettato**: mai raccomandazioni di prodotti o investimenti. Solo educazione e comprensione.

## Quick start

```bash
cd app
pip install -r requirements.txt
cp .env.example .env      # inserisci la tua ANTHROPIC_API_KEY
python server.py
```

Apri http://localhost:8000, carica `data/sample_estratto.csv` (o clicca "Prova con il file di esempio").

### Modalità demo senza API key
Aggiungi `?mock=1` all'URL: gli agenti rispondono con JSON pre-registrato. Utile per validare l'UI o per demo offline.

### Test
Apri http://localhost:8000/tests/smoke.html?mock=1 → tutti gli assert verdi.

## Struttura

```
budget-storyteller/
├── app/                       # soluzione funzionante
│   ├── server.py              # mini proxy Python (nasconde la API key)
│   ├── requirements.txt
│   ├── .env.example
│   └── static/                # frontend statico
│       ├── index.html
│       ├── styles.css
│       ├── main.js
│       ├── agents/            # 5 sub-agenti + orchestrator + state
│       ├── lib/               # claude wrapper, i18n, file readers
│       ├── data/              # sample_estratto.csv
│       └── tests/smoke.html   # test in-browser
├── agents/                    # istruzioni agenti (system prompts)
│   ├── ORCHESTRATOR.md
│   ├── PARSER_AGENT.md
│   ├── ANALYZER_AGENT.md
│   ├── SIMULATOR_AGENT.md
│   ├── ADVISOR_AGENT.md
│   └── WORKFLOW.md
├── presentation/              # pitch 5 min HTML brand Accenture
│   ├── index.html
│   ├── css/accenture-brand.css
│   └── SPEAKER_NOTES.md
└── docs/
    ├── ARCHITECTURE.md
    ├── VALIDATION.md
    ├── PROCESS_NOTE.md
    └── SETUP.md
```

## Mapping criteri di valutazione

| # | Criterio | Peso | Dove |
|---|----------|------|------|
| 1 | Profondità agentica | 24% | 5 agenti in `app/static/agents/`, DAG in `agents/WORKFLOW.md`, orchestrazione parallela |
| 2 | Qualità istruzioni | 19% | 6 file `.md` in `agents/` con Role/Input/Output/Fallback strutturati |
| 3 | Robustezza | 15% | fallback deterministici per ogni agente, HITL su parse quality, timeout+retry |
| 4 | Efficienza token | 12% | output JSON strict, few-shot minimo, model tiering (Haiku 4.5 vs Sonnet 5), chunking 200+ righe |
| 5 | Qualità tecnica | 12% | error handling, timeout, retry con backoff, .env, mock mode per demo |
| 6 | Adeguatezza tool | 11% | Papa/SheetJS/pdf.js per parsing, Claude per reasoning, canvas per pie |
| 7 | Documentazione | 7% | README + ARCHITECTURE + VALIDATION + PROCESS_NOTE + SPEAKER_NOTES |
| 8 | Qualità idea | 0% | problema reale, multi-agente giustificato, vincolo etico esplicito |

## Idea in una riga
**L'estratto conto smette di essere un mistero; diventa una storia che ti insegna a capirlo.**

## Feature live vs beta

**Live (Day 1)**: upload CSV/PDF/XLSX · parsing agentico + fallback · categorizzazione + narrativa · score 0-100 · scenari what-if · chat Q&A · mini-lezioni con quiz · storico locale · lingua auto-detect.

**Beta roadmap**: previsioni forecasting · integrazione API bancarie (PSD2) · gamification (challenge/badge) · export PDF report · mobile app · advisor conversazionale con memoria estesa.

## Sicurezza & privacy
- Nessun dato bancario lascia la macchina dell'utente **eccetto** il preview inviato a Anthropic per il parsing.
- API key Anthropic vive solo lato server (`.env`), mai nel browser.
- Storico e sessioni in `localStorage`, wipe con "Ricomincia".

## Licenza & attribution
Prototipo hackathon. Non pronto per produzione.
