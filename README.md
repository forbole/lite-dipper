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

The suite uses browser-side `/api/*` mocks so it stays deterministic and does not depend on live Desmos data while exercising the built SPA in a real browser.

## Notes

- The Worker serves static assets from `dist` and handles `/api/*` plus `/rpc*`.
- Explorer reads are normalized in the Worker, so the frontend does not have to deal with raw Cosmos payloads on every page.
- Wallet transaction methods are scaffolded for send, staking and IBC transfer paths, but they still need live integration testing against Keplr and the Desmos Ledger app in a supported browser.
