# Speaker Notes — Budget Storyteller (5:00 esatti)

Script word-by-word cronometrato. Navigazione: frecce ← →, spazio = avanti.
Ritmo target: ~140 parole/minuto, pause brevi sui punti chiave.

---

## Slide 1 · Il Problema (0:00 – 0:38)

**[Apri con la slide 1 gia' proiettata. Guarda la sala, non lo schermo.]**

> "Buongiorno. Immaginate di ricevere un estratto conto e di non capirlo. Non e' un caso limite: succede a milioni di persone. TAEG, addebiti ricorrenti, sigle di categoria. Chi ha meno strumenti finanziari e' proprio chi paga di piu' questa opacita': commissioni impreviste, abbonamenti dimenticati, debiti che si accumulano.
>
> L'educazione finanziaria oggi e' scritta per chi gia' capisce la finanza. Noi partiamo dal pezzo mancante: **l'inclusione passa dalla comprensione**."

**Enfasi visiva**: al momento di "non capirlo" indica con la mano la parola "non capiscono" in accento rosa sulla slide.

**Cue transizione (0:36)**: premi freccia destra su "comprensione".

---

## Slide 2 · La Soluzione (0:38 – 1:18)

> "Budget Storyteller e' una web app agentica. L'utente carica un file — CSV, PDF o Excel — e in quindici secondi riceve tre cose: un **racconto** in linguaggio semplice di dove vanno i suoi soldi, un **punteggio** di salute finanziaria da zero a cento, e **micro-lezioni** costruite sulle sue aree deboli reali, non generiche.
>
> Poi puo' chiedere in chat 'cos'e' il TAEG?' e riceve risposta piu' una lezione mirata. Un vincolo etico non negoziabile: **mai** consigli d'investimento, **mai** raccomandazioni di prodotto. Solo educazione."

**Enfasi visiva**: indica in sequenza le tre card "Carica / Ascolta / Impara" mentre le nomini.

**Cue transizione (1:16)**: premi freccia destra su "educazione".

---

## Slide 3 · Architettura Agentica (1:18 – 2:25)

> "Sotto il cofano ci sono cinque agenti specializzati, orchestrati. **Parser** estrae le transazioni dal file. **Analyzer** categorizza e produce la narrativa. Poi in parallelo: **Simulator** genera scenari 'e se risparmiassi cinquanta euro al mese', e **Advisor** calcola lo score e sceglie le lezioni. Sopra a tutto un **Orchestrator**, sotto uno **State Manager** che persiste in localStorage.
>
> Tre scelte tecniche che vi chiedo di notare. **Uno**: ogni agente parla JSON tipizzato, mai testo libero. **Due**: ogni agente ha un fallback deterministico — se l'LLM sbaglia o va in timeout, la demo non muore. **Tre**: model tiering, Haiku 4.5 per i task strutturati, Sonnet 5 solo dove serve sintesi. Costo medio di un'analisi completa: **circa mezzo centesimo**.
>
> E soprattutto: le istruzioni degli agenti sono file markdown letti a runtime come system prompt. **Quello che leggete nella repo e' letteralmente quello che gira**."

**Enfasi visiva**: (1:30) indica il box PARSER sullo schema ASCII; (1:45) fai un gesto orizzontale sulla biforcazione SIM/ADVISOR; (2:10) tocca i chip "Haiku 4.5" e "Sonnet 5".

**Cue transizione (2:23)**: premi freccia destra su "quello che gira".

---

## Slide 4 · In Azione (2:25 – 3:45)

> "Vediamolo dal vivo. **[Alt-tab su http://localhost:8000, carica sample_estratto.csv.]** Carico un estratto di venticinque righe. In quindici secondi: score settantadue su cento, breakdown per cinque dimensioni — reddito, spese, risparmio, emergenza, debito. Torta delle categorie disegnata con canvas nativo, zero librerie. Narrativa generata **nella lingua del browser**, in italiano.
>
> **[Clic su una lezione o scrivi in chat 'cos'e' il TAEG?']** Chiedo un termine, ricevo la risposta piu' una micro-lezione con quiz. Tutto lo storico resta in locale, nessun dato bancario in cloud tranne il preview minimo che serve al parser."

**Enfasi visiva**: quando dice "score settantadue" indica il numero grande sullo schermo; quando dice "nessun dato in cloud" torna a fissare la sala.

**Cue transizione (3:43)**: torna al browser della presentazione, premi freccia destra.

### Variante contingency (se demo live salta)

> "Vi mostro gli screenshot del flusso. **[Apri `assets/screenshots/`, tre immagini: upload, dashboard con score, chat con lezione.]** Stesso risultato: quindici secondi, score, narrativa, chat educativa. E se la API Anthropic fosse giu' durante una demo reale, abbiamo la modalita' `?mock=1` con risposte pre-registrate: la UX resta identica, la validazione tecnica pure."

*(Adatta il timing: la variante contingency dura ~55s, quindi rientra nella finestra 2:25–3:45.)*

---

## Slide 5 · Impatto (3:45 – 5:00)

> "Perche' funziona, in quattro punti.
>
> **Uno**: non e' un chatbot travestito. Sono cinque agenti veri, con contratti JSON, orchestrazione parallela, e responsabilita' distinte.
>
> **Due**: rispetta il vincolo del tema. Educazione, mai consulenza. Il deflect e' hard-coded nel prompt dell'Advisor, non e' un'intenzione, e' codice.
>
> **Tre**: e' robusto. Ogni chiamata LLM ha un fallback deterministico dietro. La demo regge anche con Anthropic offline.
>
> **Quattro**: e' trasparente. La spec degli agenti e il codice che gira sono lo **stesso file**. I giudici possono ispezionare la verita' senza fidarsi di noi.
>
> Il nostro target misurabile: **piu' quaranta per cento** di comprensione dei termini finanziari dopo tre mini-lezioni. Un utente che finisce il percorso sa spiegare cos'e' un TAEG, cos'e' un addebito ricorrente, e sa leggere il proprio estratto conto senza aiuto.
>
> Questo e' Budget Storyteller. Grazie."

**Enfasi visiva**: (4:00) tocca il "+40%" gigante; (4:50) tono piu' basso e lento su "Grazie", pausa di due secondi prima di aprire le Q&A.

---

## Checklist pre-pitch (60s prima)

- Browser: due tab — presentazione e app (`localhost:8000`).
- Terminale con `python server.py` gia' attivo, `.env` caricato.
- File `data/sample_estratto.csv` pronto sul desktop.
- Modalita' `?mock=1` testata come piano B (URL gia' negli appunti).
- Cartella `assets/screenshots/` aperta minimizzata per la variante contingency.
- Timer visibile solo a chi parla (telefono in landscape).

## Contingency rapide

- **API Anthropic down** → chiudi il tab app, apri `localhost:8000/?mock=1`, prosegui come da script.
- **Localhost non parte** → passa alla variante screenshot (vedi slide 4).
- **Domanda "quale banca supportate"** → "Qualsiasi banca: leggiamo CSV, PDF ed Excel standard, non serve integrazione."
- **Domanda "date consigli d'investimento"** → "No, per scelta. Educazione e comprensione. Il deflect e' esplicito nel system prompt dell'Advisor."
- **Sforo di tempo su slide 3** → taglia la frase sul model tiering, tieni JSON strict e fallback.
