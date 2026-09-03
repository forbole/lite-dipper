# Lite-Dipper

Lite-Dipper is a lightweight frontend-first Desmos explorer built with React, Vite and Cloudflare Workers.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Cloudflare Worker for API aggregation, caching and RPC proxying
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
- `pnpm build`: typecheck and build the SPA
- `pnpm test:e2e`: build the SPA and run Playwright smoke tests
- `pnpm test:e2e:headed`: run the same E2E suite in headed mode
- `pnpm worker:dev`: run the Worker locally
- `pnpm deploy`: build and deploy the Worker plus static assets

## E2E Testing

The SPA now includes a Playwright smoke suite under `tests/e2e`.

Run it locally with:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The suite mocks `/api/*` and the direct Desmos governance REST requests so it stays deterministic and does not depend on live Desmos data while exercising the built SPA in a real browser.

## Governance without an indexer

Proposal list and detail pages query `DESMOS_CHAIN.restUrl` directly from the browser. They work with static SPA hosting and do not use a Worker or transaction indexer for governance reads. The REST endpoint must allow browser requests through CORS; the default Desmos mainnet API does.

- Latest 20 proposals: `/cosmos/gov/v1/proposals?pagination.limit=20&pagination.reverse=true`
- Proposal status and stored final result: `/cosmos/gov/v1/proposals/{id}`
- Live, stake-weighted result during voting: `/cosmos/gov/v1/proposals/{id}/tally`

Both views refresh every 30 seconds. Details also offer manual refresh and refresh after a successful vote. Active proposals always query `/tally`, because `final_tally_result` is a zero-filled placeholder until voting finishes. Completed proposals use the stored final result. Tally amounts are displayed in DSM with exact integer arithmetic; percentages are shares of total voted power including abstentions, not turnout or pass/fail predictions. Unavailable tallies and stale refreshes are shown explicitly.

These are governance state queries, so transaction search/indexing is unnecessary. This does not provide a historical vote-change timeline. Other explorer views and wallet RPC proxying still use the existing Worker.

## Notes

- The Worker serves static assets from `dist` and handles `/api/*` plus `/rpc*`.
- Governance reads are normalized in the frontend; other explorer reads are normalized in the Worker.
- Wallet transaction methods are scaffolded for send, staking and IBC transfer paths, but they still need live integration testing against Keplr and the Desmos Ledger app in a supported browser.
