import { Link, useParams } from "react-router-dom";
import { CopyIconButton } from "../components/ui/CopyIconButton";
import { MetricCard } from "../components/ui/MetricCard";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { DESMOS_TOKEN_ICON_URL } from "../config/chain";
import { useApiResource } from "../hooks/useApiResource";
import {
  formatDateTime,
  formatFixedDsmFromMicro,
  formatNumber,
  formatTimeRemaining,
  sumMicroAmounts,
  truncateMiddle
} from "../lib/format";
import type { AccountDetailsPayload } from "../types/desmos";

export function AccountDetailsPage() {
  const { accountAddress: accountAddressParam } = useParams();
  const accountAddress = accountAddressParam ?? "";
  const { data, error, loading } = useApiResource<AccountDetailsPayload>(`/api/accounts/${accountAddress}`, {
    enabled: Boolean(accountAddressParam),
    pollMs: 20_000
  });

  if (!accountAddressParam) {
    return <div className="text-sm text-rose-200">Missing account address.</div>;
  }

  if (loading && !data) {
    return <div className="text-sm text-slate-300">Loading account…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-rose-200">{error}</div>;
  }

  if (!data) {
    return null;
  }

  const availableBalanceAmount = sumMicroAmounts(
    data.balances.filter((balance) => balance.denom === "udsm").map((balance) => balance.amount)
  );
  const delegatedAmount = sumMicroAmounts(data.delegations.map((delegation) => delegation.amount));
  const unbondingAmount = sumMicroAmounts(data.unbondingDelegations.map((delegation) => delegation.amount));
  const redelegatingAmount = sumMicroAmounts(data.redelegations.map((delegation) => delegation.amount));
  const totalBalanceAmount = sumMicroAmounts([
    availableBalanceAmount,
    delegatedAmount,
    unbondingAmount,
    redelegatingAmount
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total Balance"
          value={formatFixedDsmFromMicro(totalBalanceAmount)}
          iconSrc={DESMOS_TOKEN_ICON_URL}
          iconAlt="DSM token"
        />
        <MetricCard label="Available" value={formatFixedDsmFromMicro(availableBalanceAmount)} />
        <MetricCard label="Delegated" value={formatFixedDsmFromMicro(delegatedAmount)} />
        <MetricCard label="Unbonding" value={formatFixedDsmFromMicro(unbondingAmount)} />
        <MetricCard label="Redelegating" value={formatFixedDsmFromMicro(redelegatingAmount)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Panel
            title="Account Overview"
            subtitle={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="min-w-0 break-all">{data.address}</span>
                <CopyIconButton value={data.address} />
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Available Balances</p>
                <div className="mt-3 space-y-2">
                  {data.balances.length === 0 ? (
                    <p className="text-sm text-slate-300">No balances found for this account.</p>
                  ) : (
                    data.balances.map((balance) => (
                      <div
                        key={`${balance.denom}-${balance.amount}`}
                        className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200"
                      >
                        {balance.denom === "udsm"
                          ? formatFixedDsmFromMicro(balance.amount)
                          : `${balance.amount} ${balance.denom}`}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Delegations</p>
                <div className="mt-3 space-y-2">
                  {data.delegations.length === 0 ? (
                    <p className="text-sm text-slate-300">No active delegations.</p>
                  ) : (
                    data.delegations.map((delegation) => (
                      <Link
                        key={delegation.validatorAddress}
                        to={`/validators/${delegation.validatorAddress}`}
                        className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
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
                        <div className="mt-2">{formatFixedDsmFromMicro(delegation.amount)}</div>
                      </Link>
                    ))
                  )}
                </div>
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
                          <div>
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
                          </div>
                          <div>
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
                          </div>
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
          </Panel>
        </div>

        <Panel title="Recent Transactions" subtitle="Latest transactions involving this account">
          {data.recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-300">No recent transactions found for this account.</p>
          ) : (
            <div className="space-y-3">
              {data.recentTransactions.map((transaction) => (
                <Link
                  key={transaction.hash}
                  to={`/transactions/${transaction.hash}`}
                  className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm text-white">{truncateMiddle(transaction.hash)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {transaction.messageTypes.join(", ") || "No messages"} · from{" "}
                        {truncateMiddle(transaction.sender)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                      <StatusPill status={transaction.success ? "Success" : "Failed"} />
                      <span>H {formatNumber(transaction.height)}</span>
                      <span>{formatDateTime(transaction.timestamp)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
