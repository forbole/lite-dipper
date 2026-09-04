import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { ProfileBio } from "../components/ui/ProfileBio";
import { StatusPill } from "../components/ui/StatusPill";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { useApiResource } from "../hooks/useApiResource";
import { useWalletOverview } from "../hooks/useWalletOverview";
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
import type { ValidatorDetailsPayload, ValidatorSummary } from "../types/desmos";
import { useWallet } from "../wallet/context";
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
    enabled: Boolean(validatorAddressParam),
    pollMs: 30_000
  });
  const {
    data: walletOverview,
    loading: walletOverviewLoading,
    error: walletOverviewError,
    refresh: refreshWalletOverview
  } = useWalletOverview(connection?.address);
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
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
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

  const profile = data.desmosProfile;
  const displayName = profile?.nickname || data.validator.moniker;
  const coverUrl = profile?.coverPicture;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title={displayName} subtitle={truncateMiddle(data.validator.operatorAddress)}>
        <div className="mb-4 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/45">
          {coverUrl && failedCoverUrl !== coverUrl ? (
            <img
              src={coverUrl}
              alt={`${displayName} cover`}
              className="h-36 w-full object-cover md:h-48"
              referrerPolicy="no-referrer"
              onError={() => setFailedCoverUrl(coverUrl)}
            />
          ) : null}
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
            <ValidatorAvatar identity={data.validator.identity} imageUrl={profile?.profilePicture} moniker={displayName} size="lg" />

            <div className="min-w-0">
              <p className="break-words font-display text-2xl text-white">{displayName}</p>
              {profile ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 text-xs text-sky-200">Desmos Profile</span>
                  <span className="break-all text-slate-300">@{profile.dtag}</span>
                </div>
              ) : null}
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
          <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
            <p className="text-sm text-slate-400">{profile?.bio ? "Bio" : "Details"}</p>
            {profile?.bio ? <ProfileBio bio={profile.bio} /> : (
              <p className="mt-2 whitespace-pre-wrap break-words">{data.validator.details || "No validator details provided."}</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
            <p className="text-sm text-slate-400">Metadata</p>
            <div className="mt-2 space-y-2">
              {displayName !== data.validator.moniker ? <p>Validator name: {data.validator.moniker}</p> : null}
              {profile?.creationDate ? <p>Profile created: {formatDateTime(profile.creationDate)}</p> : null}
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
              <p>
                Account:{" "}
                <Link
                  to={`/accounts/${data.validator.accountAddress}`}
                  className="text-sky-200 transition hover:text-white"
                >
                  {truncateMiddle(data.validator.accountAddress)}
                </Link>
              </p>
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
              {walletOverviewError ? (
                <div role="alert" className="mt-2 text-amber-200">
                  <p>Unable to refresh wallet balances and delegations. Displayed amounts may be out of date.</p>
                  <button type="button" onClick={refreshWalletOverview} disabled={walletOverviewLoading} className="mt-2 underline disabled:opacity-60">
                    Retry wallet refresh
                  </button>
                </div>
              ) : null}
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
              aria-busy={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(90deg,rgba(14,165,233,0.95),rgba(252,211,77,0.9))] px-4 py-3 font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" /> : null}
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
