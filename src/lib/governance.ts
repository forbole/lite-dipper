import { DESMOS_CHAIN } from "../config/chain";
import { HttpError } from "./httpError";
import type { ProposalDetailsPayload, ProposalSummary, ProposalTally, ProposalTallyParams } from "../types/desmos";

const DECIMAL_SCALE = 10n ** 18n;

function ratioUnits(ratio: string): bigint {
  const [whole, fraction = ""] = ratio.split(".");
  return BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(18, "0"));
}

function extractTallyParams(source: Record<string, unknown> | undefined, expedited: boolean): ProposalTallyParams | undefined {
  const values = [source?.quorum, expedited ? source?.expedited_threshold : source?.threshold, source?.veto_threshold];
  if (!values.every((value): value is string => typeof value === "string" && /^(0(?:\.\d{1,18})?|1(?:\.0{1,18})?)$/.test(value))) {
    return undefined;
  }
  return { quorum: values[0], threshold: values[1], vetoThreshold: values[2] };
}

interface RestMessage {
  "@type"?: string;
  title?: string;
  summary?: string;
  description?: string;
  content?: { title?: string; description?: string };
  plan?: { name?: string };
}

interface RestProposal {
  id: string;
  title?: string;
  summary?: string;
  status: string;
  proposer?: string;
  submit_time?: string;
  voting_end_time?: string;
  metadata?: string;
  expedited?: boolean;
  messages?: RestMessage[];
  final_tally_result?: Record<string, unknown>;
}

async function governanceGet<T>(path: string, restUrl: string = DESMOS_CHAIN.restUrl): Promise<T> {
  const response = await fetch(new URL(path, restUrl), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new HttpError(response.status, `Desmos API returned HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

function normalizeProposal(proposal: RestProposal): ProposalSummary {
  const firstMessage = proposal.messages?.[0];

  return {
    id: proposal.id,
    title: proposal.title || firstMessage?.title || firstMessage?.content?.title ||
      firstMessage?.plan?.name || proposal.metadata || "Untitled proposal",
    status: proposal.status,
    proposer: proposal.proposer ?? "",
    submitTime: proposal.submit_time ?? "",
    votingEndTime: proposal.voting_end_time ?? ""
  };
}

function extractTally(source?: Record<string, unknown>): ProposalTally | undefined {
  const values = [
    source?.yes_count ?? source?.yes,
    source?.no_count ?? source?.no,
    source?.abstain_count ?? source?.abstain,
    source?.no_with_veto_count ?? source?.no_with_veto
  ];

  // Missing or malformed counts are unavailable, not zero votes.
  if (!values.every((value): value is string => typeof value === "string" && /^\d+$/.test(value))) {
    return undefined;
  }

  return { yes: values[0], no: values[1], abstain: values[2], noWithVeto: values[3] };
}

export async function getProposals(_path?: string, restUrl: string = DESMOS_CHAIN.restUrl): Promise<ProposalSummary[]> {
  const response = await governanceGet<{ proposals: RestProposal[] }>(
    "/cosmos/gov/v1/proposals?pagination.limit=20&pagination.reverse=true", restUrl
  );
  return response.proposals.map(normalizeProposal);
}

export async function getProposalDetails(proposalId: string, restUrl: string = DESMOS_CHAIN.restUrl): Promise<ProposalDetailsPayload> {
  if (!/^[1-9]\d*$/.test(proposalId)) {
    throw new Error("Invalid proposal id.");
  }

  const path = `/cosmos/gov/v1/proposals/${proposalId}`;
  const { proposal } = await governanceGet<{ proposal: RestProposal }>(path, restUrl);
  const isVoting = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  const isFinal = ["PROPOSAL_STATUS_PASSED", "PROPOSAL_STATUS_REJECTED", "PROPOSAL_STATUS_FAILED"]
    .includes(proposal.status);
  let tally: ProposalTally | undefined;
  let tallyError: string | undefined;
  let bondedTokens: string | undefined;
  let bondedTokensError: string | undefined;
  let tallyParams: ProposalTallyParams | undefined;
  let tallyParamsError: string | undefined;

  if (isVoting) {
    // Fetch current state queries together. A missing staking pool must
    // not hide the tally, and a current pool must never be used for a final tally.
    const [tallyResult, poolResult, paramsResult] = await Promise.allSettled([
      governanceGet<{ tally: Record<string, unknown> }>(`${path}/tally`, restUrl),
      governanceGet<{ pool?: { bonded_tokens?: unknown } }>("/cosmos/staking/v1beta1/pool", restUrl),
      governanceGet<{ params?: Record<string, unknown>; tally_params?: Record<string, unknown> }>("/cosmos/gov/v1/params/tallying", restUrl)
    ]);
    try {
      // final_tally_result remains zero during voting. Query the chain's live
      // stake-weighted tally; counting vote transactions would be incorrect.
      if (tallyResult.status === "rejected") throw tallyResult.reason;
      tally = extractTally(tallyResult.value.tally);
      if (!tally) throw new Error("The API returned an incomplete tally.");
    } catch (error) {
      tallyError = error instanceof Error ? error.message : "Unable to load the current tally.";
    }
    try {
      if (poolResult.status === "rejected") throw poolResult.reason;
      const amount = poolResult.value.pool?.bonded_tokens;
      if (typeof amount !== "string" || !/^\d+$/.test(amount) || BigInt(amount) === 0n) {
        throw new Error("The API did not return a positive bonded total.");
      }
      bondedTokens = amount;
    } catch (error) {
      bondedTokensError = error instanceof Error ? error.message : "Unable to load current bonded power.";
    }
    try {
      if (paramsResult.status === "rejected") throw paramsResult.reason;
      tallyParams = extractTallyParams(paramsResult.value.params ?? paramsResult.value.tally_params, Boolean(proposal.expedited));
      if (!tallyParams) throw new Error("The API returned incomplete voting thresholds.");
    } catch (error) {
      tallyParamsError = error instanceof Error ? error.message : "Unable to load voting thresholds.";
    }
  } else if (isFinal) {
    tally = extractTally(proposal.final_tally_result);
    if (!tally) tallyError = "The API did not return a final tally.";
  }

  const firstMessage = proposal.messages?.[0];
  return {
    proposal: {
      ...normalizeProposal(proposal),
      summary: proposal.summary || firstMessage?.summary || firstMessage?.content?.description ||
        firstMessage?.description || "",
      metadata: proposal.metadata ?? "",
      expedited: Boolean(proposal.expedited),
      messages: (proposal.messages ?? []).map((message) => message["@type"] ?? "Unknown"),
      tally,
      tallyKind: isVoting ? "live" : isFinal ? "final" : undefined,
      tallyError,
      bondedTokens,
      bondedTokensError,
      tallyParams,
      tallyParamsError
    },
    updatedAt: new Date().toISOString()
  };
}

export function tallyPercentage(amount: string, total: bigint): string {
  if (total === 0n) return "0.00%";
  const hundredths = (BigInt(amount) * 10_000n + total / 2n) / total;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

export function getVotingProgress(tally: ProposalTally, bondedTokens: string, params: ProposalTallyParams) {
  const total = Object.values(tally).reduce((sum, amount) => sum + BigInt(amount), 0n);
  const nonAbstaining = total - BigInt(tally.abstain);
  const quorum = ratioUnits(params.quorum);
  const threshold = ratioUnits(params.threshold);
  const vetoThreshold = ratioUnits(params.vetoThreshold);
  // Compare unrounded ratios. Cosmos accepts equality at quorum and veto,
  // but requires strictly more Yes power than the approval threshold.
  const quorumMet = BigInt(bondedTokens) > 0n && total * DECIMAL_SCALE >= BigInt(bondedTokens) * quorum;
  const approvalMet = nonAbstaining > 0n && BigInt(tally.yes) * DECIMAL_SCALE > nonAbstaining * threshold;
  const vetoExceeded = BigInt(tally.noWithVeto) * DECIMAL_SCALE > total * vetoThreshold;
  const status = !quorumMet ? "quorum" : nonAbstaining === 0n ? "abstaining" : vetoExceeded ? "veto" : !approvalMet ? "approval" : "passing";

  return {
    status, quorumMet, approvalMet, vetoExceeded,
    quorumPercent: tallyPercentage(quorum.toString(), DECIMAL_SCALE),
    approvalThresholdPercent: tallyPercentage(threshold.toString(), DECIMAL_SCALE),
    vetoThresholdPercent: tallyPercentage(vetoThreshold.toString(), DECIMAL_SCALE),
    yesPercent: tallyPercentage(tally.yes, nonAbstaining),
    vetoPercent: tallyPercentage(tally.noWithVeto, total)
  } as const;
}
