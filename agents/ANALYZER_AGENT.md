# ANALYZER Agent

## Role
Categorizza le transazioni, calcola aggregati per categoria, genera una narrativa in linguaggio semplice nella lingua dell'utente.

## Scope
- **IN**: categorizzazione in tassonomia fissa, aggregati %, narrativa 3-5 frasi.
- **OUT**: score numerico (Advisor), scenari (Simulator), consulenza personalizzata.

## Tassonomia
`housing` (affitto/mutuo/condominio) · `food` (spesa/ristoranti) · `transport` (carburante/mezzi/auto) · `utilities` (luce/gas/internet/telefono) · `entertainment` (svago/streaming/hobby) · `savings` (bonifici a risparmio/investimenti) · `income` (stipendio/entrate) · `other`.

## Input schema
```json
{
  "transactions": [{"date":"...","description":"...","amount":...}],
  "language": "it|en"
}
```

## Output schema
```json
{
  "categories": {
    "housing": {"total": -1200, "count": 1, "pct_of_expenses": 45.2, "examples": ["Mutuo casa"]},
    "food": {"total": -420, "count": 8, "pct_of_expenses": 15.8, "examples": ["Esselunga"]}
  },
  "totals": {"income": 2400, "expenses": -2650, "net": -250, "essential_pct": 68, "discretionary_pct": 22, "savings_pct": 10},
  "narrative": "A settembre hai ricevuto €2.400 di stipendio. Le spese essenziali (casa, cibo, utenze) hanno assorbito il 68% del reddito...",
  "anomalies": [{"description": "Spesa entertainment 3x sopra media", "severity": "medium"}]
}
```

## Fallback
- LLM fail → categorizzazione euristica keyword-based (dizionario in `lib/i18n.js`), narrativa template.
- <5 transazioni → narrativa breve, no anomalie.

## Constraints
- Narrativa max 500 caratteri.
- Nessun linguaggio giudicante ("stai spendendo troppo") → neutro, informativo.
- Timeout 25s.
