# SellerOS

A local-first **Business Operating System** for e-commerce, F-commerce and online sellers.

SellerOS turns raw business data into understanding, decisions and action. It connects products,
inventory, purchasing, orders, customers, suppliers, couriers, payments, returns, damages,
expenses and advertising — then computes the truth that actually matters: real profit, real cash,
and what to do next.

**DATA → UNDERSTANDING → DECISION → ACTION**

## What makes it different

- **Profit is never `price − buying price`.** Every order walks the full cost chain: landed unit
  cost → COGS → fulfilment (courier + packaging) → payment fees → returns & damages → allocated ad
  spend → operating expenses. Contribution and net profit are always shown separately, so a "sale"
  that loses money is never hidden.
- **Cash ≠ profit.** Receivables, payables, pending COD, pending settlement and inventory value are
  tracked as distinct positions, alongside the closing cash balance.
- **Advertising is a first-class module.** Meta, Google (including Performance Max / Demand Gen)
  and TikTok (including Smart+ creative × text × enhancement) are supported with a full funnel, an
  explainable health score, a decision engine (SCALE / MAINTAIN / TEST / REDUCE / PAUSE / OBSERVE)
  guarded by configurable scaling limits, and budget & price simulators.
- **Honest intelligence.** Break-even never shows infinity — when the contribution margin is zero
  or negative it says why. When a sample is too small to trust, SellerOS says
  *"Not enough data to make a confident recommendation"* instead of inventing a number.
- **Local-first and offline.** Everything lives in your browser (IndexedDB). Nothing is sent to a
  server; there is no account, no tracking, no analytics.

## Getting started

```bash
npm install
npm run dev        # local development
```

Production:

```bash
npm run qa         # typecheck + lint + test + build
npm run build
npm run preview    # serve the production bundle locally
```

On first run SellerOS asks a few setup questions (business name, currency, timezone) and offers an
optional, clearly-labelled demo dataset you can load to explore. You can start completely empty and
enter or import your own data instead.

## Data & privacy

- All records are stored in your browser via IndexedDB. SellerOS works fully offline and installs
  as a PWA.
- There is no backend, no account, and no telemetry. Your data never leaves your device.
- Manual entry and CSV import are the supported ways to bring data in; the schema is designed so a
  real platform API can be connected later without breaking anything.
- Backups export a single JSON file you own. Scoped resets always take an automatic backup first
  and never delete the business workspace itself.

## Deployment

Pushing to `main` builds the static bundle and publishes it to **GitHub Pages** via
`.github/workflows/deploy.yml`. The build uses a relative base, so the bundle also runs from any
subpath or custom domain.

## Stack

React · TypeScript · Vite · IndexedDB (Dexie) · PWA service worker · Recharts · modern CSS.

Business logic is centralised in pure, tested modules under `src/domain/` and `src/lib/`; UI
components only render what those modules compute.

## License

MIT — see the license note in the app's About section.
