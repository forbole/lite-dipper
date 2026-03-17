import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DESMOS_TOKEN_ICON_URL } from "../../config/chain";
import { useWallet } from "../../wallet/WalletProvider";
import { truncateMiddle } from "../../lib/format";
import { GalaxyBackground } from "./GalaxyBackground";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "space_dashboard" },
  { to: "/blocks", label: "Blocks", icon: "inventory_2" },
  { to: "/transactions", label: "Transactions", icon: "swap_horiz" },
  { to: "/validators", label: "Validators", icon: "shield" },
  { to: "/proposals", label: "Proposals", icon: "ballot" },
  { to: "/wallet", label: "Wallet", icon: "account_balance_wallet" }
];

function deriveHeading(pathname: string): string {
  if (pathname.startsWith("/blocks/")) {
    return "Block Details";
  }

  if (pathname.startsWith("/transactions/")) {
    return "Transaction Details";
  }

  if (pathname.startsWith("/validators/")) {
    return "Validator Details";
  }

  if (pathname.startsWith("/proposals/")) {
    return "Proposal Details";
  }

  const match = NAV_ITEMS.find((item) => item.to === pathname);
  return match?.label ?? "Lite-Dipper";
}

export function AppShell() {
  const location = useLocation();
  const { connection } = useWallet();
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("lite-dipper-sidebar") === "collapsed" : false
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("lite-dipper-sidebar", collapsed ? "collapsed" : "expanded");
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-app text-slate-100">
      <div className="flex min-h-screen">
        <aside
          className={[
            "border-r border-white/10 bg-slate-950/80 px-3 py-4 backdrop-blur transition-all duration-200",
            collapsed ? "w-24" : "w-72"
          ].join(" ")}
        >
          <div className="mb-6 px-2">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              className="flex min-w-0 items-center gap-3 text-left"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-slate-950">
                <img src={DESMOS_TOKEN_ICON_URL} alt="DSM token" className="h-full w-full object-cover" />
              </div>
              {!collapsed ? (
                <div>
                  <p className="font-display text-xl text-white">Lite-Dipper</p>
                  <p className="text-sm text-slate-400">Desmos Explorer</p>
                </div>
              ) : null}
            </button>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-2xl pl-6 pr-3 py-3 text-sm transition",
                    isActive
                      ? "bg-[linear-gradient(90deg,rgba(14,165,233,0.18),rgba(252,211,77,0.12))] text-white"
                      : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  ].join(" ")
                }
              >
                <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className="material-symbols-rounded">{item.icon}</span>
                  {item.to === "/wallet" ? (
                    <span
                      className={[
                        "absolute -left-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ring-2 ring-slate-950/90",
                        connection ? "bg-emerald-400" : "bg-rose-400"
                      ].join(" ")}
                    />
                  ) : null}
                </span>
                {!collapsed ? (
                  item.to === "/wallet" ? (
                    <span>{item.label}</span>
                  ) : (
                    <span>{item.label}</span>
                  )
                ) : null}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <GalaxyBackground />

          <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/55 px-5 py-4 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">Desmos Mainnet</p>
                <h1 className="mt-2 font-display text-3xl text-white">{deriveHeading(location.pathname)}</h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                  RPC + REST via Worker
                </div>
                <Link
                  to="/wallet"
                  className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm text-white transition hover:bg-white/[0.14]"
                >
                  {connection ? truncateMiddle(connection.address) : "Connect wallet"}
                </Link>
              </div>
            </div>
          </header>

          <div className="relative z-10 flex flex-1 flex-col w-full px-4 py-6 md:px-6 xl:px-8">
            <div className="flex-1">
              <Outlet />
            </div>
            <p className="pt-8 text-center text-xs text-slate-500">&copy; 2026 Forbole Limited.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
