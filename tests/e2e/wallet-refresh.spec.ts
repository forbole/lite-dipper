import { createHash } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth";
import { QueryAccountResponse } from "cosmjs-types/cosmos/auth/v1beta1/query";
import { SimulateResponse } from "cosmjs-types/cosmos/tx/v1beta1/service";
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import worker from "../../worker/index";

const ADDRESS = "desmos1walletrefresh";
const VALIDATORS = ["desmosvaloper1first", "desmosvaloper1second"];
const PUBLIC_KEY = Buffer.from("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "hex");

type Chain = {
  committed: boolean;
  broadcasted: boolean;
  failOverview: boolean;
  balance: string;
  rewards: string[];
  hash: string;
  messages: string[];
  broadcastCount: number;
  overviewCacheModes: Array<string | undefined>;
  overviewCacheHeaders: Array<string | null>;
};

const test = base.extend<{ chain: Chain }>({
  chain: async ({ page }, use) => {
    const chain: Chain = {
      committed: false, broadcasted: false, failOverview: false,
      balance: "100000000", rewards: ["1000000", "2000000"], hash: "", messages: [],
      broadcastCount: 0, overviewCacheModes: [], overviewCacheHeaders: []
    };
    // Exercise the real Worker cache and wallet aggregation, with only the
    // external REST/RPC services and wallet extension replaced.
    const originalFetch = globalThis.fetch;
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
    const cache = new Map<string, Response>();
    Object.defineProperty(globalThis, "caches", { configurable: true, value: {
      open: async () => ({
        match: async (request: Request) => cache.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => { cache.set(request.url, response.clone()); }
      })
    } });
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== "https://wallet-rest.test") throw new Error(`Unexpected upstream: ${url}`);
      if (!url.pathname.endsWith("/validators")) chain.overviewCacheModes.push(init?.cache);
      if (chain.failOverview) return new Response("Temporarily unavailable", { status: 503 });
      const rewards = chain.committed ? chain.rewards : ["1000000", "2000000"];
      let body: unknown;
      if (url.pathname.endsWith("/validators")) body = { validators: [] };
      else if (url.pathname.includes("/balances/")) body = {
        balances: [{ denom: "udsm", amount: chain.committed ? chain.balance : "100000000" }]
      };
      else if (url.pathname.endsWith("/rewards")) body = {
        rewards: VALIDATORS.map((validator_address, i) => ({ validator_address, reward: [{ denom: "udsm", amount: rewards[i] }] })),
        total: [{ denom: "udsm", amount: rewards.reduce((sum, amount) => sum + BigInt(amount), 0n).toString() }]
      };
      else if (url.pathname.includes("/delegations/")) body = {
        delegation_responses: VALIDATORS.map((validator_address) => ({
          delegation: { validator_address }, balance: { denom: "udsm", amount: "50000000" }
        }))
      };
      else if (url.pathname.endsWith("/unbonding_delegations")) body = { unbonding_responses: [] };
      else if (url.pathname.endsWith("/redelegations")) body = { redelegation_responses: [] };
      else throw new Error(`Unexpected REST path: ${url.pathname}`);
      return Response.json(body);
    };

    await page.route("**/api/wallet/**/overview", async (route) => {
      const pending: Promise<unknown>[] = [];
      const response = await worker.fetch(new Request(route.request().url()), {
        DESMOS_REST_URL: "https://wallet-rest.test"
      } as Parameters<typeof worker.fetch>[1], {
        waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }
      } as Parameters<typeof worker.fetch>[2]);
      await Promise.all(pending);
      chain.overviewCacheHeaders.push(response.headers.get("cache-control"));
      // Retain a snapshot as if the old deployment had populated the edge cache.
      // The fixed Worker must ignore that entry on subsequent requests.
      if (!cache.has(route.request().url()) && response.ok) cache.set(route.request().url(), response.clone());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });

    let transaction = "";
    await page.route("**/rpc", async (route) => {
      const { id, method, params } = route.request().postDataJSON();
      let result: unknown;
      if (method === "status") result = {
        node_info: {
          id: "AA".repeat(20), listen_addr: "tcp://localhost:26656", network: "desmos-mainnet",
          version: "0.38.0", channels: "", moniker: "test", other: {},
          protocol_version: { app: "0", block: "11", p2p: "8" }
        },
        sync_info: {
          latest_block_hash: "AA".repeat(32), latest_app_hash: "BB".repeat(32),
          latest_block_height: "100", latest_block_time: "2026-09-03T12:00:00Z", catching_up: false
        },
        validator_info: {
          address: "CC".repeat(20), voting_power: "1",
          pub_key: { type: "tendermint/PubKeyEd25519", value: Buffer.alloc(32, 1).toString("base64") }
        }
      };
      else if (method === "abci_query") {
        let value: Uint8Array;
        if (params.path === "/cosmos.auth.v1beta1.Query/Account") value = QueryAccountResponse.encode({ account: {
          typeUrl: "/cosmos.auth.v1beta1.BaseAccount",
          value: BaseAccount.encode(BaseAccount.fromPartial({ address: ADDRESS, accountNumber: 1n })).finish()
        } }).finish();
        else if (params.path === "/cosmos.tx.v1beta1.Service/Simulate") value = SimulateResponse.encode(
          SimulateResponse.fromPartial({ gasInfo: { gasUsed: 100000n, gasWanted: 100000n } })
        ).finish();
        else throw new Error(`Unexpected ABCI path: ${params.path}`);
        result = { response: { code: 0, height: "100", value: Buffer.from(value).toString("base64") } };
      } else if (method === "broadcast_tx_sync") {
        transaction = params.tx;
        chain.hash = createHash("sha256").update(Buffer.from(transaction, "base64")).digest("hex").toUpperCase();
        chain.messages = TxBody.decode(TxRaw.decode(Buffer.from(transaction, "base64")).bodyBytes).messages.map((message) => message.typeUrl);
        chain.broadcasted = true;
        chain.broadcastCount++;
        result = { code: 0, hash: chain.hash };
      } else if (method === "tx_search") result = {
        total_count: chain.committed ? "1" : "0",
        txs: chain.committed ? [{ hash: chain.hash, height: "101", index: 0, tx: transaction,
          tx_result: { code: 0, gas_wanted: "140000", gas_used: "100000", events: [] } }] : []
      };
      else throw new Error(`Unexpected RPC method: ${method}`);
      await route.fulfill({ json: { jsonrpc: "2.0", id, result } });
    });

    await page.addInitScript(({ address, publicKey }) => {
      const browserFetch = window.fetch;
      Object.assign(window, { walletRequestCacheModes: [] as Array<string | undefined> });
      window.fetch = (input, init) => {
        if (String(input).includes("/overview")) {
          (window as unknown as { walletRequestCacheModes: Array<string | undefined> }).walletRequestCacheModes.push(init?.cache);
        }
        return browserFetch(input, init);
      };
      window.keplr = { enable: async () => {}, getKey: async () => { throw new Error("Unused"); } };
      window.getOfflineSigner = () => ({
        getAccounts: async () => [{ address, algo: "secp256k1", pubkey: Uint8Array.from(publicKey) }],
        signDirect: async (_address, signed) => ({ signed, signature: {
          pub_key: { type: "tendermint/PubKeySecp256k1", value: btoa(String.fromCharCode(...publicKey)) },
          signature: btoa(String.fromCharCode(...new Uint8Array(64)))
        } })
      });
    }, { address: ADDRESS, publicKey: Array.from(PUBLIC_KEY) });

    try { await use(chain); }
    finally {
      globalThis.fetch = originalFetch;
      if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
      else Reflect.deleteProperty(globalThis, "caches");
    }
  }
});

for (const action of ["claim", "claim all", "send"] as const) {
  test(`${action} refreshes balances and rewards only after commit, despite a warm API cache`, async ({ page, chain }) => {
    await page.goto("/wallet");
    await page.getByRole("button", { name: /^Keplr/ }).click();
    await expect(page.getByText("Available: 100.000000 DSM", { exact: true })).toBeVisible();
    await expect(page.getByText("Total rewards: 3.000000 DSM", { exact: true })).toBeVisible();

    if (action === "send") {
      chain.balance = "89996000";
      await page.getByLabel("Recipient").fill("desmos1recipient");
      await page.getByLabel("Amount (DSM)").fill("10");
      await page.getByRole("button", { name: "Sign transfer", exact: true }).click();
    } else if (action === "claim all") {
      chain.balance = "102995500";
      chain.rewards = ["0", "0"];
      await page.getByRole("button", { name: "Claim all rewards", exact: true }).click();
    } else {
      chain.balance = "100996500";
      chain.rewards = ["0", "2000000"];
      await page.getByRole("button", { name: "Claim rewards", exact: true }).first().click();
    }

    await expect.poll(() => chain.broadcasted).toBe(true);
    await expect(page.getByText("Available: 100.000000 DSM", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: chain.hash, exact: true })).toHaveCount(0);
    chain.committed = true;
    await expect(page.getByRole("link", { name: chain.hash, exact: true })).toBeVisible();
    const balance = action === "send" ? "89.996000" : action === "claim all" ? "102.995500" : "100.996500";
    const rewards = action === "send" ? "3.000000" : action === "claim all" ? "0.000000" : "2.000000";
    await expect(page.getByText(`Available: ${balance} DSM`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Total rewards: ${rewards} DSM`, { exact: true })).toBeVisible();
    expect(chain.messages).toEqual(Array(action === "claim all" ? 2 : 1).fill(
      action === "send" ? "/cosmos.bank.v1beta1.MsgSend" : "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward"
    ));
    if (action !== "send") await expect(page.getByRole("button", { name: "Claim rewards", exact: true }).first()).toBeDisabled();
    if (action === "claim all") await expect(page.getByRole("button", { name: "Claim all rewards", exact: true })).toBeDisabled();
    expect(chain.overviewCacheHeaders.every((header) => header === "no-store")).toBe(true);
    expect(chain.overviewCacheModes.every((mode) => mode === "no-store")).toBe(true);
    const browserCacheModes = await page.evaluate(() =>
      (window as unknown as { walletRequestCacheModes: string[] }).walletRequestCacheModes
    );
    expect(browserCacheModes.length).toBeGreaterThanOrEqual(2);
    expect(browserCacheModes.every((mode) => mode === "no-store")).toBe(true);
  });
}

test("a failed refresh after commit shows stale data and can retry without signing again", async ({ page, chain }) => {
  await page.goto("/wallet");
  await page.getByRole("button", { name: /^Keplr/ }).click();
  await expect(page.getByText("Total rewards: 3.000000 DSM", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Claim all rewards", exact: true }).click();
  await expect.poll(() => chain.broadcasted).toBe(true);
  chain.balance = "102995500";
  chain.rewards = ["0", "0"];
  chain.failOverview = true;
  chain.committed = true;
  await expect(page.getByRole("link", { name: chain.hash, exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Displayed amounts may be out of date");
  await expect(page.getByText("Total rewards: 3.000000 DSM", { exact: true })).toBeVisible();

  chain.failOverview = false;
  await page.getByRole("button", { name: "Retry wallet refresh" }).click();
  await expect(page.getByText("Available: 102.995500 DSM", { exact: true })).toBeVisible();
  await expect(page.getByText("Total rewards: 0.000000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(chain.broadcastCount).toBe(1);
});
