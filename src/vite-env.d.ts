/// <reference types="vite/client" />

type KeplrAccount = {
  address: Uint8Array;
  bech32Address: string;
  algo: string;
  pubKey: Uint8Array;
};

type KeplrChainInfo = {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bip44: { coinType: number };
  bech32Config: {
    bech32PrefixAccAddr: string;
    bech32PrefixAccPub: string;
    bech32PrefixValAddr: string;
    bech32PrefixValPub: string;
    bech32PrefixConsAddr: string;
    bech32PrefixConsPub: string;
  };
  currencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    coinGeckoId?: string;
  }>;
  feeCurrencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    coinGeckoId?: string;
    gasPriceStep?: {
      low: number;
      average: number;
      high: number;
    };
  }>;
  stakeCurrency: {
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    coinGeckoId?: string;
  };
  features?: string[];
};

interface Window {
  keplr?: {
    enable: (chainId: string | string[]) => Promise<void>;
    getKey: (chainId: string) => Promise<KeplrAccount>;
    experimentalSuggestChain?: (chainInfo: KeplrChainInfo) => Promise<void>;
  };
  getOfflineSigner?: (chainId: string) => import("@cosmjs/proto-signing").OfflineSigner;
  getOfflineSignerAuto?: (chainId: string) => Promise<import("@cosmjs/proto-signing").OfflineSigner>;
}
