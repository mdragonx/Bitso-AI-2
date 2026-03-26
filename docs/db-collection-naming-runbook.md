# DB Collection Naming Runbook

## Canonical collection names

The application uses explicit snake_case collection names for trading-domain models:

- `risk_settings` (model: `RiskSetting`)
- `trade_signals` (model: `TradeSignal`)

Legacy naming variants can appear in older environments due to implicit Mongoose pluralization:

- `risksettings`, `RiskSetting`, `riskSettings`
- `tradesignals`, `TradeSignal`, `tradeSignals`

## Migration (merge + de-duplicate)

Use the canonical migration script to merge data from legacy variants into canonical collections and deduplicate records.

### Dry run

```bash
npm run migrate:collections:dry-run
```

### Apply

```bash
npm run migrate:collections
```

What the migration does:

1. Reads from canonical + legacy variant collections.
2. De-duplicates records by stable business keys:
   - `RiskSetting`: `owner_user_id + timestamp`
   - `TradeSignal`: `owner_user_id + pair + signal_type + timestamp`
3. Rewrites canonical collections with the deduplicated set.
4. Drops legacy variant collections after a successful apply run.

## Startup drift detection

On startup, database health checks log a warning if both canonical and legacy variants coexist. This is a drift signal that migration is still required.

Example warning prefix:

- `[db-health] collection naming drift detected ...`

## Operational policy

- DB admin scripts and manual queries should target canonical names only.
- Do not create or write to legacy variant collections.
- If drift warnings appear, run the migration and verify legacy collections are removed.
