# Deploy Budget Storyteller online

Due opzioni: GitHub Pages (pubblica, solo mock) e Vercel (con backend Claude).

## Opzione A · GitHub Pages (già configurato)

Al primo deploy serve UN click su GitHub per attivare Pages:

1. Vai su https://github.com/MPQWERTY/BudgetingClient/settings/pages
2. Sotto "Source" seleziona **GitHub Actions**
3. Alla prossima `git push` il workflow `.github/workflows/deploy-pages.yml` si attiva automaticamente
4. Dopo ~2 min il sito è live su: **https://mpqwerty.github.io/BudgetingClient/**

L'app rileva automaticamente di non essere in localhost e **forza il mock mode** — funziona senza backend, analizza file veri con logica deterministica, chat con banca di 17 risposte pre-scritte tematiche.

La presentazione è disponibile su: **https://mpqwerty.github.io/BudgetingClient/presentation/**

## Opzione B · Vercel (con Claude API reale)

Setup una tantum:

```bash
npm i -g vercel                        # installa CLI
cd budget-storyteller
vercel                                  # deploy interattivo, chiede login
```

Al primo deploy Vercel:
1. Crea un progetto associato al repo
2. Ti dà un URL tipo `budget-storyteller.vercel.app`
3. **Aggiungi la env var**: dashboard Vercel → Project Settings → Environment Variables → aggiungi `ANTHROPIC_API_KEY` con la tua chiave reale
4. Redeploy: `vercel --prod`

Su Vercel l'app usa il proxy serverless (`api/claude.py`) e chiama Claude davvero. Se preferisci restare in mock: aggiungi `?mock=1` all'URL.

## Locale (Claude vero, sviluppo)

```bash
cd budget-storyteller/app
cp .env.example .env  # metti la tua ANTHROPIC_API_KEY
pip install -r requirements.txt
python server.py
```

Apri http://localhost:8000

## Modalità detection automatica

Il file `lib/claude.js` decide autonomamente se usare il mock o chiamare il backend:

- **localhost / 127.0.0.1**: chiama `/api/claude` (backend Python locale)
- **\*.vercel.app / \*.vercel.dev**: chiama `/api/claude` (serverless function)
- **qualsiasi altro dominio** (es. github.io): forza mock
- **query `?mock=1`**: forza mock anche in localhost
