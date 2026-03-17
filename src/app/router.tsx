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
