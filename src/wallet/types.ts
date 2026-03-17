export type WalletMode = "keplr" | "ledger";

export interface WalletConnection {
  mode: WalletMode;
  address: string;
  name: string;
}

export interface SendDsmInput {
  recipient: string;
  amountDsm: string;
  memo?: string;
}

export interface DelegateInput {
  validatorAddress: string;
  amountDsm: string;
  memo?: string;
}

export interface RedelegateInput {
  sourceValidatorAddress: string;
  destinationValidatorAddress: string;
  amountDsm: string;
  memo?: string;
}

export interface IbcTransferInput {
  recipient: string;
  amountDsm: string;
  channelId: string;
  memo?: string;
}

export interface WithdrawRewardsInput {
  validatorAddress: string;
  memo?: string;
}

export interface WithdrawAllRewardsInput {
  validatorAddresses: string[];
  memo?: string;
}

export type ProposalVoteOption = "yes" | "abstain" | "no" | "no_with_veto";

export interface VoteOnProposalInput {
  proposalId: string;
  option: ProposalVoteOption;
  memo?: string;
}

export interface WalletTxResult {
  transactionHash: string;
  rawLog?: string;
}
