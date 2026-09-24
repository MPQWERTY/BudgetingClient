# Q&A Prep — Budget Storyteller

Domande piu' probabili dei giudici, con risposta breve (2-4 frasi) pronta all'uso.
Ordine per categoria; dentro ogni categoria, dalla piu' probabile alla piu' rara.

---

## 1. Tecnica

### 1.1 Perche' un frontend statico invece di un framework moderno (React, Next)?
Perche' il codice che il giudice ispeziona e' esattamente quello che gira: zero build, zero bundling, zero "magia". Un hackathon di cinque ore premia la leggibilita' e la riproducibilita' — con vanilla JS non abbiamo dipendenze da aggiornare ne' pipeline da spiegare. Il mini-proxy Python di novanta righe serve solo a nascondere la API key.

### 1.2 Perche' Claude e non GPT o modelli open source?
Tre motivi concreti: Claude Haiku 4.5 ha il miglior rapporto latenza/costo per output JSON strutturato, che e' il 90% dei nostri task; Sonnet 5 ci da' la qualita' di sintesi che serve nell'Advisor senza cambiare vendor; e l'API REST diretta ci evita l'SDK e le sue dipendenze. Su modelli open source la latenza self-hosted non avrebbe retto la demo in cinque ore.

### 1.3 Perche' proprio cinque agenti e non uno solo con un prompt lungo?
Perche' ogni agente ha una responsabilita' singola con contratto JSON tipizzato, e questo abilita tre cose che un mega-prompt non abilita: fallback deterministici sostitutivi uno a uno, parallelizzazione (Simulator e Advisor girano in `Promise.all`), e model tiering per costo. Un solo prompt lungo avrebbe reso impossibile debuggare quale step ha sbagliato.

### 1.4 Come gestite errori e failure mode?
Matrice di fallback esplicita in `docs/ARCHITECTURE.md`: parser LLM fail → parser deterministico con Papa Parse; analyzer fail → categorizzazione euristica su keyword; simulator fail → skip senza bloccare; advisor fail → score neutro 50 e lezione generica; API 429 → backoff esponenziale 1s/2s/4s; API 5xx → retry 2x; Anthropic irraggiungibile → modalita' `?mock=1` con JSON pre-registrato. Timeout hard per agente via `AbortController`.

### 1.5 Quanto costa un'analisi completa per utente?
Circa **mezzo centesimo di dollaro** per analisi end-to-end: circa 17k token I/O totali, il 70% su Haiku 4.5 (~$0.001 per agente) e il resto su Sonnet 5 per l'Advisor. Con caching del system prompt il costo marginale della seconda analisi dello stesso utente scende ancora. A regime, con 10k analisi al mese siamo sotto i 50 dollari di infra LLM.

### 1.6 Come validate che il JSON in output sia corretto?
Ogni system prompt include lo schema esplicito e la clausola "restituisci SOLO JSON". Il wrapper `lib/claude.js#extractJson` tollera code fence e testo attorno, poi valida i campi obbligatori. Se il JSON e' malformato dopo il retry, scatta il fallback deterministico dell'agente. Per la v2 vorremmo aggiungere validazione Pydantic lato proxy prima di rispondere al client.

---

## 2. Prodotto

### 2.1 Chi e' l'utente target esattamente?
Adulti con **bassa alfabetizzazione finanziaria** che ricevono un estratto conto mensile e non lo leggono: giovani al primo conto, lavoratori senza background finanziario, over 60 con banking digitale nuovo, migranti in fase di inclusione bancaria. Non stiamo parlando a chi gia' usa app di budgeting: quelle assumono che tu sappia leggere una categoria "POS EST" e capirla.

### 2.2 Come si monetizza?
Tre piste, in ordine di realismo: (1) **B2B2C** con banche etiche e cooperative di credito che offrono lo strumento ai correntisti come servizio di educazione — le banche pagano per compliance e engagement; (2) **B2G** con enti pubblici e ONG di inclusione finanziaria; (3) freemium consumer con lezioni avanzate premium. Il prototipo hackathon non vuole vendere: vuole dimostrare che il gap esiste ed e' colmabile.

### 2.3 Come vi differenziate dalle app della mia banca (che gia' categorizza le spese)?
Le app bancarie **mostrano** i dati assumendo che tu li capisca. Noi partiamo dal presupposto opposto: te li **spieghiamo**, con narrativa in linguaggio naturale, glossario integrato in chat, e lezioni sui termini che incontri. E siamo bank-agnostic: qualsiasi CSV/PDF/XLSX, non solo la banca dove hai il conto. E' educazione, non dashboard.

### 2.4 Come state al GDPR e alla privacy dei dati bancari?
Nessun dato viene persistito su nostri server: sessioni e storico stanno in `localStorage` del browser, "Ricomincia" fa wipe. L'unico dato che lascia la macchina e' il preview minimo inviato ad Anthropic per il parsing, coperto dal loro DPA. Per la produzione servirebbe (ed e' in roadmap) **anonimizzazione automatica** di IBAN e nomi prima dell'invio LLM, piu' un banner di consenso esplicito.

### 2.5 Qual e' il valore percepito che spinge un utente a usarlo ogni mese?
Due leve: (1) il **punteggio 0-100** trasforma un dato astratto in qualcosa di gamificabile e confrontabile con te stesso nel tempo; (2) le **micro-lezioni adattive** costruiscono progressione, non una libreria statica. L'obiettivo esplicito e' +40% di comprensione dopo tre lezioni: e' misurabile e onesto.

---

## 3. Etica

### 3.1 Perche' non date consulenza finanziaria personalizzata? Non e' proprio il valore aggiunto?
Per due ragioni. **Legale**: la consulenza finanziaria in Italia e' attivita' regolamentata (albo, MiFID), non puo' farla un prototipo hackathon. **Etica**: dare consigli d'investimento a chi ha bassa alfabetizzazione e' esattamente il rischio di manipolazione che vogliamo evitare. Il deflect e' hard-coded nel system prompt dell'Advisor, non e' un buon proposito.

### 3.2 Come evitate bias nel modello (categorizzazioni sbagliate, giudizi morali sulle spese)?
Zero linguaggio giudicante nei prompt: parliamo di "aree deboli" mai di "spese sbagliate". Le categorie sono neutre e derivate dai merchant, non da inferenze su stile di vita. Sul fronte modello, Claude ha filtri suoi, ma per il nostro caso abbiamo test manuali su transazioni sensibili (sanita', farmacia, gioco) per verificare che la narrativa non moralizzi. In v2 aggiungeremmo un red-team dedicato.

### 3.3 E la sicurezza tecnica dei dati?
API key Anthropic vive solo lato server in `.env`, mai esposta al browser. Il proxy non logga i payload. Nessun database, nessuna telemetria di contenuto. Il rischio residuo e' il preview inviato ad Anthropic in chiaro: mitigabile con l'anonimizzazione in roadmap. Nessun cookie di tracking, nessuna terza parte oltre ad Anthropic.

### 3.4 Human-in-the-loop: c'e' o e' solo un buzzword?
C'e' ma e' **volutamente leggero**. Il Parser emette un `hitl_required=true` quando la confidence del parsing scende sotto 0.6, e mostriamo un banner che chiede all'utente di confermare o ricaricare un CSV pulito. E' una scelta consapevole: bloccare tutto ogni volta rovinerebbe la UX; segnalare senza forzare rispetta l'utente. Per casi reali (importi grandi, anomalie) rafforzeremmo il gate.

---

## 4. Scaling

### 4.1 Come reggerebbe con 10.000 utenti simultanei?
L'architettura attuale non regge: il proxy Python single-thread e' un giocattolo da demo. Il piano e' sostituirlo con **FastAPI + Uvicorn workers dietro nginx**, deploy su container (Fargate o Cloud Run), autoscaling orizzontale sui limiti di rate di Anthropic. Il collo di bottiglia vero non e' il nostro codice ma la quota API: si risolve con account enterprise, prompt caching, e batch API per analisi non real-time.

### 4.2 Integrazione bancaria: PSD2 e Open Banking?
E' la voce numero uno della roadmap beta. L'integrazione via **PSD2 AISP** (aggregatori tipo Tink, Fabrick, TrueLayer) eliminerebbe l'upload manuale e abiliterebbe analisi continue, non snapshot. Il vincolo e' regolatorio: serve licenza AISP o partnership con chi ce l'ha, piu' consenso SCA dell'utente ogni 180 giorni. Tecnicamente il nostro Parser diventerebbe piu' semplice, non piu' complesso.

### 4.3 Mobile: perche' non c'e' e quando arriva?
Il layout attuale e' desktop-first per la demo con i giudici: su mobile degrada a colonna singola ma non e' pensato per touch. Il piano non e' un'app nativa ma **PWA responsive**: stesso codice, media query serie, gesture per lo swipe delle lezioni. Un'app nativa avrebbe senso solo con integrazione PSD2 attiva, per gestire il flusso di consenso e le notifiche.

### 4.4 Come internazionalizzate oltre italiano e inglese?
La lingua dell'utente e' iniettata dinamicamente nel user message, quindi l'LLM risponde gia' in qualsiasi lingua che Claude supporta (decine). Il limite oggi e' il **fallback euristico**: le keyword di categorizzazione sono IT/EN. Per un'espansione seria (spagnolo, francese, arabo) serve espandere `lib/i18n.js` con dizionari localizzati e testare il layout RTL. Costo: giorni, non settimane.

---

## Domande "trappola" — risposte pronte

- **"Ma e' solo un wrapper di Claude, no?"** → "No. Un wrapper e' un prompt e una UI. Qui ci sono cinque agenti con contratti JSON, orchestrazione parallela, fallback deterministici per ogni step, model tiering, e HITL. Rimuovi Claude e la struttura resta: il valore e' nell'orchestrazione."
- **"Cosa avete scritto voi e cosa ha scritto l'AI?"** → "L'AI ha scaffoldato il 70% del codice. Noi abbiamo scelto lo stack, imposto il vincolo etico che l'AI voleva violare nelle prime bozze, verificato il sample data, e cronometrato la demo. Dettagli in `docs/PROCESS_NOTE.md`."
- **"Il vostro score come lo validate?"** → "Oggi e' euristico su cinque dimensioni pesate. Non e' validato clinicamente: e' uno strumento di autoconsapevolezza, non una diagnosi. In v2 vorremmo calibrarlo su un panel di utenti reali con misura pre/post lezioni."
