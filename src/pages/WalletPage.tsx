import { useState } from "react";
import { Link } from "react-router-dom";
import { CopyIconButton } from "../components/ui/CopyIconButton";
import { Panel } from "../components/ui/Panel";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { DESMOS_CHAIN } from "../config/chain";
import { useApiResource } from "../hooks/useApiResource";
import {
  formatDateTime,
  formatFixedDsmFromMicro,
  formatFixedDsmFromMicroDecimal,
  formatTimeRemaining,
  isPositiveDecimal,
  parseDsmToMicro,
  truncateMiddle
} from "../lib/format";
import type { WalletOverviewPayload } from "../types/desmos";
import { useWallet } from "../wallet/WalletProvider";

type WalletRoute = "native" | "ibc";

export function WalletPage() {
  const {
    connection,
    ledgerSelection,
    connecting,
    error,
    connectKeplr,
    connectLedger,
    connectLedgerAddress,
    nextLedgerAccount,
    previousLedgerAccount,
    nextLedgerPage,
    previousLedgerPage,
    cancelLedgerSelection,
    disconnect,
    sendDsm,
    withdrawAllRewards,
    withdrawRewards,
    transferToOsmosis
  } = useWallet();
  const { data, loading, refresh } = useApiResource<WalletOverviewPayload>(
    connection ? `/api/wallet/${connection.address}/overview` : "/api/config",
    {
      enabled: Boolean(connection),
      pollMs: 20_000
    }
  );
  const [route, setRoute] = useState<WalletRoute>("native");
  const [recipient, setRecipient] = useState("");
  const [amountDsm, setAmountDsm] = useState("");
  const [memo, setMemo] = useState("");
  const [channelId, setChannelId] = useState<string>(DESMOS_CHAIN.osmosisChannelId);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [claimingValidatorAddress, setClaimingValidatorAddress] = useState<string | null>(null);
  const [claimAllSubmitting, setClaimAllSubmitting] = useState(false);
  const [rewardResult, setRewardResult] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [connectIntent, setConnectIntent] = useState<"keplr" | "ledger" | null>(null);
  const availableBalanceAmount = data?.balances.find((balance) => balance.denom === DESMOS_CHAIN.denom)?.amount ?? "0";
  const availableBalanceDisplay = formatFixedDsmFromMicro(availableBalanceAmount);
  const claimableDelegations = data?.delegations.filter((delegation) => isPositiveDecimal(delegation.rewardAmount)) ?? [];
  const hasClaimableRewards = claimableDelegations.length > 0;
  const amountInput = amountDsm.trim();
  let amountValidationError: string | null = null;
  let amountValidationWarning: string | null = null;

  if (amountInput) {
    try {
      const requestedAmount = BigInt(parseDsmToMicro(amountInput));
      const availableAmount = BigInt(availableBalanceAmount);

      if (requestedAmount > availableAmount) {
        amountValidationError = `Amount cannot exceed the available balance of ${availableBalanceDisplay}.`;
      } else if (requestedAmount === availableAmount && availableAmount > 0n) {
        amountValidationWarning = "This uses the full balance. Leave some DSM for transaction fees.";
      }
    } catch (error) {
      amountValidationError = error instanceof Error ? error.message : "Invalid amount.";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setSubmitError(null);

    try {
      if (amountValidationError) {
        throw new Error(amountValidationError);
      }

      if (route === "native") {
        const response = await sendDsm({
          recipient,
          amountDsm,
          memo
        });
        setResult(response.transactionHash);
      } else {
        const response = await transferToOsmosis({
          recipient,
          amountDsm,
          memo,
          channelId
        });
        setResult(response.transactionHash);
      }

      refresh();
    } catch (nextError) {
      setSubmitError(nextError instanceof Error ? nextError.message : "Unable to submit transfer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaimRewards(validatorAddress: string) {
    setClaimingValidatorAddress(validatorAddress);
    setRewardResult(null);
    setRewardError(null);

    try {
      const response = await withdrawRewards({ validatorAddress });
      setRewardResult(response.transactionHash);
      refresh();
    } catch (nextError) {
      setRewardError(nextError instanceof Error ? nextError.message : "Unable to claim rewards.");
    } finally {
      setClaimingValidatorAddress(null);
    }
  }

  async function handleClaimAllRewards() {
    setClaimAllSubmitting(true);
    setRewardResult(null);
    setRewardError(null);

    try {
      if (!hasClaimableRewards) {
        throw new Error("There are no claimable rewards across the current delegations.");
      }

      const response = await withdrawAllRewards({
        validatorAddresses: claimableDelegations.map((delegation) => delegation.validatorAddress)
      });
      setRewardResult(response.transactionHash);
      refresh();
    } catch (nextError) {
      setRewardError(nextError instanceof Error ? nextError.message : "Unable to claim all rewards.");
    } finally {
      setClaimAllSubmitting(false);
    }
  }

  async function handleConnectKeplr() {
    setConnectIntent("keplr");

    try {
      await connectKeplr();
    } finally {
      setConnectIntent(null);
    }
  }

  async function handleConnectLedger() {
    setConnectIntent("ledger");

    try {
      await connectLedger();
    } finally {
      setConnectIntent(null);
    }
  }

  if (!connection) {
    return (
      <Panel title="Connect Wallet" subtitle="Keplr and Ledger Desmos app supported">
        <div className="grid gap-4">
          <button
            type="button"
            disabled={connecting}
            onClick={() => {
              void handleConnectKeplr().catch(() => undefined);
            }}
            className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.15),rgba(37,99,235,0.08))] p-5 text-left transition hover:border-sky-300/30 hover:bg-[linear-gradient(135deg,rgba(14,165,233,0.22),rgba(37,99,235,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <p className="font-display text-xl text-white">{connectIntent === "keplr" && connecting ? "Connecting Keplr…" : "Keplr"}</p>
            <p className="mt-2 text-sm text-slate-300">
              {connectIntent === "keplr" && connecting
                ? "Waiting for the Keplr extension to approve the connection."
                : "Extension-driven flow with chain suggestion and account discovery."}
            </p>
          </button>

          <button
            type="button"
            disabled={connecting}
            onClick={() => {
              void handleConnectLedger().catch(() => undefined);
            }}
            className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(252,211,77,0.15),rgba(249,115,22,0.08))] p-5 text-left transition hover:border-amber-300/30 hover:bg-[linear-gradient(135deg,rgba(252,211,77,0.22),rgba(249,115,22,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <p className="font-display text-xl text-white">
              {connectIntent === "ledger" && connecting ? "Connecting Ledger…" : "Ledger"}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {connectIntent === "ledger" && connecting
                ? "Communicating with Ledger now. Keep the Desmos app open on your device."
                : "Direct browser signing path with account selection. Use the Desmos app on the Ledger device."}
            </p>
          </button>
        </div>

        {connectIntent === "ledger" && connecting ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Loading Ledger addresses. This can take a few seconds while the app talks to your device.
          </div>
        ) : null}

        {ledgerSelection ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-white">Choose a Ledger address</p>
                <p className="mt-1 text-xs text-slate-400">
                  Account {ledgerSelection.accountNumber} · page {ledgerSelection.page + 1} · showing 10 addresses
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={connecting || ledgerSelection.accountNumber === 0}
                  onClick={() => {
                    void previousLedgerAccount();
                  }}
                  className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous account
                </button>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => {
                    void nextLedgerAccount();
                  }}
                  className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next account
                </button>
                <button
                  type="button"
                  disabled={connecting || ledgerSelection.page === 0}
                  onClick={() => {
                    void previousLedgerPage();
                  }}
                  className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous 10
                </button>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => {
                    void nextLedgerPage();
                  }}
                  className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next 10
                </button>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => {
                    void cancelLedgerSelection();
                  }}
                  className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {ledgerSelection.accounts.map((account) => (
                <div
                  key={account.address}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Address index {account.derivationIndex}
                      </p>
                      <p className="mt-2 break-all text-sm text-white">{account.address}</p>
                      <p className="mt-1 text-xs text-slate-400">{account.hdPath}</p>
                    </div>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => {
                        void connectLedgerAddress(account.address);
                      }}
                      className="inline-flex rounded-2xl border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use this address
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/45 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-300">{connection.name} connected</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="min-w-0 break-all text-white">{connection.address}</p>
            <CopyIconButton value={connection.address} />
          </div>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
        >
          Disconnect
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        <Panel title="Wallet Overview" subtitle="Balances and staking positions">
          {connection && loading && !data ? <p className="text-sm text-slate-300">Loading wallet state…</p> : null}
          {connection && data ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Balances</p>
                <div className="mt-3 space-y-2">
                  {data.balances.map((balance) => (
                    <div key={`${balance.denom}-${balance.amount}`} className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
                      {balance.denom === "udsm" ? formatFixedDsmFromMicro(balance.amount) : `${balance.amount} ${balance.denom}`}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Delegations</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-slate-400">
                      Total rewards: {formatFixedDsmFromMicroDecimal(data.totalRewardAmount)}
                    </span>
                    <button
                      type="button"
                      disabled={!hasClaimableRewards || claimAllSubmitting || Boolean(claimingValidatorAddress)}
                      onClick={() => {
                        void handleClaimAllRewards();
                      }}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {claimAllSubmitting ? "Claiming all…" : "Claim all rewards"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {data.delegations.length === 0 ? (
                    <p className="text-sm text-slate-300">No active delegations.</p>
                  ) : (
                    data.delegations.map((delegation) => (
                      <div
                        key={delegation.validatorAddress}
                        className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <Link
                            to={`/validators/${delegation.validatorAddress}`}
                            className="min-w-0 flex-1 transition hover:text-white"
                          >
                            <div className="flex items-center gap-3">
                              <ValidatorAvatar
                                identity={delegation.identity}
                                moniker={delegation.moniker || truncateMiddle(delegation.validatorAddress)}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div>{delegation.moniker || truncateMiddle(delegation.validatorAddress)}</div>
                                <div className="mt-1 text-xs text-slate-500">{truncateMiddle(delegation.validatorAddress)}</div>
                              </div>
                            </div>
                          </Link>
                          <button
                            type="button"
                            disabled={
                              !isPositiveDecimal(delegation.rewardAmount) ||
                              claimAllSubmitting ||
                              Boolean(claimingValidatorAddress)
                            }
                            onClick={() => {
                              void handleClaimRewards(delegation.validatorAddress);
                            }}
                            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {claimingValidatorAddress === delegation.validatorAddress ? "Claiming…" : "Claim rewards"}
                          </button>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Delegated</p>
                            <p className="mt-1">{formatFixedDsmFromMicro(delegation.amount)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Rewards</p>
                            <p className="mt-1">{formatFixedDsmFromMicroDecimal(delegation.rewardAmount)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {rewardResult ? (
                  <p className="mt-4 break-all text-sm text-emerald-200">
                    Reward tx:{" "}
                    <Link
                      to={`/transactions/${rewardResult}`}
                      className="text-sky-200 transition hover:text-white hover:underline"
                    >
                      {rewardResult}
                    </Link>
                  </p>
                ) : null}
                {rewardError ? <p className="mt-4 text-sm text-rose-200">{rewardError}</p> : null}
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Delegations In Unbonding</p>
                <div className="mt-3 space-y-2">
                  {data.unbondingDelegations.length === 0 ? (
                    <p className="text-sm text-slate-300">No unbonding delegations.</p>
                  ) : (
                    data.unbondingDelegations.map((delegation, index) => (
                      <div
                        key={`${delegation.validatorAddress}-${delegation.completionTime}-${delegation.amount}-${index}`}
                        className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200"
                      >
                        <Link
                          to={`/validators/${delegation.validatorAddress}`}
                          className="block transition hover:text-white"
                        >
                          <div className="flex items-center gap-3">
                            <ValidatorAvatar
                              identity={delegation.identity}
                              moniker={delegation.moniker || truncateMiddle(delegation.validatorAddress)}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div>{delegation.moniker || truncateMiddle(delegation.validatorAddress)}</div>
                              <div className="mt-1 text-xs text-slate-500">{truncateMiddle(delegation.validatorAddress)}</div>
                            </div>
                          </div>
                        </Link>
                        <div className="mt-3 flex flex-col gap-1 text-slate-300">
                          <p className="text-white">{formatFixedDsmFromMicro(delegation.amount)}</p>
                          <p className="text-xs text-slate-400">
                            Target end time: {formatDateTime(delegation.completionTime)} ({formatTimeRemaining(delegation.completionTime)})
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Delegations Under Redelegation</p>
                <div className="mt-3 space-y-2">
                  {data.redelegations.length === 0 ? (
                    <p className="text-sm text-slate-300">No redelegations in progress.</p>
                  ) : (
                    data.redelegations.map((delegation, index) => (
                      <div
                        key={[
                          delegation.sourceValidatorAddress,
                          delegation.destinationValidatorAddress,
                          delegation.completionTime,
                          delegation.amount,
                          index
                        ].join("-")}
                        className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200"
                      >
                        <div className="space-y-3">
                          <Link
                            to={`/validators/${delegation.sourceValidatorAddress}`}
                            className="block transition hover:text-white"
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">From</p>
                            <div className="mt-1 flex items-center gap-3">
                              <ValidatorAvatar
                                identity={delegation.sourceIdentity}
                                moniker={delegation.sourceMoniker || truncateMiddle(delegation.sourceValidatorAddress)}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div>{delegation.sourceMoniker || truncateMiddle(delegation.sourceValidatorAddress)}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {truncateMiddle(delegation.sourceValidatorAddress)}
                                </div>
                              </div>
                            </div>
                          </Link>
                          <Link
                            to={`/validators/${delegation.destinationValidatorAddress}`}
                            className="block transition hover:text-white"
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">To</p>
                            <div className="mt-1 flex items-center gap-3">
                              <ValidatorAvatar
                                identity={delegation.destinationIdentity}
                                moniker={
                                  delegation.destinationMoniker || truncateMiddle(delegation.destinationValidatorAddress)
                                }
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div>
                                  {delegation.destinationMoniker ||
                                    truncateMiddle(delegation.destinationValidatorAddress)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {truncateMiddle(delegation.destinationValidatorAddress)}
                                </div>
                              </div>
                            </div>
                          </Link>
                          <div className="flex flex-col gap-1 text-slate-300">
                            <p className="text-white">{formatFixedDsmFromMicro(delegation.amount)}</p>
                            <p className="text-xs text-slate-400">
                              Target end time: {formatDateTime(delegation.completionTime)} ({formatTimeRemaining(delegation.completionTime)})
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title="Transfer DSM" subtitle="Send native DSM or transfer to Osmosis over IBC">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Route</span>
            <select
              value={route}
              onChange={(event) => setRoute(event.target.value as WalletRoute)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
            >
              <option value="native">Native DSM transfer</option>
              <option value="ibc">IBC transfer to Osmosis</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Recipient Address</span>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={route === "native" ? "desmos1..." : "osmo1..."}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Amount (DSM)</span>
            <input
              value={amountDsm}
              onChange={(event) => setAmountDsm(event.target.value)}
              placeholder="10"
              inputMode="decimal"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
            />
            <span className="text-xs text-slate-400">Available: {availableBalanceDisplay}</span>
            {amountValidationError ? <span className="text-xs text-rose-200">{amountValidationError}</span> : null}
            {!amountValidationError && amountValidationWarning ? (
              <span className="text-xs text-amber-200">{amountValidationWarning}</span>
            ) : null}
          </label>

          {route === "ibc" ? (
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Source Channel</span>
              <input
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                placeholder={DESMOS_CHAIN.osmosisChannelId}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
              />
              <span className="text-xs text-slate-400">Default Desmos to Osmosis channel: {DESMOS_CHAIN.osmosisChannelId}</span>
            </label>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Memo</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || Boolean(amountValidationError)}
            className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(90deg,rgba(14,165,233,0.95),rgba(252,211,77,0.9))] px-4 py-3 font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting…" : route === "native" ? "Sign transfer" : "Sign IBC transfer"}
          </button>
        </form>

        {result ? (
          <p className="mt-4 break-all text-sm text-emerald-200">
            Broadcasted tx:{" "}
            <Link to={`/transactions/${result}`} className="text-sky-200 transition hover:text-white hover:underline">
              {result}
            </Link>
          </p>
        ) : null}
        {submitError ? <p className="mt-4 text-sm text-rose-200">{submitError}</p> : null}
      </Panel>
      </div>
    </div>
  );
}
