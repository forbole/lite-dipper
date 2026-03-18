import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { ReactNode } from "react";
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
import { createContext, useContext, useRef, useState } from "react";
import { VoteOption } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";
import { MsgVote } from "cosmjs-types/cosmos/gov/v1beta1/tx";
import { BinaryReader } from "cosmjs-types/binary";
import { Any } from "cosmjs-types/google/protobuf/any";
import { MsgBeginRedelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";
import { MsgTransfer } from "cosmjs-types/ibc/applications/transfer/v1/tx";
import { DESMOS_CHAIN, DESMOS_CHAIN_INFO, getWorkerRpcEndpoint } from "../config/chain";
import { parseDsmToMicro } from "../lib/format";

interface WalletContextValue {
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

const WalletContext = createContext<WalletContextValue | null>(null);

const DESMOS_PROFILE_TYPE_URLS = new Set([
  "/desmos.profiles.v3.Profile",
  "/desmos.profiles.v4.Profile"
]);

function getWalletSession(
  signer: OfflineSigner | null,
  connection: WalletConnection | null
): { signer: OfflineSigner; connection: WalletConnection } {
  if (!signer || !connection) {
    throw new Error("Connect a wallet before submitting a transaction.");
  }

  return { signer, connection };
}

function unwrapDesmosProfileAccount(input: Any): Any | null {
  const reader = new BinaryReader(input.value);

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;

    if (fieldNumber === 1 && wireType === 2) {
      return Any.decode(reader, reader.uint32());
    }

    reader.skipType(wireType);
  }

  return null;
}

async function createSigningClient(signer: OfflineSigner) {
  const {
    AminoTypes,
    GasPrice,
    SigningStargateClient,
    accountFromAny,
    createBankAminoConverters,
    createDistributionAminoConverters,
    createGovAminoConverters,
    createIbcAminoConverters,
    createStakingAminoConverters
  } = await import("@cosmjs/stargate");

  const aminoTypes = new AminoTypes({
    ...createBankAminoConverters(),
    ...createDistributionAminoConverters(),
    ...createGovAminoConverters(),
    ...createStakingAminoConverters(),
    ...createIbcAminoConverters()
  });
  const averageGasPrice = DESMOS_CHAIN_INFO.feeCurrencies[0]?.gasPriceStep?.average ?? 0.025;
  const gasPrice = GasPrice.fromString(`${averageGasPrice}${DESMOS_CHAIN.denom}`);
  const accountParser = (input: Any) => {
    if (DESMOS_PROFILE_TYPE_URLS.has(input.typeUrl)) {
      const nestedAccount = unwrapDesmosProfileAccount(input);

      if (!nestedAccount) {
        throw new Error(`Desmos profile account wrapper did not contain a nested account: ${input.typeUrl}`);
      }

      return accountFromAny(nestedAccount);
    }

    return accountFromAny(input);
  };

  return SigningStargateClient.connectWithSigner(getWorkerRpcEndpoint(), signer, {
    aminoTypes,
    gasPrice,
    accountParser
  });
}

function mapProposalVoteOption(option: ProposalVoteOption): VoteOption {
  switch (option) {
    case "yes":
      return VoteOption.VOTE_OPTION_YES;
    case "abstain":
      return VoteOption.VOTE_OPTION_ABSTAIN;
    case "no":
      return VoteOption.VOTE_OPTION_NO;
    case "no_with_veto":
      return VoteOption.VOTE_OPTION_NO_WITH_VETO;
    default:
      return VoteOption.VOTE_OPTION_UNSPECIFIED;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const signerRef = useRef<OfflineSigner | null>(null);
  const ledgerTransportRef = useRef<any | null>(null);
  const ledgerPreviewSignerRef = useRef<OfflineSigner | null>(null);
  const [connection, setConnection] = useState<WalletConnection | null>(null);
  const [ledgerSelection, setLedgerSelection] = useState<LedgerSelectionState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function closeLedgerTransport() {
    ledgerPreviewSignerRef.current = null;

    if (ledgerTransportRef.current && typeof ledgerTransportRef.current.close === "function") {
      try {
        await ledgerTransportRef.current.close();
      } catch {
        // Ignore close errors and let the next connection attempt recover.
      }
    }

    ledgerTransportRef.current = null;
  }

  async function loadLedgerAccountsPage(accountNumber: number, page: number): Promise<LedgerSelectionState> {
    const [{ LedgerSigner }, { stringToPath }, { default: TransportWebHID }] = await Promise.all([
      import("@cosmjs/ledger-amino"),
      import("@cosmjs/crypto"),
      import("@ledgerhq/hw-transport-webhid")
    ]);
    const transport = ledgerTransportRef.current ?? (await TransportWebHID.create());
    ledgerTransportRef.current = transport;

    const accountsPerPage = 10;
    const startIndex = page * accountsPerPage;
    const hdPaths = Array.from({ length: accountsPerPage }, (_, offset) =>
      stringToPath(`m/44'/${DESMOS_CHAIN.coinType}'/${accountNumber}'/0/${startIndex + offset}`)
    );
    const signer = new LedgerSigner(transport, {
      hdPaths,
      prefix: DESMOS_CHAIN.bech32Prefix,
      ledgerAppName: DESMOS_CHAIN.chainName
    });
    const accounts = await signer.getAccounts();

    ledgerPreviewSignerRef.current = signer;

    return {
      accountNumber,
      page,
      accounts: accounts.map((account, offset): LedgerAddressOption => ({
        address: account.address,
        hdPath: `m/44'/${DESMOS_CHAIN.coinType}'/${accountNumber}'/0/${startIndex + offset}`,
        derivationIndex: startIndex + offset
      }))
    };
  }

  async function connectKeplr() {
    try {
      setConnecting(true);
      setError(null);

      if (!window.keplr) {
        throw new Error("Keplr extension is not available in this browser.");
      }

      if (window.keplr.experimentalSuggestChain) {
        await window.keplr.experimentalSuggestChain(DESMOS_CHAIN_INFO);
      }

      await window.keplr.enable(DESMOS_CHAIN.chainId);
      const signer =
        (await window.getOfflineSignerAuto?.(DESMOS_CHAIN.chainId)) ??
        window.getOfflineSigner?.(DESMOS_CHAIN.chainId);

      if (!signer) {
        throw new Error("Unable to acquire a Keplr offline signer.");
      }

      const [account] = await signer.getAccounts();

      if (!account?.address) {
        throw new Error("Unable to acquire a Keplr account address.");
      }

      signerRef.current = signer;
      setConnection({
        mode: "keplr",
        address: account.address,
        name: "Keplr"
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to connect Keplr.";
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function connectLedger() {
    try {
      setConnecting(true);
      setError(null);
      setConnection(null);
      const selection = await loadLedgerAccountsPage(0, 0);
      setLedgerSelection(selection);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to connect Ledger.";
      await closeLedgerTransport();
      setLedgerSelection(null);
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function connectLedgerAddress(address: string) {
    try {
      setConnecting(true);
      setError(null);

      const selectedAccount = ledgerSelection?.accounts.find((account) => account.address === address);

      if (!selectedAccount || !ledgerPreviewSignerRef.current) {
        throw new Error("Select a Ledger address before connecting.");
      }

      signerRef.current = ledgerPreviewSignerRef.current;
      setConnection({
        mode: "ledger",
        address: selectedAccount.address,
        name: "Ledger"
      });
      setLedgerSelection(null);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to connect Ledger.";
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function nextLedgerPage() {
    if (!ledgerSelection) {
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      setLedgerSelection(await loadLedgerAccountsPage(ledgerSelection.accountNumber, ledgerSelection.page + 1));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to load the next Ledger addresses.";
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function previousLedgerPage() {
    if (!ledgerSelection || ledgerSelection.page === 0) {
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      setLedgerSelection(await loadLedgerAccountsPage(ledgerSelection.accountNumber, ledgerSelection.page - 1));
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Failed to load the previous Ledger addresses.";
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function nextLedgerAccount() {
    if (!ledgerSelection) {
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      setLedgerSelection(await loadLedgerAccountsPage(ledgerSelection.accountNumber + 1, 0));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to load the next Ledger account.";
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function previousLedgerAccount() {
    if (!ledgerSelection || ledgerSelection.accountNumber === 0) {
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      setLedgerSelection(await loadLedgerAccountsPage(ledgerSelection.accountNumber - 1, 0));
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Failed to load the previous Ledger account.";
      setError(message);
      throw nextError;
    } finally {
      setConnecting(false);
    }
  }

  async function cancelLedgerSelection() {
    await closeLedgerTransport();
    setLedgerSelection(null);
  }

  function disconnect() {
    signerRef.current = null;
    void closeLedgerTransport();
    setLedgerSelection(null);
    setConnection(null);
    setError(null);
  }

  async function sendDsm(input: SendDsmInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);
    const { coins } = await import("@cosmjs/stargate");

    const result = await client.sendTokens(
      session.connection.address,
      input.recipient,
      coins(parseDsmToMicro(input.amountDsm), DESMOS_CHAIN.denom),
      1.6,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function delegate(input: DelegateInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);

    const result = await client.delegateTokens(
      session.connection.address,
      input.validatorAddress,
      {
        denom: DESMOS_CHAIN.denom,
        amount: parseDsmToMicro(input.amountDsm)
      },
      1.6,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function undelegate(input: DelegateInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);

    const result = await client.undelegateTokens(
      session.connection.address,
      input.validatorAddress,
      {
        denom: DESMOS_CHAIN.denom,
        amount: parseDsmToMicro(input.amountDsm)
      },
      1.6,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function redelegate(input: RedelegateInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);

    const result = await client.signAndBroadcast(
      session.connection.address,
      [
        {
          typeUrl: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
          value: MsgBeginRedelegate.fromPartial({
            delegatorAddress: session.connection.address,
            validatorSrcAddress: input.sourceValidatorAddress,
            validatorDstAddress: input.destinationValidatorAddress,
            amount: {
              denom: DESMOS_CHAIN.denom,
              amount: parseDsmToMicro(input.amountDsm)
            }
          })
        }
      ],
      1.8,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function withdrawRewards(input: WithdrawRewardsInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);

    const result = await client.withdrawRewards(
      session.connection.address,
      input.validatorAddress,
      1.4,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function withdrawAllRewards(input: WithdrawAllRewardsInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);
    const validatorAddresses = input.validatorAddresses.filter(Boolean);

    if (validatorAddresses.length === 0) {
      throw new Error("No validators with claimable rewards were provided.");
    }

    const result = await client.signAndBroadcast(
      session.connection.address,
      validatorAddresses.map((validatorAddress) => ({
        typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward" as const,
        value: MsgWithdrawDelegatorReward.fromPartial({
          delegatorAddress: session.connection.address,
          validatorAddress
        })
      })),
      1.4 + Math.max(0, validatorAddresses.length - 1) * 0.4,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function voteOnProposal(input: VoteOnProposalInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);
    const proposalId = BigInt(input.proposalId);
    const option = mapProposalVoteOption(input.option);

    if (option === VoteOption.VOTE_OPTION_UNSPECIFIED) {
      throw new Error("Select a valid vote option.");
    }

    const result = await client.signAndBroadcast(
      session.connection.address,
      [
        {
          typeUrl: "/cosmos.gov.v1beta1.MsgVote",
          value: MsgVote.fromPartial({
            proposalId,
            voter: session.connection.address,
            option
          })
        }
      ],
      1.6,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  async function transferToOsmosis(input: IbcTransferInput): Promise<WalletTxResult> {
    const session = getWalletSession(signerRef.current, connection);
    const client = await createSigningClient(session.signer);

    const timeoutTimestamp = BigInt(Date.now() + 10 * 60_000) * 1_000_000n;

    const result = await client.signAndBroadcast(
      session.connection.address,
      [
        {
          typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
          value: MsgTransfer.fromPartial({
            sourcePort: "transfer",
            sourceChannel: input.channelId,
            token: {
              denom: DESMOS_CHAIN.denom,
              amount: parseDsmToMicro(input.amountDsm)
            },
            sender: session.connection.address,
            receiver: input.recipient,
            timeoutTimestamp
          })
        }
      ],
      2.2,
      input.memo ?? ""
    );

    return {
      transactionHash: result.transactionHash,
      rawLog: result.rawLog
    };
  }

  return (
    <WalletContext.Provider
      value={{
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
        delegate,
        undelegate,
        redelegate,
        withdrawRewards,
        withdrawAllRewards,
        voteOnProposal,
        transferToOsmosis
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("WalletProvider is missing.");
  }

  return context;
}
