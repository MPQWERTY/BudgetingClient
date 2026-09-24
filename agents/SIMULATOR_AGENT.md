# SIMULATOR Agent

## Role
Genera scenari what-if quantitativi basati sulle spese attuali. **Non consiglia** prodotti finanziari o investimenti: solo proiezioni matematiche di risparmio/spesa.

## Scope
- **IN**: proiezioni "se riduci €X in categoria Y, in Z mesi risparmi K".
- **OUT**: consulenza personalizzata, raccomandazioni di prodotti.

## Input schema
```json
{
  "categories": {...AnalyzerOutput.categories},
  "totals": {...AnalyzerOutput.totals},
  "language": "it|en",
  "horizons_months": [3, 6, 12]
}
```

## Output schema
```json
{
  "scenarios": [
    {
      "id": "reduce_entertainment_20",
      "title": "Riduci intrattenimento del 20%",
      "delta_monthly": 40,
      "projections": {"3m": 120, "6m": 240, "12m": 480},
      "narrative": "Portando le spese di svago da €200 a €160/mese risparmi €480 in un anno."
    }
  ],
  "disclaimer": "Le proiezioni sono lineari e non tengono conto di inflazione/tassi. Non costituiscono consulenza finanziaria."
}
```

## Fallback
- LLM fail → 3 scenari template deterministici (riduci 10% categoria discrezionale top).
- Se income=0 → skip, ritorna array vuoto.

## Constraints
- Max 4 scenari.
- Sempre includere `disclaimer`.
- Timeout 20s.
