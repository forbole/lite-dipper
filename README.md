# Lite-Dipper

Lite-Dipper is a lightweight frontend-first Desmos explorer built with React, Vite and Cloudflare Workers.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Cloudflare Worker for public-page rendering, API aggregation, caching and RPC proxying
- Keplr and Ledger wallet abstractions

## Desmos Defaults

- Chain ID: `desmos-mainnet`
- Token denom: `udsm`
- Token display: `DSM`
- Exponent: `6`
- RPC: `https://rpc.mainnet.desmos.network:443`
- REST: `https://api.mainnet.desmos.network`
- Osmosis IBC channel: `channel-2`

The `DESMOS_GRPC_URL` variable is included in the config, but the current scaffold does not execute native browser-side gRPC calls. For a web app on Cloudflare, gRPC usually needs a gRPC-web or Connect-compatible bridge before it is practical in the browser.

## Scripts

- `pnpm dev`: run the Vite frontend
- `pnpm build`: typecheck and build the browser assets
- `pnpm preview`: build and serve the frontend, Worker API and RPC proxy at `http://127.0.0.1:4173` using live Desmos data
- `pnpm test:e2e`: build the SPA and run Playwright smoke tests
- `pnpm test:e2e:headed`: run the same E2E suite in headed mode
- `pnpm worker:dev`: run the Worker locally
- `pnpm deploy`: build and deploy the Worker plus static assets

Use `pnpm preview` to review the app locally with live validators, profiles and wallet data. Vite alone serves the frontend without the `/api/*` or `/rpc` handlers. The `preview:e2e` script remains a static Vite preview for tests that mock those endpoints.

## E2E Testing

The app includes a Playwright regression suite under `tests/e2e`.

Run it locally with:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The suite mocks `/api/*` and the direct Desmos governance REST requests so it stays deterministic. SEO tests also invoke the real Worker with mocked upstream services, exercise server-rendered pages with JavaScript disabled, and verify hydration, metadata navigation, error statuses, crawler files and safe serialization of untrusted chain data.

## Search and crawler support

The Worker renders the existing React public pages into the initial HTML using RPC and REST queries. React hydrates that HTML for client navigation and polling. This adds no database or transaction indexer. The wallet initially renders disconnected; wallet connections and signing stay in the browser.

Every public route has a title, description, canonical URL, Open Graph/Twitter tags and WebSite/WebPage structured data. Validator and proposal metadata use their actual content. Canonicals always use `https://lite.desmos.network`; change `SITE_ORIGIN` and the public crawler files together when changing the production domain. Wallet pages and non-production HTML responses are marked `noindex`.

Unknown routes and missing records return HTTP 404. Unavailable upstream data returns HTTP 503 with `Retry-After`, without caching the error as a successful page. Static asset fallback is disabled so missing assets do not become soft 404s. Trailing slashes and lowercase transaction hashes redirect to their canonical routes. Public HTML is cached for 30 seconds, and wallet HTML is never cached.

`/robots.txt` points to `/sitemap.xml`. The sitemap includes public entry pages, active validators, the latest 20 proposals, recent blocks and recent transactions. It is an entry point, not a complete chain archive; normal links, including block pagination, support further discovery.

`/llms.txt` is an optional concise guide linking to `/docs/explorer.md` and public entry pages. It contains stable documentation rather than live balances or tallies. A duplicate `llms-full.txt` is intentionally omitted because the documentation is short and already directly linked. Neither file is an SEO requirement: [Google's AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) says no new AI-specific text files are needed. The optional guide follows the [llms.txt proposal](https://llmstxt.org/).

Use `pnpm preview` to verify the complete rendering path. Vite alone only serves the browser app. `pnpm exec wrangler deploy --dry-run` checks the Worker bundle without deploying it.

## Governance without an indexer

Proposal list and detail pages query `DESMOS_CHAIN.restUrl` directly from the browser. Initial server-rendered HTML uses the same normalization code against the Worker's `DESMOS_REST_URL`. They also work with static SPA hosting, without initial HTML rendering. Governance state reads do not require transaction indexing. The REST endpoint must allow browser requests through CORS; the default Desmos mainnet API does.

- Latest 20 proposals: `/cosmos/gov/v1/proposals?pagination.limit=20&pagination.reverse=true`
- Proposal status and stored final result: `/cosmos/gov/v1/proposals/{id}`
- Live, stake-weighted result during voting: `/cosmos/gov/v1/proposals/{id}/tally`
- Current bonded voting power during voting: `/cosmos/staking/v1beta1/pool` (`bonded_tokens`)
- Current voting thresholds: `/cosmos/gov/v1/params/tallying`

Both views refresh every 30 seconds. Details also offer manual refresh and refresh after a successful vote. Active proposals always query `/tally`, because `final_tally_result` is a zero-filled placeholder until voting finishes. Completed proposals use the stored final result. Tally amounts and percentages use exact integer arithmetic, with amounts displayed in DSM and percentages rounded to two decimals. Each option shows its share of total voted power, including abstentions.

During voting, each option also shows `option power / bonded_tokens × 100`, and participation is `total voted power / bonded_tokens × 100`. The live tally, pool and thresholds are queried together on each refresh; these are current estimates, not a snapshot pinned to one block. Color-coded bars show participation against quorum, Yes support among non-abstaining votes, and veto power among all votes cast. The current status follows the [Desmos SDK tally rules](https://github.com/desmos-labs/cosmos-sdk/blob/v0.47.10-desmos/x/gov/keeper/tally.go): participation must meet or exceed quorum, Yes must strictly exceed the approval threshold, and veto blocks passage only strictly above its threshold. All-abstain tallies cannot pass. Comparisons use unrounded integer ratios; the chain determines the final outcome.

If bonded power is unavailable, malformed or zero, the tally remains visible while bonded percentages are unavailable. Missing or invalid voting thresholds leave the passing status unavailable without defaulting to assumed values. Completed proposals omit these live indicators because their final tally does not include the bonded total at voting end; using today's pool would misrepresent historical participation. Unavailable tallies and stale refreshes are shown explicitly.

Below the vote actions, recent vote transactions come from `/cosmos/tx/v1beta1/txs` with `events=proposal_vote.proposal_id='{id}'`, `order_by=2`, `page=1`, and `limit=10`. The numeric order enum is required by Desmos's REST gateway. This uses the connected node's existing transaction index, with no separate indexer, database or new Worker API. Missing or disabled transaction search leaves only this optional section unavailable; the tally still works. Initial HTML gives this optional request a two-second timeout.

The list links transactions, voters and blocks, supports v1/v1beta1 standard and weighted votes (including authz-wrapped votes), and filters decoded messages to the requested proposal. At most three matching vote messages are previewed per transaction to keep multi-message transactions compact. The list refreshes every 30 seconds, on manual refresh and after a successful vote. These are recent submissions, not current ballots or voting-power totals; voters may vote again and the node may not retain a complete history. Other explorer views and wallet RPC proxying still use the existing Worker.

## Notes

- The Worker renders public routes, serves static assets from `dist`, and handles `/api/*` plus `/rpc*`.
- Governance normalization is shared by the browser and Worker; other explorer reads are normalized in the Worker.
- Wallet transaction methods are scaffolded for send, staking and IBC transfer paths, but they still need live integration testing against Keplr and the Desmos Ledger app in a supported browser.
