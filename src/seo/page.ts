import type { AccountDetailsPayload, BlockDetailsPayload, ProposalDetailsPayload, TransactionDetailsPayload, ValidatorDetailsPayload } from "../types/desmos";

export const SITE_ORIGIN = "https://lite.desmos.network";
export const SITE_DESCRIPTION = "Explore Desmos validators, blocks, transactions, accounts and governance proposals. Connect Keplr or Ledger to manage DSM in your browser.";
export type Resources = Record<string, unknown>;
export interface PageSnapshot {
  path: string;
  resources: Resources;
  errors?: Record<string, { status: number; message: string }>;
  status?: number;
}
export type PageKind = "home" | "validators" | "validator" | "blocks" | "block" | "transactions" | "transaction" | "proposals" | "proposal" | "account" | "wallet" | "notfound";
export interface PageRoute { kind: PageKind; path: string; key: string; id?: string; before?: number }

export function resolvePage(input: string): PageRoute {
  const url = new URL(input, SITE_ORIGIN);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const list: Record<string, [PageKind, string]> = {
    "/": ["home", "/api/dashboard"], "/validators": ["validators", "/api/validators"],
    "/blocks": ["blocks", "/api/blocks?limit=20"], "/transactions": ["transactions", "/api/transactions?limit=20"],
    "/proposals": ["proposals", "proposals"], "/wallet": ["wallet", ""]
  };
  if (list[path]) {
    const [kind, key] = list[path];
    const value = url.searchParams.get("before");
    if (kind === "blocks" && value !== null) {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 1) {
        return { kind: "notfound", path, key: "" };
      }
      const before = Number(value);
      return { kind, path: `${path}?before=${before}`, key: `${key}&before=${before}`, before };
    }
    return { kind, path, key };
  }
  const id = parts[1] ?? "";
  if (parts.length === 2) {
    if (parts[0] === "validators" && /^desmosvaloper1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(id))
      return { kind: "validator", path, key: `/api/validators/${id}`, id };
    if (parts[0] === "accounts" && /^desmos1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(id))
      return { kind: "account", path, key: `/api/accounts/${id}`, id };
    if (parts[0] === "blocks" && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)))
      return { kind: "block", path: `/blocks/${Number(id)}`, key: `/api/blocks/${Number(id)}`, id: String(Number(id)) };
    if (parts[0] === "transactions" && /^[\da-f]{64}$/i.test(id))
      return { kind: "transaction", path: `/transactions/${id.toUpperCase()}`, key: `/api/transactions/${id.toUpperCase()}`, id: id.toUpperCase() };
    if (parts[0] === "proposals" && /^[1-9]\d*$/.test(id))
      return { kind: "proposal", path, key: id, id };
  }
  return { kind: "notfound", path, key: "" };
}

export function plainText(value: string, limit = 170): string {
  return value.replace(/<[^>]*>/g, " ").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export interface PageMetadata { title: string; description: string; canonical: string; image: string; noindex: boolean; label: string }
export function pageMetadata(route: PageRoute, resources: Resources, status = 200): PageMetadata {
  const defaults: Record<PageKind, [string, string]> = {
    home: ["Desmos Blockchain Explorer", SITE_DESCRIPTION],
    validators: ["Desmos Validators", "Compare active Desmos validators, voting power and commission rates. View validator profiles and delegate DSM."],
    validator: ["Desmos Validator", `Validator ${route.id ?? ""} on Desmos: profile, voting power, commission and delegation information.`],
    blocks: [route.before ? `Desmos Blocks Before ${route.before}` : "Desmos Blocks", "Browse finalized Desmos blocks, proposers, timestamps and transaction counts."],
    block: [`Desmos Block ${route.id}`, `Explore Desmos block ${route.id}, its proposer, signing validators and transactions.`],
    transactions: ["Desmos Transactions", "Browse recent Desmos transactions, execution results, message types and gas usage."],
    transaction: [`Desmos Transaction ${route.id}`, `Transaction ${route.id} on Desmos: status, messages, fees, gas and block details.`],
    proposals: ["Desmos Governance Proposals", "Explore Desmos governance proposals, voting periods, live stake-weighted tallies and final results."],
    proposal: [`Desmos Proposal #${route.id}`, `View Desmos governance proposal ${route.id}, its summary, voting period and results.`],
    account: [`Desmos Account ${route.id}`, `Public balances, delegations, unbonding entries and recent transactions for ${route.id} on Desmos.`],
    wallet: ["Desmos Wallet", "Connect Keplr or Ledger to manage DSM, delegate, claim rewards and transfer tokens from your browser."],
    notfound: ["Page Not Found", "The requested page could not be found on Lite-Dipper."]
  };
  let [label, description] = defaults[route.kind];
  let image = `${SITE_ORIGIN}/social-card.png`;
  const data = resources[route.key];
  if (route.kind === "validator" && data) {
    const { validator, desmosProfile: profile } = data as ValidatorDetailsPayload;
    const name = plainText(profile?.nickname || validator.moniker, 100);
    label = `${name} — Desmos Validator`;
    description = plainText(profile?.bio || validator.details || `Explore ${name}'s validator profile, voting power and commission on Desmos.`);
    if (profile?.profilePicture?.startsWith("https://")) image = profile.profilePicture;
  } else if (route.kind === "proposal" && data) {
    const { proposal } = data as ProposalDetailsPayload;
    label = `Proposal #${proposal.id}: ${plainText(proposal.title, 110)}`;
    description = plainText(proposal.summary || `Desmos proposal ${proposal.id}: ${proposal.title}. View its status and voting results.`);
  } else if (route.kind === "block" && data) {
    const { block } = data as BlockDetailsPayload;
    description = `Desmos block ${block.height}, committed ${block.time}. ${block.txCount} transactions. Proposer: ${block.proposerMoniker || block.proposerAddress}.`;
  } else if (route.kind === "transaction" && data) {
    const tx = data as TransactionDetailsPayload;
    description = `${tx.code === 0 ? "Successful" : "Failed"} Desmos transaction at block ${tx.height}. ${tx.messages.map((m) => m.typeUrl.split(".").at(-1)).join(", ")}. Gas used: ${tx.gasUsed}.`;
  } else if (route.kind === "account" && data) {
    const account = data as AccountDetailsPayload;
    description = `Public Desmos account ${account.address}. View balances and ${account.delegations.length} delegations, unbonding entries and recent transactions.`;
  }
  if (status === 404) [label, description] = defaults.notfound;
  if (status >= 500) [label, description] = ["Temporarily Unavailable", "Desmos data is temporarily unavailable. Please try again shortly."];
  return { title: `${label} | Lite-Dipper`, label, description: plainText(description),
    canonical: SITE_ORIGIN + route.path, image, noindex: route.kind === "wallet" || route.kind === "notfound" || status === 404 };
}
