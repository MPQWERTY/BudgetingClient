# Dataset di esempio - Budget Storyteller

Riferimento per il team durante la demo hackathon.

## `sample_estratto.csv`
- 25 transazioni, settembre 2026.
- Profilo: proprietario di casa con mutuo, stipendio ~2400 euro.
- Baseline "pulita": mostra il flusso standard parser -> classifier -> narrator.
- Stressa: pipeline end-to-end minima, categorizzazione base.

## `sample_estratto_ampio.csv`
- ~72 transazioni su 2 mesi (agosto + settembre 2026).
- Profilo: single 32enne in affitto in grande citta, stipendio ~2210 euro.
- Copre: stipendio, affitto, bollette (Enel/TIM/Iren), spesa ricorrente (Esselunga/Coop/Lidl), ristoranti, bar, streaming (Netflix/Spotify/Disney+), trasporti (Q8/ATM/Trenitalia/Autostrade), farmacia, palestra, Amazon, bonifici verso risparmio.
- Evento significativo: viaggio a Roma (~660 euro) e riparazione auto (380 euro).
- Stressa: agente insights (individua ricorrenze e abbonamenti), agente anomaly (picchi viaggio/riparazione), narrator multi-periodo, confronto mese-su-mese.

## `sample_estratto_corrotto.csv`
- ~15 righe volutamente malformate: header con caratteri strani, separatori misti (`;` / `|` / ` - `), colonne mancanti o extra, importi con formato errato (`12.99`, `abcxyz`), righe vuote, ordine colonne invertito.
- Stressa: parser robustness, HITL fallback. Deve produrre `parse_quality < 0.6` e triggerare il flusso di conferma utente senza crashare.
- Serve per dimostrare la resilienza del sistema durante il pitch.
