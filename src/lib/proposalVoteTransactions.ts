import { DESMOS_CHAIN } from "../config/chain";
import type { ProposalTally, ProposalVoteTransaction, ProposalVoteTransactionsPayload } from "../types/desmos";
import { tallyPercentage } from "./governance";
import { HttpError } from "./httpError";

export const RECENT_PROPOSAL_VOTES_LIMIT = 10;
export const proposalVotesKey = (proposalId: string) => `proposal-votes:${proposalId}`;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionKey(value: unknown): keyof ProposalTally | "unknown" {
  switch (value) {
    case "VOTE_OPTION_YES": case 1: return "yes";
    case "VOTE_OPTION_ABSTAIN": case 2: return "abstain";
    case "VOTE_OPTION_NO": case 3: return "no";
    case "VOTE_OPTION_NO_WITH_VETO": case 4: return "noWithVeto";
    default: return "unknown";
  }
}

function weightPercentage(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^(0(?:\.\d{1,18})?|1(?:\.0{1,18})?)$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  return tallyPercentage(units.toString(), 10n ** 18n);
}

function extractVotes(tx: unknown, proposalId: string): Pick<ProposalVoteTransaction, "votes" | "voteCount"> {
  const messages = record(record(tx).body).messages;
  if (!Array.isArray(messages)) return { votes: [], voteCount: 0 };
  const pending: unknown[] = [...messages].reverse();
  const votes: ProposalVoteTransaction["votes"] = [];
  let voteCount = 0;
  while (pending.length) {
    const message = record(pending.pop());
    const type = message["@type"];
    // Authorized votes belong to the nested voter, not the MsgExec grantee.
    if (type === "/cosmos.authz.v1beta1.MsgExec" && Array.isArray(message.msgs)) {
      for (let index = message.msgs.length - 1; index >= 0; index--) pending.push(message.msgs[index]);
      continue;
    }
    if (typeof type !== "string" || !/^\/cosmos\.gov\.(v1|v1beta1)\.MsgVote(Weighted)?$/.test(type) || message.proposal_id !== proposalId) continue;
    voteCount += 1;
    // Bound both the rendered rows and the server's hydration payload.
    if (votes.length === 3) continue;
    const weighted = type.endsWith("MsgVoteWeighted");
    const options = weighted
      ? (Array.isArray(message.options) ? message.options.slice(0, 4).map((entry) => {
        const option = record(entry);
        return { option: optionKey(option.option), percentage: weightPercentage(option.weight) };
      }) : [])
      : [{ option: optionKey(message.option) }];
    votes.push({
      voter: typeof message.voter === "string" && /^desmos1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(message.voter) ? message.voter : "",
      weighted,
      options
    });
  }
  return { votes, voteCount };
}

export async function getProposalVoteTransactions(
  proposalId: string, restUrl: string = DESMOS_CHAIN.restUrl, timeoutMs = 15_000
): Promise<ProposalVoteTransactionsPayload> {
  if (!/^[1-9]\d*$/.test(proposalId)) throw new Error("Invalid proposal id.");
  const url = new URL("/cosmos/tx/v1beta1/txs", restUrl);
  // Desmos's REST gateway expects the numeric ORDER_BY_DESC enum (2).
  url.search = new URLSearchParams({
    events: `proposal_vote.proposal_id='${proposalId}'`, order_by: "2", page: "1", limit: String(RECENT_PROPOSAL_VOTES_LIMIT)
  }).toString();
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new HttpError(response.status, `Desmos transaction search returned HTTP ${response.status}.`);
  const payload = record(await response.json());
  const txs = payload.txs;
  const results = payload.tx_responses;
  // The API returns decoded transactions and their results in corresponding
  // order. Reject mismatches rather than attach a voter to the wrong hash.
  if (!Array.isArray(txs) || !Array.isArray(results) || txs.length !== results.length) {
    throw new Error("The API returned incomplete vote transaction data.");
  }
  const seen = new Set<string>();
  const transactions: ProposalVoteTransaction[] = [];
  for (let index = 0; index < Math.min(results.length, RECENT_PROPOSAL_VOTES_LIMIT); index++) {
    const result = record(results[index]);
    if (typeof result.txhash !== "string" || !/^[a-f\d]{64}$/i.test(result.txhash) ||
        typeof result.height !== "string" || !/^[1-9]\d*$/.test(result.height)) {
      throw new Error("The API returned incomplete vote transaction data.");
    }
    const hash = result.txhash.toUpperCase();
    if (seen.has(hash)) continue;
    seen.add(hash);
    transactions.push({
      hash,
      height: result.height,
      timestamp: typeof result.timestamp === "string" && Number.isFinite(Date.parse(result.timestamp)) ? result.timestamp : "",
      code: typeof result.code === "number" && Number.isSafeInteger(result.code) && result.code >= 0 ? result.code : null,
      ...extractVotes(txs[index], proposalId)
    });
  }
  return { transactions, updatedAt: new Date().toISOString() };
}
