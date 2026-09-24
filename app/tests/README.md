# Tests — Budget Storyteller server

Unit test per `app/server.py` (route statiche, `/agents/*.md`, proxy
`/api/claude`). Non avviano un server HTTP reale: costruiscono il
`Handler` in memoria e ispezionano ciò che viene scritto su `wfile`.

## Setup

```bash
pip install -r app/requirements.txt
pip install pytest requests-mock
```

`requests-mock` è opzionale (i test usano `unittest.mock`), ma è
elencato in `requirements.txt` per coerenza con la richiesta.

## Esecuzione

```bash
cd app
python -m pytest tests/ -v
```

Non serve una `ANTHROPIC_API_KEY` reale: il test dedicato controlla il
comportamento in sua assenza, gli altri usano un valore fittizio o
patchano `requests.post`.

## Cosa coprono

- `test_env_loading` — import pulito + `main()` non blocca.
- `test_mime_extensions` — mappa MIME custom (js/mjs/svg).
- `test_agents_md_route_*` — GET `/agents/PARSER_AGENT.md` → 200, file
  inesistente → 404.
- `test_agents_js_not_intercepted` — `/agents/*.js` passa al super.
- `test_api_claude_missing_key` — 500 se manca `ANTHROPIC_API_KEY`.
- `test_api_claude_bad_json` — 400 su body non JSON.
- `test_api_claude_wrong_path_404` — POST fuori route → 404.
- `test_api_claude_forwards_body` — body Anthropic ben formato,
  header `x-api-key` e `anthropic-version` corretti.
