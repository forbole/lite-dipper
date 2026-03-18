export interface ChainConfigPayload {
  chainId: string;
  chainName: string;
  rpcUrl: string;
  restUrl: string;
  grpcUrl: string;
  osmosisChannelId: string;
  denom: string;
  displayDenom: string;
  exponent: number;
}

export interface BlockSummary {
  height: number;
  hash: string;
  time: string;
  proposerAddress: string;
  proposerMoniker?: string;
  proposerIdentity?: string;
  txCount: number;
}

export interface TransactionSummary {
  hash: string;
  height: number;
  timestamp: string;
  code: number;
  success: boolean;
  messageTypes: string[];
  memo: string;
  feeAmount: string;
  gasUsed: string;
  sender: string;
}

export interface ValidatorSummary {
  operatorAddress: string;
  accountAddress: string;
  consensusPubKey: string;
  consensusHexAddress: string;
  moniker: string;
  identity: string;
  details: string;
  website: string;
  securityContact: string;
  commissionRate: string;
  tokens: string;
  status: string;
  jailed: boolean;
}

export interface ProposalSummary {
  id: string;
  title: string;
  status: string;
  proposer: string;
  submitTime: string;
  votingEndTime: string;
}

export interface DashboardPayload {
  latestHeight: number;
  activeValidators: number;
  bondedTokens: string;
  recentBlocks: BlockSummary[];
  recentTransactions: TransactionSummary[];
  endpoints: {
    rpcUrl: string;
    restUrl: string;
    grpcUrl: string;
  };
}

export interface BlockDetailsPayload {
  block: BlockSummary & {
    chainId: string;
    version: string;
    nextValidatorsHash: string;
  };
  signedValidators: Array<{
    consensusAddress: string;
    operatorAddress: string;
    moniker: string;
    identity: string;
    timestamp: string;
    blockIdFlag: string;
    signaturePresent: boolean;
  }>;
  transactions: TransactionSummary[];
}

export interface TransactionDetailsPayload {
  hash: string;
  height: number;
  timestamp: string;
  code: number;
  rawLog: string;
  gasWanted: string;
  gasUsed: string;
  memo: string;
  feeAmount: string;
  signerAddresses: string[];
  messages: Array<{
    typeUrl: string;
    preview: string;
  }>;
  logs: Array<{
    msgIndex: number;
    log: string;
    events: Array<{
      type: string;
      attributes: Array<{
        key: string;
        value: string;
      }>;
    }>;
  }>;
  events: Array<{
    type: string;
    attributes: Array<{
      key: string;
      value: string;
    }>;
  }>;
}

export interface ValidatorDetailsPayload {
  validator: ValidatorSummary & {
    minSelfDelegation: string;
    unbondingHeight: string;
    unbondingTime: string;
    delegatorShares: string;
  };
  keybaseProfile?: {
    username: string;
    avatarUrl: string;
    profileUrl: string;
  } | null;
}

export interface ProposalDetailsPayload {
  proposal: ProposalSummary & {
    summary: string;
    metadata: string;
    expedited: boolean;
    messages: string[];
    finalTally?: {
      yes: string;
      no: string;
      abstain: string;
      noWithVeto: string;
    };
  };
}

export interface WalletOverviewPayload {
  address: string;
  balances: Array<{
    denom: string;
    amount: string;
  }>;
  totalRewardAmount: string;
  delegations: Array<{
    validatorAddress: string;
    moniker?: string;
    identity?: string;
    amount: string;
    rewardAmount: string;
  }>;
}

export interface AccountDetailsPayload {
  address: string;
  balances: Array<{
    denom: string;
    amount: string;
  }>;
  delegations: Array<{
    validatorAddress: string;
    moniker?: string;
    identity?: string;
    amount: string;
  }>;
  unbondingDelegations: Array<{
    validatorAddress: string;
    moniker?: string;
    identity?: string;
    amount: string;
    completionTime: string;
  }>;
  redelegations: Array<{
    sourceValidatorAddress: string;
    sourceMoniker?: string;
    sourceIdentity?: string;
    destinationValidatorAddress: string;
    destinationMoniker?: string;
    destinationIdentity?: string;
    amount: string;
    completionTime: string;
  }>;
  recentTransactions: TransactionSummary[];
}
