export const DESMOS_CHAIN = {
  chainId: "desmos-mainnet",
  chainName: "Desmos",
  rpcUrl: "https://rpc.mainnet.desmos.network:443",
  restUrl: "https://api.mainnet.desmos.network",
  grpcUrl: "https://grpc.mainnet.desmos.network:443",
  denom: "udsm",
  displayDenom: "DSM",
  exponent: 6,
  coinType: 852,
  bech32Prefix: "desmos",
  osmosisChannelId: "channel-2"
} as const;

export const DESMOS_TOKEN_ICON_URL =
  "https://raw.githubusercontent.com/cosmos/chain-registry/master/desmos/images/dsm.svg";

export const DESMOS_CHAIN_INFO = {
  chainId: DESMOS_CHAIN.chainId,
  chainName: DESMOS_CHAIN.chainName,
  rpc: DESMOS_CHAIN.rpcUrl,
  rest: DESMOS_CHAIN.restUrl,
  bip44: {
    coinType: DESMOS_CHAIN.coinType
  },
  bech32Config: {
    bech32PrefixAccAddr: DESMOS_CHAIN.bech32Prefix,
    bech32PrefixAccPub: `${DESMOS_CHAIN.bech32Prefix}pub`,
    bech32PrefixValAddr: `${DESMOS_CHAIN.bech32Prefix}valoper`,
    bech32PrefixValPub: `${DESMOS_CHAIN.bech32Prefix}valoperpub`,
    bech32PrefixConsAddr: `${DESMOS_CHAIN.bech32Prefix}valcons`,
    bech32PrefixConsPub: `${DESMOS_CHAIN.bech32Prefix}valconspub`
  },
  currencies: [
    {
      coinDenom: DESMOS_CHAIN.displayDenom,
      coinMinimalDenom: DESMOS_CHAIN.denom,
      coinDecimals: DESMOS_CHAIN.exponent
    }
  ],
  feeCurrencies: [
    {
      coinDenom: DESMOS_CHAIN.displayDenom,
      coinMinimalDenom: DESMOS_CHAIN.denom,
      coinDecimals: DESMOS_CHAIN.exponent,
      gasPriceStep: {
        low: 0.01,
        average: 0.025,
        high: 0.04
      }
    }
  ],
  stakeCurrency: {
    coinDenom: DESMOS_CHAIN.displayDenom,
    coinMinimalDenom: DESMOS_CHAIN.denom,
    coinDecimals: DESMOS_CHAIN.exponent
  },
  features: ["stargate", "ibc-transfer"]
};

export function getWorkerRpcEndpoint(): string {
  if (typeof window === "undefined") {
    return DESMOS_CHAIN.rpcUrl;
  }

  return new URL("/rpc", window.location.origin).toString();
}
