import type { Page, Route } from "@playwright/test";

const DASHBOARD_PAYLOAD = {
  latestHeight: 26934457,
  activeValidators: 24,
  bondedTokens: "76323264012345",
  recentBlocks: [
    {
      height: 26934457,
      hash: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
      time: "2026-03-17T12:00:00.000Z",
      proposerAddress: "desmosvalcons1testproposer",
      proposerMoniker: "Apollo",
      proposerIdentity: "",
      txCount: 2
    }
  ],
  recentTransactions: [
    {
      hash: "A1B2C3D4E5F60718293A4B5C6D7E8F901234567890ABCDEF1234567890ABCDEF",
      height: 26934456,
      timestamp: "2026-03-17T11:58:00.000Z",
      code: 0,
      success: true,
      messageTypes: ["MsgSend"],
      memo: "",
      feeAmount: "1250",
      gasUsed: "102345",
      sender: "desmos1senderaddress0000000000000000000000"
    }
  ],
  endpoints: {
    rpcUrl: "https://rpc.mainnet.desmos.network:443",
    restUrl: "https://api.mainnet.desmos.network",
    grpcUrl: "https://grpc.mainnet.desmos.network:443"
  }
};

const BLOCKS_PAYLOAD = [
  {
    height: 26934457,
    hash: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
    time: "2026-03-17T12:00:00.000Z",
    proposerAddress: "desmosvalcons1apollo",
    proposerMoniker: "Apollo",
    proposerIdentity: "",
    txCount: 2
  }
];

const TRANSACTIONS_PAYLOAD = [
  {
    hash: "A1B2C3D4E5F60718293A4B5C6D7E8F901234567890ABCDEF1234567890ABCDEF",
    height: 26934456,
    timestamp: "2026-03-17T11:58:00.000Z",
    code: 0,
    success: true,
    messageTypes: ["MsgSend"],
    memo: "",
    feeAmount: "1250",
    gasUsed: "102345",
    sender: "desmos1senderaddress0000000000000000000000"
  }
];

const VALIDATORS_PAYLOAD = [
  {
    operatorAddress: "desmosvaloper1apollo000000000000000000000000000",
    accountAddress: "desmos1apollo0000000000000000000000000000000",
    consensusPubKey: "cosmosvalconspub1addwnpepq...",
    consensusHexAddress: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    moniker: "Apollo",
    identity: "",
    details: "Apollo validator",
    website: "https://apollo.example",
    securityContact: "apollo@example.com",
    commissionRate: "0.050000000000000000",
    tokens: "12345000000",
    status: "BOND_STATUS_BONDED",
    jailed: false
  }
];

const PROPOSALS_PAYLOAD = [
  {
    id: "17",
    title: "Improve Desmos metadata indexing",
    status: "PROPOSAL_STATUS_VOTING_PERIOD",
    proposer: "desmos1proposer00000000000000000000000000000",
    submitTime: "2026-03-17T10:00:00.000Z",
    votingEndTime: "2026-03-20T10:00:00.000Z"
  }
];

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body)
  });
}

export async function mockExplorerApi(page: Page) {
  await page.route("**/api/keybase/avatar/**", async (route) => {
    await route.fulfill({ status: 404 });
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    switch (`${url.pathname}${url.search}`) {
      case "/api/dashboard":
        await fulfillJson(route, DASHBOARD_PAYLOAD);
        return;
      case "/api/blocks?limit=20":
        await fulfillJson(route, BLOCKS_PAYLOAD);
        return;
      case "/api/transactions?limit=20":
        await fulfillJson(route, TRANSACTIONS_PAYLOAD);
        return;
      case "/api/validators":
        await fulfillJson(route, VALIDATORS_PAYLOAD);
        return;
      case "/api/proposals":
        await fulfillJson(route, PROPOSALS_PAYLOAD);
        return;
      default:
        await route.fulfill({
          status: 404,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ error: `No E2E mock for ${url.pathname}${url.search}` })
        });
    }
  });
}
