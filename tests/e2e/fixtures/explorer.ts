import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type workerType from "../../../worker/index";

export const OPERATOR = "desmosvaloper17lca9smrdlwkznr92hypzrgsjkelnxeaacgrwq";
export const ACCOUNT = "desmos17lca9smrdlwkznr92hypzrgsjkelnxear4qhyj";
export const IDENTITY = "TESTKEYBASE";
export const CONSENSUS = createHash("sha256").update(Buffer.alloc(32, 1)).digest("hex").slice(0, 40).toUpperCase();
export const UNKNOWN_CONSENSUS = "FF".repeat(20);
export const INACTIVE_OPERATOR = "desmosvaloper1gupgnsfgvs08watwtfdl4a5r9589cus3f36mhz";
export const INACTIVE_ACCOUNT = "desmos1gupgnsfgvs08watwtfdl4a5r9589cus3huj0as";
const STAKING_VALIDATOR = {
  operator_address: OPERATOR, consensus_pubkey: { key: Buffer.alloc(32, 1).toString("base64") },
  description: { moniker: "Staking name", identity: IDENTITY, details: "Original staking description.",
    website: "https://validator.example", security_contact: "security@validator.example" },
  status: "BOND_STATUS_BONDED", jailed: false, tokens: "12345000000",
  commission: { commission_rates: { rate: "0.05" } }
};
export const PROFILE = {
  "@type": "/desmos.profiles.v3.Profile",
  account: { "@type": "/cosmos.auth.v1beta1.BaseAccount", address: ACCOUNT },
  dtag: "apollo", nickname: "Apollo Community", bio: "An on-chain validator profile.\nSupporting the Desmos community.",
  pictures: { profile: "https://profile-images.test/avatar.svg", cover: "https://profile-images.test/cover.svg" },
  creation_date: "2021-11-02T16:58:41.653318881Z"
};
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="#155e75"/><circle cx="400" cy="100" r="70" fill="#38bdf8"/></svg>';

export const TX_HASH = "AB".repeat(32);
export const PROPOSAL = { id: "51", title: "Community funding", summary: "Support public infrastructure.",
  status: "PROPOSAL_STATUS_PASSED", submit_time: "2026-08-01T12:00:00Z", voting_end_time: "2026-08-08T12:00:00Z",
  final_tally_result: { yes_count: "9000000", no_count: "1000000", abstain_count: "0", no_with_veto_count: "0" }, messages: [] };

type ProfileApi = {
  serveDocuments: boolean;
  unavailable: boolean;
  rpcError?: boolean;
  transaction?: unknown;
  delegationAddresses?: string[];
  validatorResponses?: Record<string, { validator?: unknown; status?: number }>;
  latestHeight: number;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  profile: unknown;
  status: number;
  brokenImages: boolean;
  requests: string[];
  profileReady?: Promise<void>;
};

export const test = base.extend<{ profileApi: ProfileApi }>({
  profileApi: async ({ page }, use) => {
    // Playwright transforms JSX into component-test objects. Import a real
    // production React bundle so these tests exercise the Worker's SSR path.
    const worker: typeof workerType = (await import("../../../node_modules/.cache/lite-dipper-test-worker/worker.mjs")).default;
    const state: ProfileApi = { profile: structuredClone(PROFILE), status: 200, brokenImages: false, requests: [], serveDocuments: false, unavailable: false, latestHeight: 3, request: async () => new Response() };
    const originalFetch = globalThis.fetch;
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
    Object.defineProperty(globalThis, "caches", { configurable: true, value: {
      open: async () => ({ match: async () => undefined, put: async () => {} })
    } });
    // Keep the real validator normalization and account derivation in the path.
    // Only replace the public REST service and Keybase lookup.
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://keybase.io") return Response.json({ them: [{
        basics: { username: "staking-name" }, pictures: { primary: { url: "https://profile-images.test/keybase.svg" } }
      }] });
      if (url.origin !== "https://validator-rest.test") throw new Error(`Unexpected upstream: ${url}`);
      state.requests.push(url.pathname);
      if (state.rpcError && ["/status", "/tx_search"].includes(url.pathname)) return Response.json({ error: { code: -32603, message: "Internal error" } });
      if (state.unavailable) return Response.json({ error: "Service unavailable" }, { status: 503 });
      if (url.pathname === "/cosmos/staking/v1beta1/pool") return Response.json({ pool: { bonded_tokens: "12345000000" } });
      if (url.pathname === "/cosmos/gov/v1/proposals") return Response.json({ proposals: [PROPOSAL] });
      if (url.pathname === "/cosmos/gov/v1/proposals/51") return Response.json({ proposal: PROPOSAL });
      if (url.pathname.startsWith("/cosmos/gov/v1/proposals/")) return Response.json({ error: "Not found" }, { status: 404 });
      if (url.pathname.startsWith("/cosmos/tx/v1beta1/txs/")) {
        if (!url.pathname.endsWith(TX_HASH)) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json(state.transaction ?? { tx: { body: { memo: "Community transfer", messages: [{ "@type": "/cosmos.bank.v1beta1.MsgSend", from_address: ACCOUNT, to_address: INACTIVE_ACCOUNT, amount: [{ denom: "udsm", amount: "1000000" }] }] }, auth_info: { fee: { amount: [] } } },
          tx_response: { txhash: TX_HASH, height: "3", timestamp: "2026-09-03T12:00:00Z", code: 0, gas_used: "80000", gas_wanted: "100000", logs: [], events: [] } });
      }
      if (url.pathname === "/cosmos/staking/v1beta1/validators") return Response.json({ validators: [STAKING_VALIDATOR] });
      if (url.pathname === `/cosmos/staking/v1beta1/validators/${OPERATOR}`) return Response.json({ validator: STAKING_VALIDATOR });
      if (url.pathname.startsWith("/cosmos/staking/v1beta1/validators/")) {
        const override = state.validatorResponses?.[url.pathname.split("/").at(-1)!];
        if (override) return Response.json({ validator: override.validator }, { status: override.status ?? 200 });
      }
      if (url.pathname === `/desmos/profiles/v3/profiles/${ACCOUNT}`) {
        await state.profileReady;
        return Response.json(
          state.status === 200 ? { profile: state.profile } : { error: "Profile unavailable" }, { status: state.status }
        );
      }
      if (url.pathname === `/desmos/profiles/v3/profiles/${INACTIVE_ACCOUNT}`) return Response.json({ profile: {
        ...PROFILE, account: { address: INACTIVE_ACCOUNT }, nickname: "Inactive Community"
      } });
      if (url.pathname.includes("/balances/")) return Response.json({ balances: [{ denom: "udsm", amount: "100000000" }] });
      if (url.pathname.includes("/delegations/")) return Response.json({ delegation_responses: (state.delegationAddresses ?? [OPERATOR]).map((validator_address) => ({
        delegation: { validator_address }, balance: { amount: "50000000", denom: "udsm" }
      })) });
      if (url.pathname.endsWith("/unbonding_delegations")) return Response.json({ unbonding_responses: [{
        validator_address: OPERATOR, entries: [{ balance: "4000000", completion_time: "2030-01-01T00:00:00Z" }]
      }] });
      if (url.pathname.endsWith("/redelegations")) return Response.json({ redelegation_responses: [{
        redelegation: { validator_src_address: OPERATOR, validator_dst_address: INACTIVE_OPERATOR },
        entries: [{ balance: "3000000", redelegation_entry: { completion_time: "2030-01-01T00:00:00Z" } }]
      }] });
      if (url.pathname.endsWith("/rewards")) return Response.json({
        total: [{ denom: "udsm", amount: "1000000" }],
        rewards: [{ validator_address: OPERATOR, reward: [{ denom: "udsm", amount: "1000000" }] }]
      });
      if (url.pathname === "/status") return Response.json({ result: { sync_info: { latest_block_height: String(state.latestHeight) } } });
      if (url.pathname === "/block") {
        const height = url.searchParams.get("height") ?? String(state.latestHeight);
        return Response.json({ result: {
          block_id: { hash: height.padStart(64, "0") },
          block: { header: { height, time: "2026-09-03T12:00:00Z", chain_id: "desmos-mainnet",
            proposer_address: height === "1" ? UNKNOWN_CONSENSUS : CONSENSUS.toLowerCase() }, data: { txs: [] } }
        } });
      }
      if (url.pathname === "/commit") return Response.json({ result: { signed_header: { commit: { signatures: [{
        validator_address: CONSENSUS, signature: "test", timestamp: "2026-09-03T12:00:00Z", block_id_flag: 2
      }] } } } });
      if (url.pathname === "/tx_search") return Response.json({ result: { txs: state.serveDocuments ? [{ hash: TX_HASH, height: "3" }] : [] } });
      if (url.pathname.startsWith("/cosmos/staking/v1beta1/validators/")) return Response.json({ error: "Not found" }, { status: 404 });
      throw new Error(`Unexpected REST path: ${url.pathname}`);
    };
    state.request = async (path, init) => {
      const pending: Promise<unknown>[] = [];
      const response = await worker.fetch(new Request(new URL(path, "https://lite.desmos.network"), init), {
        DESMOS_REST_URL: "https://validator-rest.test", DESMOS_RPC_URL: "https://validator-rest.test",
        ASSETS: { fetch: async (input: Request) => {
          const path = new URL(input.url).pathname;
          try {
            const body = await readFile(new URL(`../../../dist${path}`, import.meta.url));
            const type = path.endsWith(".html") ? "text/html" : path.endsWith(".xml") ? "application/xml" : path.endsWith(".png") ? "image/png" : "text/plain";
            return new Response(body, { headers: { "content-type": type } });
          } catch { return new Response("Not found", { status: 404 }); }
        } }
      } as Parameters<typeof worker.fetch>[1], {
        waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }
      } as Parameters<typeof worker.fetch>[2]);
      await Promise.all(pending);
      return response;
    };
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      let response: Response;
      if (url.origin === "https://api.mainnet.desmos.network") {
        response = await globalThis.fetch(new URL(url.pathname + url.search, "https://validator-rest.test"));
      } else if (url.pathname.startsWith("/api/") || (state.serveDocuments && route.request().resourceType() === "document")) {
        response = await state.request(url.pathname + url.search);
      } else { return route.fallback(); }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    for (const pattern of ["https://profile-images.test/**", "https://ipfs.desmos.network/ipfs/**", "**/api/keybase/avatar/**"]) {
      await page.route(pattern, (route) => route.fulfill(state.brokenImages
        ? { status: 404 }
        : { contentType: "image/svg+xml", body: IMAGE }));
    }
    try { await use(state); }
    finally {
      globalThis.fetch = originalFetch;
      if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
      else Reflect.deleteProperty(globalThis, "caches");
    }
  }
});
