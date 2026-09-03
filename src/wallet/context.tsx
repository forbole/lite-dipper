import type {
  DelegateInput,
  IbcTransferInput,
  LedgerAddressOption,
  LedgerSelectionState,
  ProposalVoteOption,
  RedelegateInput,
  SendDsmInput,
  WithdrawAllRewardsInput,
  WithdrawRewardsInput,
  VoteOnProposalInput,
  WalletConnection,
  WalletTxResult
} from "./types";
import { createContext, useContext } from "react";

export interface WalletContextValue {
  connection: WalletConnection | null;
  ledgerSelection: LedgerSelectionState | null;
  connecting: boolean;
  error: string | null;
  connectKeplr: () => Promise<void>;
  connectLedger: () => Promise<void>;
  connectLedgerAddress: (address: string) => Promise<void>;
  nextLedgerAccount: () => Promise<void>;
  previousLedgerAccount: () => Promise<void>;
  nextLedgerPage: () => Promise<void>;
  previousLedgerPage: () => Promise<void>;
  cancelLedgerSelection: () => Promise<void>;
  disconnect: () => void;
  sendDsm: (input: SendDsmInput) => Promise<WalletTxResult>;
  delegate: (input: DelegateInput) => Promise<WalletTxResult>;
  undelegate: (input: DelegateInput) => Promise<WalletTxResult>;
  redelegate: (input: RedelegateInput) => Promise<WalletTxResult>;
  withdrawRewards: (input: WithdrawRewardsInput) => Promise<WalletTxResult>;
  withdrawAllRewards: (input: WithdrawAllRewardsInput) => Promise<WalletTxResult>;
  voteOnProposal: (input: VoteOnProposalInput) => Promise<WalletTxResult>;
  transferToOsmosis: (input: IbcTransferInput) => Promise<WalletTxResult>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("WalletProvider is missing.");
  }

  return context;
}
