import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { BlockDetailsPage } from "../pages/BlockDetailsPage";
import { BlocksPage } from "../pages/BlocksPage";
import { DashboardPage } from "../pages/DashboardPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProposalDetailsPage } from "../pages/ProposalDetailsPage";
import { ProposalsPage } from "../pages/ProposalsPage";
import { TransactionDetailsPage } from "../pages/TransactionDetailsPage";
import { TransactionsPage } from "../pages/TransactionsPage";
import { ValidatorDetailsPage } from "../pages/ValidatorDetailsPage";
import { ValidatorsPage } from "../pages/ValidatorsPage";
import { WalletPage } from "../pages/WalletPage";

export const LAST_PATH_STORAGE_KEY = "lite-dipper:last-path";

function restoreLastPathOnReload() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const savedPath = window.sessionStorage.getItem(LAST_PATH_STORAGE_KEY);
    const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const isReload = navigationEntry?.type === "reload";
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    // If the edge runtime serves `/` after a hard reload, restore the last in-app route before the router boots.
    if (isReload && currentPath === "/" && savedPath && savedPath !== "/") {
      window.history.replaceState(window.history.state, "", savedPath);
    }
  } catch {
    // Ignore storage/history access issues and let the router continue normally.
  }
}

restoreLastPathOnReload();

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />
      },
      {
        path: "blocks",
        element: <BlocksPage />
      },
      {
        path: "blocks/:height",
        element: <BlockDetailsPage />
      },
      {
        path: "transactions",
        element: <TransactionsPage />
      },
      {
        path: "transactions/:hash",
        element: <TransactionDetailsPage />
      },
      {
        path: "validators",
        element: <ValidatorsPage />
      },
      {
        path: "validators/:validatorAddress",
        element: <ValidatorDetailsPage />
      },
      {
        path: "proposals",
        element: <ProposalsPage />
      },
      {
        path: "proposals/:proposalId",
        element: <ProposalDetailsPage />
      },
      {
        path: "wallet",
        element: <WalletPage />
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);
