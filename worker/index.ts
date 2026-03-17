/// <reference types="@cloudflare/workers-types" />

interface Env {
  ASSETS: Fetcher;
  DESMOS_CHAIN_ID: string;
  DESMOS_CHAIN_NAME: string;
  DESMOS_RPC_URL: string;
  DESMOS_REST_URL: string;
  DESMOS_GRPC_URL: string;
}

type ValidatorRecord = {
  operatorAddress: string;
  accountAddress: string;
  consensusPubKey: string;
  consensusHexAddress: string;
  moniker: string;
  identity: string;
  details: string;
  website: string;
  securityContact: string;
  commissionRate: string;
  tokens: string;
  status: string;
  jailed: boolean;
};

type KeybaseProfile = {
  username: string;
  avatarUrl: string;
  profileUrl: string;
};

type ValidatorDirectory = {
  validators: ValidatorRecord[];
  byOperatorAddress: Map<string, ValidatorRecord>;
  byConsensusHexAddress: Map<string, ValidatorRecord>;
};

let validatorDirectoryCache:
  | {
      cacheKey: string;
      expiresAt: number;
      directory: ValidatorDirectory;
    }
  | null = null;

const keybaseProfileCache = new Map<
  string,
  {
    expiresAt: number;
    profile: KeybaseProfile | null;
  }
>();

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeHexAddress(value: string): string {
  return value.trim().toUpperCase();
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToUpperHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function findCoinAmountByDenom(coins: Array<{ denom?: string; amount?: string }> | undefined, denom: string): string {
  return coins?.find((coin) => coin?.denom === denom)?.amount ?? "0";
}

const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values: number[]): number {
  let checksum = 1;

  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;

    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((top >>> index) & 1) {
        checksum ^= BECH32_GENERATORS[index];
      }
    }
  }

  return checksum;
}

function bech32HrpExpand(hrp: string): number[] {
  const expanded: number[] = [];

  for (let index = 0; index < hrp.length; index += 1) {
    expanded.push(hrp.charCodeAt(index) >>> 5);
  }

  expanded.push(0);

  for (let index = 0; index < hrp.length; index += 1) {
    expanded.push(hrp.charCodeAt(index) & 31);
  }

  return expanded;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ 1;

  return Array.from({ length: 6 }, (_, index) => (polymod >>> (5 * (5 - index))) & 31);
}

function decodeBech32(address: string): { hrp: string; data: number[] } {
  const normalized = address.trim().toLowerCase();
  const separatorIndex = normalized.lastIndexOf("1");

  if (separatorIndex <= 0 || separatorIndex + 7 > normalized.length) {
    throw new Error("Invalid Bech32 address.");
  }

  const hrp = normalized.slice(0, separatorIndex);
  const payload = normalized.slice(separatorIndex + 1);
  const data = Array.from(payload, (character) => {
    const value = BECH32_ALPHABET.indexOf(character);

    if (value === -1) {
      throw new Error("Invalid Bech32 character.");
    }

    return value;
  });

  if (bech32Polymod([...bech32HrpExpand(hrp), ...data]) !== 1) {
    throw new Error("Invalid Bech32 checksum.");
  }

  return {
    hrp,
    data: data.slice(0, -6)
  };
}

function encodeBech32(hrp: string, data: number[]): string {
  const combined = [...data, ...bech32CreateChecksum(hrp, data)];
  return `${hrp}1${combined.map((value) => BECH32_ALPHABET[value]).join("")}`;
}

function convertBits(data: ArrayLike<number>, fromBits: number, toBits: number, pad: boolean): number[] {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;

  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];

    if (value < 0 || value >>> fromBits !== 0) {
      throw new Error("Invalid value while converting Bech32 bits.");
    }

    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >>> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((accumulator << (toBits - bits)) & maxValue);
    }
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    throw new Error("Invalid padding while converting Bech32 bits.");
  }

  return result;
}

function deriveAccountAddressFromOperatorAddress(operatorAddress: string): string {
  if (!operatorAddress) {
    return "";
  }

  const { hrp, data } = decodeBech32(operatorAddress);
  const accountPrefix = hrp.endsWith("valoper") ? hrp.slice(0, -8) : hrp;
  const bytes = convertBits(data, 5, 8, false);

  return encodeBech32(accountPrefix, convertBits(bytes, 8, 5, true));
}

function getCacheTtl(pathname: string): number {
  if (pathname.startsWith("/api/keybase/avatar/")) {
    return 21_600;
  }

  if (pathname === "/api/dashboard") {
    return 10;
  }

  if (pathname === "/api/blocks" || pathname.startsWith("/api/blocks/")) {
    return 10;
  }

  if (pathname === "/api/transactions" || pathname.startsWith("/api/transactions/")) {
    return 12;
  }

  if (pathname === "/api/validators" || pathname.startsWith("/api/validators/")) {
    return 30;
  }

  if (pathname === "/api/proposals" || pathname.startsWith("/api/proposals/")) {
    return 45;
  }

  if (pathname.startsWith("/api/wallet/")) {
    return 12;
  }

  return 5;
}

async function withCache(
  request: Request,
  ctx: ExecutionContext,
  ttl: number,
  loader: () => Promise<Response>
) {
  if (request.method !== "GET" || ttl <= 0) {
    return loader();
  }

  const cache = await caches.open("lite-dipper-api");
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await loader();

  if (response.ok) {
    const cacheable = new Response(response.body, response);
    cacheable.headers.set("cache-control", `public, max-age=${ttl}`);
    ctx.waitUntil(cache.put(request, cacheable.clone()));
    return cacheable;
  }

  return response;
}

async function fetchJson(url: URL | string, init?: RequestInit) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Upstream ${response.status}: ${await response.text()}`);
  }

  return response.json<any>();
}

async function fetchRpcJson(env: Env, path: string, search?: Record<string, string>) {
  const url = new URL(path, `${trimTrailingSlash(env.DESMOS_RPC_URL)}/`);

  Object.entries(search ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return fetchJson(url);
}

async function fetchRestJson(env: Env, path: string, search?: Array<[string, string]>) {
  const url = new URL(path, `${trimTrailingSlash(env.DESMOS_REST_URL)}/`);

  (search ?? []).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  return fetchJson(url);
}

async function fetchTransactionPayloadByHash(env: Env, hash: string) {
  return fetchRestJson(env, `/cosmos/tx/v1beta1/txs/${hash}`);
}

async function fetchKeybaseProfile(identity: string): Promise<KeybaseProfile | null> {
  if (!identity) {
    return null;
  }

  const cacheKey = identity.trim().toUpperCase();
  const cached = keybaseProfileCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const url = new URL("https://keybase.io/_/api/1.0/user/lookup.json");
  url.searchParams.set("key_suffix", identity);
  url.searchParams.set("fields", "pictures,basics");

  try {
    const response = await fetchJson(url);
    const person = response?.them?.[0];
    const username = person?.basics?.username ?? "";
    const avatarUrl = person?.pictures?.primary?.url ?? "";
    const profile =
      username && avatarUrl
        ? {
            username,
            avatarUrl,
            profileUrl: `https://keybase.io/${username}`
          }
        : null;

    keybaseProfileCache.set(cacheKey, {
      expiresAt: Date.now() + 6 * 60 * 60_000,
      profile
    });

    return profile;
  } catch {
    keybaseProfileCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60_000,
      profile: null
    });

    return null;
  }
}

async function fetchKeybaseAvatarResponse(identity: string): Promise<Response> {
  const profile = await fetchKeybaseProfile(identity);

  if (!profile?.avatarUrl) {
    return new Response("Avatar not found", { status: 404 });
  }

  const response = await fetch(profile.avatarUrl, {
    headers: {
      Accept: "image/*"
    }
  });

  if (!response.ok) {
    return new Response("Avatar not found", { status: 404 });
  }

  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=21600");

  return new Response(response.body, {
    status: 200,
    headers
  });
}

async function deriveConsensusHexAddress(consensusPubKey: string): Promise<string> {
  if (!consensusPubKey) {
    return "";
  }

  const pubKeyBytes = base64ToBytes(consensusPubKey);
  const digest = await crypto.subtle.digest("SHA-256", pubKeyBytes.buffer as ArrayBuffer);
  return bytesToUpperHex(new Uint8Array(digest).slice(0, 20));
}

async function getValidatorDirectory(env: Env): Promise<ValidatorDirectory> {
  const cacheKey = trimTrailingSlash(env.DESMOS_REST_URL);
  const now = Date.now();

  if (
    validatorDirectoryCache &&
    validatorDirectoryCache.cacheKey === cacheKey &&
    validatorDirectoryCache.expiresAt > now
  ) {
    return validatorDirectoryCache.directory;
  }

  const response = await fetchRestJson(env, "/cosmos/staking/v1beta1/validators", [
    ["status", "BOND_STATUS_BONDED"],
    ["pagination.limit", "200"]
  ]);
  const validators = await Promise.all((response?.validators ?? []).map(normalizeValidator));
  validators.sort((left, right) => {
    const leftTokens = BigInt(left.tokens || "0");
    const rightTokens = BigInt(right.tokens || "0");

    if (rightTokens > leftTokens) {
      return 1;
    }

    if (rightTokens < leftTokens) {
      return -1;
    }

    return left.moniker.localeCompare(right.moniker);
  });
  const directory: ValidatorDirectory = {
    validators,
    byOperatorAddress: new Map(),
    byConsensusHexAddress: new Map()
  };

  validators.forEach((validator) => {
    if (validator.operatorAddress) {
      directory.byOperatorAddress.set(validator.operatorAddress, validator);
    }

    if (validator.consensusHexAddress) {
      directory.byConsensusHexAddress.set(normalizeHexAddress(validator.consensusHexAddress), validator);
    }
  });

  validatorDirectoryCache = {
    cacheKey,
    expiresAt: now + 30_000,
    directory
  };

  return directory;
}

function extractMessageTypes(messages: any[]): string[] {
  return (messages ?? []).map((message) => {
    const rawType = message?.["@type"] ?? message?.typeUrl ?? "Unknown";
    return rawType.split(".").at(-1) ?? rawType;
  });
}

function extractSender(tx: any): string {
  const firstMessage = tx?.body?.messages?.[0] ?? {};

  return (
    firstMessage.sender ??
    firstMessage.delegator_address ??
    firstMessage.delegatorAddress ??
    firstMessage.from_address ??
    firstMessage.fromAddress ??
    firstMessage.proposer ??
    firstMessage.creator ??
    ""
  );
}

function extractFeeAmount(tx: any): string {
  const amount = tx?.auth_info?.fee?.amount ?? [];
  const total = amount.reduce((sum: bigint, coin: any) => {
    if (coin?.denom === "udsm") {
      return sum + BigInt(coin.amount ?? "0");
    }

    return sum;
  }, 0n);

  return total.toString();
}

function resolveValidatorMonikerByConsensusAddress(
  directory: ValidatorDirectory | undefined,
  consensusAddress: string
): string {
  if (!directory || !consensusAddress) {
    return "";
  }

  return directory.byConsensusHexAddress.get(normalizeHexAddress(consensusAddress))?.moniker ?? "";
}

function normalizeBlock(blockResponse: any, directory?: ValidatorDirectory) {
  const block = blockResponse?.result?.block ?? {};
  const proposerAddress = block?.header?.proposer_address ?? "";

  return {
    height: Number(block?.header?.height ?? 0),
    hash: blockResponse?.result?.block_id?.hash ?? "",
    time: block?.header?.time ?? "",
    proposerAddress,
    proposerMoniker: resolveValidatorMonikerByConsensusAddress(directory, proposerAddress),
    proposerIdentity:
      directory?.byConsensusHexAddress.get(normalizeHexAddress(proposerAddress))?.identity ?? "",
    txCount: Array.isArray(block?.data?.txs) ? block.data.txs.length : 0
  };
}

function normalizeTransactionSummary(txResponse: any, tx: any) {
  return {
    hash: txResponse?.txhash ?? "",
    height: Number(txResponse?.height ?? 0),
    timestamp: txResponse?.timestamp ?? "",
    code: Number(txResponse?.code ?? 0),
    success: Number(txResponse?.code ?? 0) === 0,
    messageTypes: extractMessageTypes(tx?.body?.messages ?? []),
    memo: tx?.body?.memo ?? "",
    feeAmount: extractFeeAmount(tx),
    gasUsed: txResponse?.gas_used ?? "0",
    sender: extractSender(tx)
  };
}

async function normalizeValidator(validator: any): Promise<ValidatorRecord> {
  const consensusPubKey = validator?.consensus_pubkey?.key ?? "";
  const operatorAddress = validator?.operator_address ?? "";

  return {
    operatorAddress,
    accountAddress: deriveAccountAddressFromOperatorAddress(operatorAddress),
    consensusPubKey,
    consensusHexAddress: await deriveConsensusHexAddress(consensusPubKey),
    moniker: validator?.description?.moniker ?? "Unknown validator",
    identity: validator?.description?.identity ?? "",
    details: validator?.description?.details ?? "",
    website: validator?.description?.website ?? "",
    securityContact: validator?.description?.security_contact ?? "",
    commissionRate: validator?.commission?.commission_rates?.rate ?? "0",
    tokens: validator?.tokens ?? "0",
    status: validator?.status ?? "STATUS_UNSPECIFIED",
    jailed: Boolean(validator?.jailed)
  };
}

function extractProposalTitle(proposal: any): string {
  if (proposal?.title) {
    return proposal.title;
  }

  const firstMessage = proposal?.messages?.[0];

  return (
    firstMessage?.title ??
    firstMessage?.content?.title ??
    firstMessage?.plan?.name ??
    proposal?.metadata ??
    "Untitled proposal"
  );
}

function extractProposalSummary(proposal: any): string {
  if (proposal?.summary) {
    return proposal.summary;
  }

  const firstMessage = proposal?.messages?.[0];

  return (
    firstMessage?.summary ??
    firstMessage?.content?.description ??
    firstMessage?.description ??
    ""
  );
}

function normalizeProposal(proposal: any) {
  return {
    id: proposal?.id ?? "",
    title: extractProposalTitle(proposal),
    status: proposal?.status ?? "STATUS_UNSPECIFIED",
    proposer: proposal?.proposer ?? "",
    submitTime: proposal?.submit_time ?? "",
    votingEndTime: proposal?.voting_end_time ?? ""
  };
}

function previewMessage(message: any): string {
  try {
    return JSON.stringify(message, null, 2);
  } catch {
    return String(message);
  }
}

function normalizeEvent(event: any) {
  return {
    type: event?.type ?? "unknown",
    attributes: (event?.attributes ?? []).map((attribute: any) => ({
      key: attribute?.key ?? "",
      value: attribute?.value ?? ""
    }))
  };
}

async function getLatestHeight(env: Env): Promise<number> {
  const status = await fetchRpcJson(env, "/status");
  return Number(status?.result?.sync_info?.latest_block_height ?? 0);
}

async function getRecentBlocks(env: Env, limit: number, directory?: ValidatorDirectory) {
  const latestHeight = await getLatestHeight(env);
  const heights = Array.from({ length: Math.min(limit, latestHeight) }, (_, index) => latestHeight - index);
  const blocks = await Promise.all(
    heights.map((height) => fetchRpcJson(env, "/block", { height: String(height) }))
  );

  return blocks.map((block) => normalizeBlock(block, directory));
}

async function getRecentTransactions(env: Env, limit: number, event?: string) {
  const query = event ? event : "tx.height > 0";
  const searchResponse = await fetchRpcJson(env, "/tx_search", {
    query: `"${query}"`,
    prove: "false",
    page: "1",
    per_page: String(limit),
    order_by: `"desc"`
  });
  const txs = searchResponse?.result?.txs ?? [];
  const details = await Promise.all(
    txs.map((tx: any) => fetchTransactionPayloadByHash(env, tx?.hash ?? ""))
  );

  return details.map((detail: any) =>
    normalizeTransactionSummary(detail?.tx_response, detail?.tx)
  );
}

async function getValidators(env: Env) {
  return (await getValidatorDirectory(env)).validators;
}

async function getDashboard(env: Env) {
  const validatorDirectoryPromise = getValidatorDirectory(env);
  const [latestHeight, validatorDirectory, stakingPool, recentTransactions] = await Promise.all([
    getLatestHeight(env),
    validatorDirectoryPromise,
    fetchRestJson(env, "/cosmos/staking/v1beta1/pool"),
    getRecentTransactions(env, 8)
  ]);
  const recentBlocks = await getRecentBlocks(env, 8, validatorDirectory);

  return {
    latestHeight,
    activeValidators: validatorDirectory.validators.length,
    bondedTokens: stakingPool?.pool?.bonded_tokens ?? "0",
    recentBlocks,
    recentTransactions,
    endpoints: {
      rpcUrl: env.DESMOS_RPC_URL,
      restUrl: env.DESMOS_REST_URL,
      grpcUrl: env.DESMOS_GRPC_URL
    }
  };
}

async function getBlockDetails(env: Env, height: string) {
  const validatorDirectoryPromise = getValidatorDirectory(env);
  const [block, commit, transactions, validatorDirectory] = await Promise.all([
    fetchRpcJson(env, "/block", { height }),
    fetchRpcJson(env, "/commit", { height }),
    getRecentTransactions(env, 50, `tx.height=${height}`).catch(() => []),
    validatorDirectoryPromise
  ]);

  const normalizedBlock = normalizeBlock(block, validatorDirectory);
  const header = block?.result?.block?.header ?? {};
  const signedValidators = (commit?.result?.signed_header?.commit?.signatures ?? [])
    .filter((signature: any) => Boolean(signature?.signature) && Boolean(signature?.validator_address))
    .map((signature: any) => {
      const consensusAddress = normalizeHexAddress(signature?.validator_address ?? "");
      const validator = validatorDirectory.byConsensusHexAddress.get(consensusAddress);

      return {
        consensusAddress,
        operatorAddress: validator?.operatorAddress ?? "",
        moniker: validator?.moniker ?? "Unknown validator",
        identity: validator?.identity ?? "",
        timestamp: signature?.timestamp ?? "",
        blockIdFlag: String(signature?.block_id_flag ?? ""),
        signaturePresent: Boolean(signature?.signature)
      };
    });

  return {
    block: {
      ...normalizedBlock,
      chainId: header?.chain_id ?? "",
      version: header?.version?.block ?? "",
      nextValidatorsHash: header?.next_validators_hash ?? ""
    },
    signedValidators,
    transactions
  };
}

async function getTransactionDetails(env: Env, hash: string) {
  const response = await fetchTransactionPayloadByHash(env, hash);
  const tx = response?.tx ?? {};
  const txResponse = response?.tx_response ?? {};

  return {
    hash: txResponse?.txhash ?? hash,
    height: Number(txResponse?.height ?? 0),
    timestamp: txResponse?.timestamp ?? "",
    code: Number(txResponse?.code ?? 0),
    rawLog: txResponse?.raw_log ?? "",
    gasWanted: txResponse?.gas_wanted ?? "0",
    gasUsed: txResponse?.gas_used ?? "0",
    memo: tx?.body?.memo ?? "",
    feeAmount: extractFeeAmount(tx),
    signerAddresses: [extractSender(tx)].filter(Boolean),
    messages: (tx?.body?.messages ?? []).map((message: any) => ({
      typeUrl: message?.["@type"] ?? "Unknown",
      preview: previewMessage(message)
    })),
    logs: (txResponse?.logs ?? []).map((logEntry: any) => ({
      msgIndex: Number(logEntry?.msg_index ?? 0),
      log: logEntry?.log ?? "",
      events: (logEntry?.events ?? []).map(normalizeEvent)
    })),
    events: (txResponse?.events ?? []).map(normalizeEvent)
  };
}

async function getValidatorDetails(env: Env, validatorAddress: string) {
  const response = await fetchRestJson(env, `/cosmos/staking/v1beta1/validators/${validatorAddress}`);
  const validator = response?.validator ?? {};
  const normalizedValidator = await normalizeValidator(validator);

  return {
    validator: {
      ...normalizedValidator,
      minSelfDelegation: validator?.min_self_delegation ?? "0",
      unbondingHeight: validator?.unbonding_height ?? "0",
      unbondingTime: validator?.unbonding_time ?? "",
      delegatorShares: validator?.delegator_shares ?? "0"
    },
    keybaseProfile: await fetchKeybaseProfile(normalizedValidator.identity)
  };
}

async function getProposals(env: Env) {
  const response = await fetchRestJson(env, "/cosmos/gov/v1/proposals", [
    ["pagination.limit", "20"],
    ["pagination.reverse", "true"]
  ]);

  return (response?.proposals ?? []).map(normalizeProposal);
}

function extractProposalTally(source: any) {
  if (!source) {
    return undefined;
  }

  const yes = source?.yes_count ?? source?.yes;
  const no = source?.no_count ?? source?.no;
  const abstain = source?.abstain_count ?? source?.abstain;
  const noWithVeto = source?.no_with_veto_count ?? source?.no_with_veto;

  if ([yes, no, abstain, noWithVeto].every((value) => value == null)) {
    return undefined;
  }

  return {
    yes: yes ?? "0",
    no: no ?? "0",
    abstain: abstain ?? "0",
    noWithVeto: noWithVeto ?? "0"
  };
}

async function fetchProposalTally(env: Env, proposalId: string) {
  try {
    const response = await fetchRestJson(env, `/cosmos/gov/v1/proposals/${proposalId}/tally_result`);
    return extractProposalTally(response?.tally);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Upstream 501")) {
      return undefined;
    }

    throw error;
  }
}

async function getProposalDetails(env: Env, proposalId: string) {
  const proposalResponse = await fetchRestJson(env, `/cosmos/gov/v1/proposals/${proposalId}`);
  const proposal = proposalResponse?.proposal ?? {};
  const finalTally = extractProposalTally(proposal?.final_tally_result) ?? (await fetchProposalTally(env, proposalId));

  return {
    proposal: {
      ...normalizeProposal(proposal),
      summary: extractProposalSummary(proposal),
      metadata: proposal?.metadata ?? "",
      expedited: Boolean(proposal?.expedited),
      messages: (proposal?.messages ?? []).map((message: any) => message?.["@type"] ?? "Unknown"),
      finalTally
    }
  };
}

async function getWalletOverview(env: Env, address: string) {
  const validatorDirectoryPromise = getValidatorDirectory(env);
  const [balancesResponse, delegationsResponse, rewardsResponse] = await Promise.all([
    fetchRestJson(env, `/cosmos/bank/v1beta1/balances/${address}`),
    fetchRestJson(env, `/cosmos/staking/v1beta1/delegations/${address}`),
    fetchRestJson(env, `/cosmos/distribution/v1beta1/delegators/${address}/rewards`)
  ]);
  const validatorDirectory = await validatorDirectoryPromise;
  const rewardsByValidator = new Map<string, string>(
    (rewardsResponse?.rewards ?? []).map((reward: any) => [
      reward?.validator_address ?? "",
      findCoinAmountByDenom(reward?.reward, "udsm")
    ])
  );

  return {
    address,
    balances: (balancesResponse?.balances ?? []).map((balance: any) => ({
      denom: balance?.denom ?? "",
      amount: balance?.amount ?? "0"
    })),
    totalRewardAmount: findCoinAmountByDenom(rewardsResponse?.total, "udsm"),
    delegations: (delegationsResponse?.delegation_responses ?? []).map((delegation: any) => ({
      validatorAddress: delegation?.delegation?.validator_address ?? "",
      moniker:
        validatorDirectory.byOperatorAddress.get(delegation?.delegation?.validator_address ?? "")?.moniker ?? "",
      identity:
        validatorDirectory.byOperatorAddress.get(delegation?.delegation?.validator_address ?? "")?.identity ?? "",
      amount: delegation?.balance?.amount ?? "0",
      rewardAmount: rewardsByValidator.get(delegation?.delegation?.validator_address ?? "") ?? "0"
    }))
  };
}

async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] === "api" && segments[1] === "keybase" && segments[2] === "avatar" && segments[3]) {
    return fetchKeybaseAvatarResponse(segments[3]);
  }

  if (url.pathname === "/api/config") {
    return json({
      chainId: env.DESMOS_CHAIN_ID,
      chainName: env.DESMOS_CHAIN_NAME,
      rpcUrl: env.DESMOS_RPC_URL,
      restUrl: env.DESMOS_REST_URL,
      grpcUrl: env.DESMOS_GRPC_URL,
      osmosisChannelId: "channel-2",
      denom: "udsm",
      displayDenom: "DSM",
      exponent: 6
    });
  }

  if (url.pathname === "/api/dashboard") {
    return json(await getDashboard(env));
  }

  if (url.pathname === "/api/blocks") {
    const limit = Number(url.searchParams.get("limit") ?? "20");
    return json(await getRecentBlocks(env, limit, await getValidatorDirectory(env)));
  }

  if (segments[0] === "api" && segments[1] === "blocks" && segments[2]) {
    return json(await getBlockDetails(env, segments[2]));
  }

  if (url.pathname === "/api/transactions") {
    const limit = Number(url.searchParams.get("limit") ?? "20");
    return json(await getRecentTransactions(env, limit));
  }

  if (segments[0] === "api" && segments[1] === "transactions" && segments[2]) {
    return json(await getTransactionDetails(env, segments[2]));
  }

  if (url.pathname === "/api/validators") {
    return json(await getValidators(env));
  }

  if (segments[0] === "api" && segments[1] === "validators" && segments[2]) {
    return json(await getValidatorDetails(env, segments[2]));
  }

  if (url.pathname === "/api/proposals") {
    return json(await getProposals(env));
  }

  if (segments[0] === "api" && segments[1] === "proposals" && segments[2]) {
    return json(await getProposalDetails(env, segments[2]));
  }

  if (
    segments[0] === "api" &&
    segments[1] === "wallet" &&
    segments[2] &&
    segments[3] === "overview"
  ) {
    return json(await getWalletOverview(env, segments[2]));
  }

  return json({ error: "Not found" }, { status: 404 });
}

async function handleRpcProxy(request: Request, env: Env) {
  const incomingUrl = new URL(request.url);
  const upstreamBase = new URL(env.DESMOS_RPC_URL);
  const suffix = incomingUrl.pathname.replace(/^\/rpc/, "") || "/";
  upstreamBase.pathname = `${trimTrailingSlash(upstreamBase.pathname)}${suffix}`.replace(/\/{2,}/g, "/");
  upstreamBase.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const upstreamRequest = new Request(upstreamBase.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow"
  });

  return fetch(upstreamRequest);
}

async function handleAssetOrSpa(request: Request, env: Env) {
  const assetResponse = await env.ASSETS.fetch(request);

  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const accept = request.headers.get("accept") ?? "";

  if (accept.includes("text/html")) {
    const indexRequest = new Request(new URL("/index.html", request.url).toString(), request);
    return env.ASSETS.fetch(indexRequest);
  }

  return assetResponse;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) {
        return handleRpcProxy(request, env);
      }

      if (url.pathname.startsWith("/api/")) {
        return withCache(request, ctx, getCacheTtl(url.pathname), () => handleApi(request, env));
      }

      return handleAssetOrSpa(request, env);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "Unexpected worker error."
        },
        { status: 500 }
      );
    }
  }
} satisfies ExportedHandler<Env>;
