/// <reference types="@cloudflare/workers-types" />

import type { DesmosProfile } from "../src/types/desmos";
import { HttpError } from "../src/lib/httpError";
import { getProposals, getProposalDetails } from "../src/lib/governance";
import { getProposalVoteTransactions, proposalVotesKey } from "../src/lib/proposalVoteTransactions";
import { resolvePage, type PageRoute, type PageSnapshot } from "../src/seo/page";
import { renderDocument, renderSitemap } from "./seo";

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
  const accountPrefix = hrp.endsWith("valoper") ? hrp.slice(0, -"valoper".length) : hrp;
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

  if (pathname.startsWith("/api/wallet/")) {
    return 0;
  }

  if (pathname.startsWith("/api/accounts/")) {
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
  if (ttl <= 0) {
    // Wallet reads must bypass existing edge entries and browser caches after
    // transaction confirmation, including entries from previous deployments.
    const response = await loader();
    response.headers.set("cache-control", "no-store");
    return response;
  }

  if (request.method !== "GET") {
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
  const response = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8_000) });

  if (!response.ok) {
    throw new HttpError(response.status, `Upstream ${response.status}: ${await response.text()}`);
  }

  return response.json<any>();
}

async function fetchRpcJson(env: Env, path: string, search?: Record<string, string>) {
  const url = new URL(path, `${trimTrailingSlash(env.DESMOS_RPC_URL)}/`);

  Object.entries(search ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetchJson(url);
  // Tendermint can report an RPC failure in a successful HTTP response.
  // Do not turn that into an empty, indexable block or transaction listing.
  if (response?.error) throw new HttpError(503, "Desmos RPC data is temporarily unavailable.");
  return response;
}

async function fetchRestJson(env: Env, path: string, search?: Array<[string, string]>, init?: RequestInit) {
  const url = new URL(path, `${trimTrailingSlash(env.DESMOS_REST_URL)}/`);

  (search ?? []).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  return fetchJson(url, init);
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

function resolveValidatorProfileByOperatorAddress(
  directory: ValidatorDirectory | undefined,
  operatorAddress: string
): Pick<ValidatorRecord, "moniker" | "identity"> {
  if (!directory || !operatorAddress) {
    return {
      moniker: "",
      identity: ""
    };
  }

  const validator = directory.byOperatorAddress.get(operatorAddress);

  return {
    moniker: validator?.moniker ?? "",
    identity: validator?.identity ?? ""
  };
}

function normalizeBlock(blockResponse: any, directory?: ValidatorDirectory) {
  const block = blockResponse?.result?.block ?? {};
  const proposerAddress = block?.header?.proposer_address ?? "";
  const proposer = directory?.byConsensusHexAddress.get(normalizeHexAddress(proposerAddress));

  return {
    height: Number(block?.header?.height ?? 0),
    hash: blockResponse?.result?.block_id?.hash ?? "",
    time: block?.header?.time ?? "",
    proposerAddress,
    proposerOperatorAddress: proposer?.operatorAddress ?? "",
    proposerMoniker: proposer?.moniker ?? "",
    proposerIdentity: proposer?.identity ?? "",
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
  const height = Number(status?.result?.sync_info?.latest_block_height);
  if (!Number.isSafeInteger(height) || height < 1) throw new HttpError(503, "Desmos RPC returned an invalid block height.");
  return height;
}

async function getRecentBlocks(env: Env, limit: number, directory?: ValidatorDirectory, before?: number) {
  const latestHeight = await getLatestHeight(env);
  const startHeight = before ? Math.min(before - 1, latestHeight) : latestHeight;
  const heights = Array.from({ length: Math.min(limit, startHeight) }, (_, index) => startHeight - index);
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

async function searchTransactionsByEvent(env: Env, query: string, limit: number) {
  const searchResponse = await fetchRpcJson(env, "/tx_search", {
    query: `"${query}"`,
    prove: "false",
    page: "1",
    per_page: String(limit),
    order_by: `"desc"`
  });

  return searchResponse?.result?.txs ?? [];
}

function sortRpcSearchTransactions(left: any, right: any) {
  const rightHeight = BigInt(String(right?.height ?? 0));
  const leftHeight = BigInt(String(left?.height ?? 0));

  if (rightHeight > leftHeight) {
    return 1;
  }

  if (rightHeight < leftHeight) {
    return -1;
  }

  const rightIndex = Number(right?.index ?? -1);
  const leftIndex = Number(left?.index ?? -1);

  return rightIndex - leftIndex;
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

function profilePictureUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    // Older profiles still reference Cloudflare's retired public IPFS gateways.
    // Resolve the same immutable CID and path through the Desmos gateway.
    if (["cloudflare-ipfs.com", "cf-ipfs.com"].includes(url.hostname) && url.pathname.startsWith("/ipfs/")) {
      url.protocol = "https:";
      url.host = "ipfs.desmos.network";
    }
    return url.href;
  } catch {
    return "";
  }
}

async function fetchDesmosProfile(env: Env, address: string, timeoutMs = 5_000): Promise<DesmosProfile | null> {
  if (!address) return null;
  try {
    const response = await fetchRestJson(env, `/desmos/profiles/v3/profiles/${encodeURIComponent(address)}`, undefined, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    const profile = response?.profile;
    const account = profile?.account;
    // Profiles wrap the validator's signing account, which may be a vesting
    // account. Never associate a profile by moniker, DTag or consensus address.
    const profileAddress = account?.address ?? account?.base_account?.address ?? account?.base_vesting_account?.base_account?.address;
    if (profileAddress !== address || typeof profile?.dtag !== "string" || !profile.dtag.trim()) return null;

    return {
      address,
      dtag: profile.dtag.trim(),
      nickname: typeof profile.nickname === "string" ? profile.nickname.trim() : "",
      bio: typeof profile.bio === "string" ? profile.bio.trim() : "",
      profilePicture: profilePictureUrl(profile.pictures?.profile),
      coverPicture: profilePictureUrl(profile.pictures?.cover),
      creationDate: typeof profile.creation_date === "string" && Number.isFinite(Date.parse(profile.creation_date))
        ? profile.creation_date : ""
    };
  } catch {
    // An absent profile or an unavailable optional query must not prevent staking.
    return null;
  }
}

async function getValidatorDetails(env: Env, validatorAddress: string) {
  const response = await fetchRestJson(env, `/cosmos/staking/v1beta1/validators/${validatorAddress}`);
  const validator = response?.validator ?? {};
  const normalizedValidator = await normalizeValidator(validator);
  const [keybaseProfile, desmosProfile] = await Promise.all([
    fetchKeybaseProfile(normalizedValidator.identity),
    fetchDesmosProfile(env, normalizedValidator.accountAddress)
  ]);

  return {
    validator: {
      ...normalizedValidator,
      minSelfDelegation: validator?.min_self_delegation ?? "0",
      unbondingHeight: validator?.unbonding_height ?? "0",
      unbondingTime: validator?.unbonding_time ?? "",
      delegatorShares: validator?.delegator_shares ?? "0"
    },
    keybaseProfile,
    desmosProfile
  };
}

async function getWalletOverview(env: Env, address: string) {
  const validatorDirectoryPromise = getValidatorDirectory(env);
  const fetchWalletState = (path: string) => fetchRestJson(env, path, undefined, { cache: "no-store" });
  const [balancesResponse, delegationsResponse, unbondingDelegationsResponse, redelegationsResponse, rewardsResponse] =
    await Promise.all([
      fetchWalletState(`/cosmos/bank/v1beta1/balances/${address}`),
      fetchWalletState(`/cosmos/staking/v1beta1/delegations/${address}`),
      fetchWalletState(`/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations`),
      fetchWalletState(`/cosmos/staking/v1beta1/delegators/${address}/redelegations`),
      fetchWalletState(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`)
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
    })),
    unbondingDelegations: (unbondingDelegationsResponse?.unbonding_responses ?? [])
      .flatMap((unbondingDelegation: any) => {
        const validatorAddress = unbondingDelegation?.validator_address ?? "";
        const validatorProfile = resolveValidatorProfileByOperatorAddress(validatorDirectory, validatorAddress);

        return (unbondingDelegation?.entries ?? []).map((entry: any) => ({
          validatorAddress,
          moniker: validatorProfile.moniker,
          identity: validatorProfile.identity,
          amount: entry?.balance ?? entry?.initial_balance ?? "0",
          completionTime: entry?.completion_time ?? ""
        }));
      })
      .sort((left: any, right: any) => (left.completionTime ?? "").localeCompare(right.completionTime ?? "")),
    redelegations: (redelegationsResponse?.redelegation_responses ?? [])
      .flatMap((redelegation: any) => {
        const sourceValidatorAddress = redelegation?.redelegation?.validator_src_address ?? "";
        const destinationValidatorAddress = redelegation?.redelegation?.validator_dst_address ?? "";
        const sourceValidatorProfile = resolveValidatorProfileByOperatorAddress(
          validatorDirectory,
          sourceValidatorAddress
        );
        const destinationValidatorProfile = resolveValidatorProfileByOperatorAddress(
          validatorDirectory,
          destinationValidatorAddress
        );

        return (redelegation?.entries ?? []).map((entry: any) => ({
          sourceValidatorAddress,
          sourceMoniker: sourceValidatorProfile.moniker,
          sourceIdentity: sourceValidatorProfile.identity,
          destinationValidatorAddress,
          destinationMoniker: destinationValidatorProfile.moniker,
          destinationIdentity: destinationValidatorProfile.identity,
          amount: entry?.balance ?? entry?.redelegation_entry?.initial_balance ?? "0",
          completionTime: entry?.redelegation_entry?.completion_time ?? entry?.completion_time ?? ""
        }));
      })
      .sort((left: any, right: any) => (left.completionTime ?? "").localeCompare(right.completionTime ?? ""))
  };
}

async function getRecentTransactionsForAccount(env: Env, address: string, limit: number) {
  const queries = [
    `message.sender='${address}'`,
    `transfer.sender='${address}'`,
    `transfer.recipient='${address}'`,
    `coin_spent.spender='${address}'`,
    `coin_received.receiver='${address}'`,
    `tx.fee_payer='${address}'`,
    `withdraw_rewards.delegator='${address}'`,
    `delegate.delegator='${address}'`,
    `redelegate.delegator='${address}'`,
    `unbond.delegator='${address}'`
  ];
  const searchResponses = await Promise.all(
    queries.map((query) => searchTransactionsByEvent(env, query, Math.max(limit, 12)).catch(() => []))
  );
  const txs = Array.from(
    new Map(
      searchResponses
        .flat()
        .filter((tx: any) => Boolean(tx?.hash))
        .map((tx: any) => [tx.hash, tx])
    ).values()
  ).sort(sortRpcSearchTransactions);
  const recentTxs = txs.slice(0, limit);
  const details = await Promise.all(
    recentTxs.map((tx: any) => fetchTransactionPayloadByHash(env, tx?.hash ?? "").catch(() => null))
  );

  return details
    .filter((detail: any) => Boolean(detail))
    .map((detail: any) => normalizeTransactionSummary(detail?.tx_response, detail?.tx))
    .sort((left, right) => {
      const rightHeight = BigInt(String(right.height || 0));
      const leftHeight = BigInt(String(left.height || 0));

      if (rightHeight > leftHeight) {
        return 1;
      }

      if (rightHeight < leftHeight) {
        return -1;
      }

      return (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
    })
    .slice(0, limit);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function getAccountDetails(env: Env, address: string) {
  const validatorDirectoryPromise = getValidatorDirectory(env);
  const [balancesResponse, delegationsResponse, unbondingDelegationsResponse, redelegationsResponse, recentTransactions] =
    await Promise.all([
    fetchRestJson(env, `/cosmos/bank/v1beta1/balances/${address}`),
    fetchRestJson(env, `/cosmos/staking/v1beta1/delegations/${address}`),
    fetchRestJson(env, `/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations`),
    fetchRestJson(env, `/cosmos/staking/v1beta1/delegators/${address}/redelegations`),
    withTimeout(getRecentTransactionsForAccount(env, address, 12).catch(() => []), 5_000, [])
  ]);
  const validatorDirectory = await validatorDirectoryPromise;
  const delegations = delegationsResponse?.delegation_responses ?? [];
  // The shared directory contains only bonded validators. Resolve the other
  // delegation targets directly, without adding them to the active set cache.
  const delegationValidators = new Map(validatorDirectory.byOperatorAddress);
  const missingValidators = [...new Set<string>(delegations
    .map((delegation: any) => delegation?.delegation?.validator_address)
    .filter((operator: unknown): operator is string => typeof operator === "string" && Boolean(operator)))]
    .filter((operator) => !delegationValidators.has(operator));
  await Promise.all(missingValidators.map(async (operator) => {
    try {
      const response = await fetchRestJson(env, `/cosmos/staking/v1beta1/validators/${encodeURIComponent(operator)}`, undefined, {
        signal: AbortSignal.timeout(1_500)
      });
      if (response?.validator?.operator_address === operator) {
        delegationValidators.set(operator, await normalizeValidator(response.validator));
      }
    } catch {
      // Optional validator metadata must not hide balances or delegations.
    }
  }));

  return {
    address,
    balances: (balancesResponse?.balances ?? []).map((balance: any) => ({
      denom: balance?.denom ?? "",
      amount: balance?.amount ?? "0"
    })),
    delegations: delegations.map((delegation: any) => {
      const validatorAddress = delegation?.delegation?.validator_address ?? "";
      const validator = delegationValidators.get(validatorAddress);
      return {
        validatorAddress,
        moniker: validator?.moniker ?? "",
        identity: validator?.identity ?? "",
        validatorStatus: validator?.status ?? null,
        validatorJailed: validator?.jailed ?? null,
        amount: delegation?.balance?.amount ?? "0"
      };
    }),
    unbondingDelegations: (unbondingDelegationsResponse?.unbonding_responses ?? [])
      .flatMap((unbondingDelegation: any) => {
        const validatorAddress = unbondingDelegation?.validator_address ?? "";
        const validatorProfile = resolveValidatorProfileByOperatorAddress(validatorDirectory, validatorAddress);

        return (unbondingDelegation?.entries ?? []).map((entry: any) => ({
          validatorAddress,
          moniker: validatorProfile.moniker,
          identity: validatorProfile.identity,
          amount: entry?.balance ?? entry?.initial_balance ?? "0",
          completionTime: entry?.completion_time ?? ""
        }));
      })
      .sort((left: any, right: any) => (left.completionTime ?? "").localeCompare(right.completionTime ?? "")),
    redelegations: (redelegationsResponse?.redelegation_responses ?? [])
      .flatMap((redelegation: any) => {
        const sourceValidatorAddress = redelegation?.redelegation?.validator_src_address ?? "";
        const destinationValidatorAddress = redelegation?.redelegation?.validator_dst_address ?? "";
        const sourceValidatorProfile = resolveValidatorProfileByOperatorAddress(
          validatorDirectory,
          sourceValidatorAddress
        );
        const destinationValidatorProfile = resolveValidatorProfileByOperatorAddress(
          validatorDirectory,
          destinationValidatorAddress
        );

        return (redelegation?.entries ?? []).map((entry: any) => ({
          sourceValidatorAddress,
          sourceMoniker: sourceValidatorProfile.moniker,
          sourceIdentity: sourceValidatorProfile.identity,
          destinationValidatorAddress,
          destinationMoniker: destinationValidatorProfile.moniker,
          destinationIdentity: destinationValidatorProfile.identity,
          amount: entry?.balance ?? entry?.redelegation_entry?.initial_balance ?? "0",
          completionTime: entry?.redelegation_entry?.completion_time ?? entry?.completion_time ?? ""
        }));
      })
      .sort((left: any, right: any) => (left.completionTime ?? "").localeCompare(right.completionTime ?? "")),
    recentTransactions
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
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? "20") || 20));
    const before = url.searchParams.has("before") ? Number(url.searchParams.get("before")) : undefined;
    if (before !== undefined && (!Number.isSafeInteger(before) || before <= 1)) return json({ error: "Invalid block height." }, { status: 400 });
    return json(await getRecentBlocks(env, limit, await getValidatorDirectory(env), before));
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

  if (segments[0] === "api" && segments[1] === "validators" && segments[3] === "profile" && segments.length === 4) {
    let accountAddress: string;
    try {
      if (!segments[2].startsWith("desmosvaloper1")) throw new Error("Invalid validator prefix.");
      accountAddress = deriveAccountAddressFromOperatorAddress(segments[2]);
    } catch {
      return json({ error: "Invalid validator address." }, { status: 400 });
    }
    // Query by account even when a validator is no longer in the bonded set.
    return json(await fetchDesmosProfile(env, accountAddress));
  }

  if (segments[0] === "api" && segments[1] === "validators" && segments[2]) {
    return json(await getValidatorDetails(env, segments[2]));
  }

  if (
    segments[0] === "api" &&
    segments[1] === "wallet" &&
    segments[2] &&
    segments[3] === "overview"
  ) {
    return json(await getWalletOverview(env, segments[2]));
  }

  if (segments[0] === "api" && segments[1] === "accounts" && segments[2]) {
    return json(await getAccountDetails(env, segments[2]));
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

async function loadPublicPage(env: Env, route: PageRoute): Promise<PageSnapshot> {
  const snapshot: PageSnapshot = { path: route.path, resources: {}, status: 200 };
  if (route.kind === "notfound") return { ...snapshot, status: 404 };
  if (route.kind === "wallet") return snapshot;
  try {
    let data: unknown;
    switch (route.kind) {
      case "home": data = await getDashboard(env); break;
      case "validators": data = await getValidators(env); break;
      case "validator": {
        try { deriveAccountAddressFromOperatorAddress(route.id!); } catch { throw new HttpError(404, "Validator not found."); }
        data = await getValidatorDetails(env, route.id!); break;
      }
      case "blocks": data = await getRecentBlocks(env, 20, await getValidatorDirectory(env), route.before); break;
      case "block": {
        if (Number(route.id) > await getLatestHeight(env)) throw new HttpError(404, "Block not found.");
        data = await getBlockDetails(env, route.id!); break;
      }
      case "transactions": data = await getRecentTransactions(env, 20); break;
      case "transaction": data = await getTransactionDetails(env, route.id!); break;
      case "proposals": data = await getProposals(undefined, env.DESMOS_REST_URL); break;
      case "proposal": {
        const [proposal, votes] = await Promise.allSettled([
          getProposalDetails(route.id!, env.DESMOS_REST_URL),
          // Vote history is optional. Keep slow/disabled transaction search
          // from turning otherwise available proposal HTML into an error page.
          getProposalVoteTransactions(route.id!, env.DESMOS_REST_URL, 2_000)
        ]);
        if (proposal.status === "rejected") throw proposal.reason;
        data = proposal.value;
        const key = proposalVotesKey(route.id!);
        if (votes.status === "fulfilled") snapshot.resources[key] = votes.value;
        else snapshot.errors = { [key]: { status: 503, message: "Vote transaction search is temporarily unavailable." } };
        break;
      }
      case "account": {
        try { decodeBech32(route.id!); } catch { throw new HttpError(404, "Account not found."); }
        data = await getAccountDetails(env, route.id!); break;
      }
    }
    snapshot.resources[route.key] = data;
    if (route.kind === "validator") {
      const details = data as Awaited<ReturnType<typeof getValidatorDetails>>;
      snapshot.resources[`/api/validators/${route.id}/profile`] = details.desmosProfile;
    }
    // Include a bounded set of optional identities in the initial HTML. The
    // browser refreshes profiles separately after hydration, as before.
    const addresses = new Set<string>();
    function collect(value: unknown) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["operatorAddress", "proposerOperatorAddress", "validatorAddress", "sourceValidatorAddress", "destinationValidatorAddress"].includes(key) &&
          typeof child === "string" && child.startsWith("desmosvaloper1")) addresses.add(child);
        else if (typeof child === "object") collect(child);
      }
    }
    collect(data);
    await Promise.all([...addresses].slice(0, 20).map(async (operator) => {
        const key = `/api/validators/${operator}/profile`;
        if (key in snapshot.resources) return;
        try {
          snapshot.resources[key] = await fetchDesmosProfile(env, deriveAccountAddressFromOperatorAddress(operator), 1_500);
        } catch { snapshot.resources[key] = null; }
    }));
    return snapshot;
  } catch (error) {
    const detailPage = ["validator", "block", "transaction", "proposal", "account"].includes(route.kind);
    const status = detailPage && error instanceof HttpError && [400, 404].includes(error.status) ? 404 : 503;
    return { path: route.path, resources: {}, status, errors: route.key ? { [route.key]: {
      status, message: status === 404 ? "The requested item was not found." : "Desmos data is temporarily unavailable. Please try again shortly."
    } } : {} };
  }
}

async function loadSitemap(env: Env) {
  const paths: Array<{ path: string; modified?: string }> = ["/", "/validators", "/blocks", "/transactions", "/proposals"].map((path) => ({ path }));
  const results = await Promise.allSettled([
    getValidators(env), getProposals(undefined, env.DESMOS_REST_URL),
    getRecentBlocks(env, 20), getRecentTransactions(env, 20)
  ]);
  const [validators, proposals, blocks, transactions] = results;
  if (validators.status === "fulfilled") paths.push(...validators.value.map((v) => ({ path: `/validators/${v.operatorAddress}` })));
  if (proposals.status === "fulfilled") paths.push(...proposals.value.map((p) => ({ path: `/proposals/${p.id}` })));
  if (blocks.status === "fulfilled") paths.push(...blocks.value.map((b) => ({ path: `/blocks/${b.height}`, modified: b.time })));
  if (transactions.status === "fulfilled") paths.push(...transactions.value.map((tx) => ({ path: `/transactions/${tx.hash}`, modified: tx.timestamp })));
  return new Response(renderSitemap(paths), { headers: { "content-type": "application/xml; charset=utf-8" } });
}

async function handleDocument(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (url.pathname === "/sitemap.xml") {
    const response = await withCache(request, ctx, 300, () => loadSitemap(env));
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
  if (url.pathname === "/index.html") return Response.redirect(new URL("/", url), 308);
  if (url.pathname.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(url.pathname)) return env.ASSETS.fetch(request);
  const route = resolvePage(url.pathname + url.search);
  if (route.kind !== "notfound" && url.pathname !== route.path.split("?")[0]) {
    const destination = new URL(route.path, url.origin);
    return Response.redirect(destination, 308);
  }
  const cacheRequest = new Request(new URL(route.path, url.origin), request);
  return withCache(cacheRequest, ctx, ["wallet", "notfound"].includes(route.kind) ? 0 : 30, async () => {
    const snapshot = await withTimeout(loadPublicPage(env, route), 10_000, {
      path: route.path, resources: {}, status: 503,
      errors: { [route.key]: { status: 503, message: "Desmos data is temporarily unavailable. Please try again shortly." } }
    });
    return renderDocument(request, env.ASSETS, snapshot);
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) {
        return handleRpcProxy(request, env);
      }

      if (url.pathname.startsWith("/api/")) {
        const response = await withCache(request, ctx, getCacheTtl(url.pathname), () => handleApi(request, env));
        const headers = new Headers(response.headers);
        headers.set("x-robots-tag", "noindex");
        return new Response(response.body, { status: response.status, headers });
      }

      return await handleDocument(request, env, ctx);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "Unexpected worker error."
        },
        { status: error instanceof HttpError && error.status === 404 ? 404 : 502,
          headers: { "x-robots-tag": "noindex", "cache-control": "no-store" } }
      );
    }
  }
} satisfies ExportedHandler<Env>;
