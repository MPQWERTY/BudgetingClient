# Setup

## Requisiti
- Python 3.9+
- pip
- Una API key Anthropic ([console.anthropic.com](https://console.anthropic.com))
- Un browser moderno (Chrome/Edge/Firefox)

## Installazione

```bash
git clone <this-repo>
cd budget-storyteller/app
pip install -r requirements.txt
cp .env.example .env
# Modifica .env: ANTHROPIC_API_KEY=sk-ant-...
python server.py
```

Apri http://localhost:8000.

## Modalità demo senza key
Aggiungi `?mock=1` all'URL: gli agenti rispondono con dati pre-registrati.

## Cambio porta
Modifica `.env`:
```
PORT=9000
```

## Modelli usati
- `claude-haiku-4-5-20251001` — parser, analyzer, simulator, chat Q&A
- `claude-sonnet-5` — advisor (scoring + mini-lezioni)

Modificabili in `app/static/lib/claude.js` (`MODELS`).

## Troubleshooting
- **500 "ANTHROPIC_API_KEY non configurata"**: verifica che `.env` esista in `app/` e contenga la chiave valida.
- **Agenti restano su "in corso"**: apri devtools → Network → cerca `/api/claude` per lo status. Prova `?mock=1`.
- **PDF non parsato**: se è scansione (immagini), non c'è OCR. Esporta come CSV dal tuo home banking.
- **CORS su fetch `/agents/*.md`**: succede solo se apri `index.html` da `file://`. Usa sempre `python server.py`.
