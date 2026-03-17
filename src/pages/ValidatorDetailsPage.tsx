import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { useApiResource } from "../hooks/useApiResource";
import {
  formatBondStatus,
  formatDateTime,
  formatDsmFromMicro,
  formatFixedDsmFromMicro,
  formatPercent,
  formatPreciseDsmFromMicro,
  parseDsmToMicro,
  truncateMiddle
} from "../lib/format";
import type { ValidatorDetailsPayload, ValidatorSummary, WalletOverviewPayload } from "../types/desmos";
import { useWallet } from "../wallet/WalletProvider";
import { useParams } from "react-router-dom";

type StakingAction = "delegate" | "undelegate" | "redelegate";

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ValidatorDetailsPage() {
  const { validatorAddress: validatorAddressParam } = useParams();
  const { connection, delegate, undelegate, redelegate } = useWallet();
  const validatorAddress = validatorAddressParam ?? "";
  const { data, error, loading } = useApiResource<ValidatorDetailsPayload>(`/api/validators/${validatorAddress}`, {
    enabled: Boolean(validatorAddressParam)
  });
  const {
    data: walletOverview,
    loading: walletOverviewLoading,
    refresh: refreshWalletOverview
  } = useApiResource<WalletOverviewPayload>(
    connection ? `/api/wallet/${connection.address}/overview` : "/api/config",
    {
      enabled: Boolean(connection),
      pollMs: 20_000
    }
  );
  const {
    data: validatorOptions,
    loading: validatorOptionsLoading
  } = useApiResource<ValidatorSummary[]>("/api/validators", {
    enabled: Boolean(validatorAddressParam),
    pollMs: 30_000
  });
  const [action, setAction] = useState<StakingAction>("delegate");
  const [amountDsm, setAmountDsm] = useState("");
  const [destinationValidatorAddress, setDestinationValidatorAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const currentDelegation = walletOverview?.delegations.find(
    (delegation) => delegation.validatorAddress === validatorAddress
  );
  const availableBalanceAmount =
    walletOverview?.balances.find((balance) => balance.denom === "udsm")?.amount ?? "0";
  const currentDelegationAmount = currentDelegation?.amount ?? "0";
  const hasCurrentDelegation = Boolean(currentDelegation && currentDelegation.amount !== "0");
  const availableBalanceDisplay = formatFixedDsmFromMicro(availableBalanceAmount);
  const availableDelegationDisplay = formatFixedDsmFromMicro(currentDelegationAmount);
  const redelegationDestinations =
    validatorOptions?.filter((validator) => validator.operatorAddress !== validatorAddress && !validator.jailed) ?? [];
  const amountInput = amountDsm.trim();
  let amountValidationError: string | null = null;

  if (amountInput) {
    try {
      const requestedAmount = BigInt(parseDsmToMicro(amountInput));

      if (action === "delegate" && requestedAmount > BigInt(availableBalanceAmount)) {
        amountValidationError = `Amount cannot exceed the available balance of ${availableBalanceDisplay}.`;
      } else if (
        (action === "undelegate" || action === "redelegate") &&
        requestedAmount > BigInt(currentDelegationAmount)
      ) {
        amountValidationError = `Amount cannot exceed the staked delegation of ${availableDelegationDisplay}.`;
      }
    } catch (error) {
      amountValidationError = error instanceof Error ? error.message : "Invalid amount.";
    }
  }

  useEffect(() => {
    if (!hasCurrentDelegation && action !== "delegate") {
      setAction("delegate");
    }
  }, [action, hasCurrentDelegation]);

  useEffect(() => {
    if (action !== "redelegate") {
      return;
    }

    if (redelegationDestinations.length === 0) {
      if (destinationValidatorAddress) {
        setDestinationValidatorAddress("");
      }

      return;
    }

    const isCurrentDestinationValid = redelegationDestinations.some(
      (validator) => validator.operatorAddress === destinationValidatorAddress
    );

    if (!isCurrentDestinationValid) {
      setDestinationValidatorAddress(redelegationDestinations[0].operatorAddress);
    }
  }, [action, destinationValidatorAddress, redelegationDestinations]);

  if (!validatorAddressParam) {
    return <div className="text-sm text-rose-200">Missing validator address.</div>;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setTxResult(null);
    setTxError(null);

    try {
      if (amountValidationError) {
        throw new Error(amountValidationError);
      }

      if ((action === "undelegate" || action === "redelegate") && !hasCurrentDelegation) {
        throw new Error("This wallet has no active delegation to this validator yet.");
      }

      if (action === "delegate") {
        const requestedAmount = BigInt(parseDsmToMicro(amountDsm));
        const availableAmount = BigInt(availableBalanceAmount);

        if (requestedAmount > availableAmount) {
          throw new Error(`Amount exceeds the available balance of ${availableBalanceDisplay}.`);
        }
      }

      if (action === "undelegate" || action === "redelegate") {
        const requestedAmount = BigInt(parseDsmToMicro(amountDsm));
        const availableAmount = BigInt(currentDelegationAmount);

        if (requestedAmount > availableAmount) {
          throw new Error(
            `Amount exceeds the available delegated stake of ${availableDelegationDisplay}.`
          );
        }
      }

      if (action === "delegate") {
        const result = await delegate({
          validatorAddress,
          amountDsm
        });
        setTxResult(result.transactionHash);
      }

      if (action === "undelegate") {
        const result = await undelegate({
          validatorAddress,
          amountDsm
        });
        setTxResult(result.transactionHash);
      }

      if (action === "redelegate") {
        if (!destinationValidatorAddress) {
          throw new Error("Select a destination validator for redelegation.");
        }

        const result = await redelegate({
          sourceValidatorAddress: validatorAddress,
          destinationValidatorAddress,
          amountDsm
        });
        setTxResult(result.transactionHash);
      }

      refreshWalletOverview();
    } catch (nextError) {
      setTxError(nextError instanceof Error ? nextError.message : "Unable to submit staking transaction.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) {
    return <div className="text-sm text-slate-300">Loading validator…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-rose-200">{error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title={data.validator.moniker} subtitle={truncateMiddle(data.validator.operatorAddress)}>
        <div className="mb-4 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/45 p-4 md:flex-row md:items-center">
          <ValidatorAvatar identity={data.validator.identity} moniker={data.validator.moniker} size="lg" />

          <div className="min-w-0">
            <p className="font-display text-2xl text-white">{data.validator.moniker}</p>
            {data.keybaseProfile ? (
              <a
                href={data.keybaseProfile.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-sm text-sky-200 transition hover:text-white"
              >
                Keybase: {data.keybaseProfile.username}
              </a>
            ) : data.validator.identity ? (
              <p className="mt-2 text-sm text-slate-300">Keybase identity: {data.validator.identity}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Status</p>
            <div className="mt-2">
              <StatusPill status={data.validator.jailed ? "Jailed" : formatBondStatus(data.validator.status)} />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Voting Power</p>
            <p className="mt-2 text-white">{formatDsmFromMicro(data.validator.tokens)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Commission</p>
            <p className="mt-2 text-white">{formatPercent(data.validator.commissionRate)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Unbonding Time</p>
            <p className="mt-2 text-white">{formatDateTime(data.validator.unbondingTime)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
            <p className="text-sm text-slate-400">Details</p>
            <p className="mt-2">{data.validator.details || "No validator details provided."}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
            <p className="text-sm text-slate-400">Metadata</p>
            <div className="mt-2 space-y-2">
              <p>
                Website:{" "}
                {data.validator.website ? (
                  <a href={data.validator.website} target="_blank" rel="noreferrer" className="text-sky-200 transition hover:text-white">
                    {data.validator.website}
                  </a>
                ) : (
                  "N/A"
                )}
              </p>
              <p>
                Security Contact:{" "}
                {data.validator.securityContact ? (
                  looksLikeEmail(data.validator.securityContact) ? (
                    <a
                      href={`mailto:${data.validator.securityContact}`}
                      className="text-sky-200 transition hover:text-white"
                    >
                      {data.validator.securityContact}
                    </a>
                  ) : (
                    data.validator.securityContact
                  )
                ) : (
                  "N/A"
                )}
              </p>
              <p>Identity: {data.validator.identity || "N/A"}</p>
              <p>Account: {truncateMiddle(data.validator.accountAddress)}</p>
              <p>Consensus PubKey: {truncateMiddle(data.validator.consensusPubKey)}</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Delegation Actions"
        subtitle={connection ? `Sign with ${connection.name}` : "Connect Keplr or Ledger to stake"}
      >
        {!connection ? (
          <p className="text-sm text-slate-300">Wallet actions stay disabled until a signer is connected from the Wallet page.</p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
              <p className="text-sm text-slate-400">Wallet Delegation</p>
              {walletOverviewLoading && !walletOverview ? (
                <p className="mt-2">Loading connected wallet delegation…</p>
              ) : hasCurrentDelegation ? (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Staked Here</p>
                    <p className="mt-1 text-white">{formatFixedDsmFromMicro(currentDelegationAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Undelegate Available</p>
                    <p className="mt-1 text-white">{formatFixedDsmFromMicro(currentDelegationAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Redelegate Available</p>
                    <p className="mt-1 text-white">{formatFixedDsmFromMicro(currentDelegationAmount)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2">This wallet has no active delegation to this validator yet.</p>
              )}
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Action</span>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as StakingAction)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
              >
                <option value="delegate">Delegate</option>
                <option value="undelegate" disabled={!hasCurrentDelegation}>
                  Undelegate
                </option>
                <option value="redelegate" disabled={!hasCurrentDelegation}>
                  Redelegate
                </option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Amount (DSM)</span>
              <input
                value={amountDsm}
                onChange={(event) => setAmountDsm(event.target.value)}
                placeholder="25"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
                inputMode="decimal"
              />
              {action === "delegate" ? (
                <span className="text-xs text-slate-400">Available: {availableBalanceDisplay}</span>
              ) : null}
              {action === "undelegate" || action === "redelegate" ? (
                <span className="text-xs text-slate-400">
                  Available: {availableDelegationDisplay}
                </span>
              ) : null}
              {amountValidationError ? <span className="text-xs text-rose-200">{amountValidationError}</span> : null}
            </label>

            {action === "redelegate" ? (
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Destination Validator</span>
                <select
                  value={destinationValidatorAddress}
                  onChange={(event) => setDestinationValidatorAddress(event.target.value)}
                  disabled={validatorOptionsLoading || redelegationDestinations.length === 0}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
                >
                  {validatorOptionsLoading ? <option value="">Loading bonded validators…</option> : null}
                  {!validatorOptionsLoading && redelegationDestinations.length === 0 ? (
                    <option value="">No bonded destination validators available</option>
                  ) : null}
                  {redelegationDestinations.map((validator) => (
                    <option key={validator.operatorAddress} value={validator.operatorAddress}>
                      {validator.moniker} • {formatPercent(validator.commissionRate)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">
                  Bonded validators only. The current source validator is excluded.
                </span>
              </label>
            ) : null}

            <button
              type="submit"
              disabled={
                submitting ||
                ((action === "undelegate" || action === "redelegate") && !hasCurrentDelegation) ||
                (action === "redelegate" && redelegationDestinations.length === 0) ||
                Boolean(amountValidationError)
              }
              className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(90deg,rgba(14,165,233,0.95),rgba(252,211,77,0.9))] px-4 py-3 font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting…" : `Sign ${action}`}
            </button>
          </form>
        )}

        {txResult ? (
          <p className="mt-4 break-all text-sm text-emerald-200">
            Broadcasted tx:{" "}
            <Link to={`/transactions/${txResult}`} className="text-sky-200 transition hover:text-white hover:underline">
              {txResult}
            </Link>
          </p>
        ) : null}
        {txError ? <p className="mt-4 text-sm text-rose-200">{txError}</p> : null}
      </Panel>
    </div>
  );
}
