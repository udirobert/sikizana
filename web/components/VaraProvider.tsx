"use client";

import { ApiPromise, WsProvider } from '@polkadot/api';
import { GearApi } from '@gear-js/api';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Shape returned by web3Accounts() from @polkadot/extension-dapp.
type ConnectedAccount = {
  address: string;
  genesisHash?: string | null;
  name?: string;
  type?: string;
  meta: {
    genesisHash?: string | null;
    name?: string;
    source: string;
  };
};

interface VaraContextType {
  api: ApiPromise | null;
  isApiReady: boolean;
  account: ConnectedAccount | null;
  setAccount: (account: ConnectedAccount | null) => void;
}

const VaraContext = createContext<VaraContextType>({
  api: null,
  isApiReady: false,
  account: null,
  setAccount: () => {},
});

export function VaraProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [account, setAccount] = useState<ConnectedAccount | null>(null);

  useEffect(() => {
    const initApi = async () => {
      try {
        const provider = new WsProvider('wss://testnet.vara.network');
        const gear = await new GearApi({ provider });
        setApi(gear);
        setIsApiReady(true);
      } catch (error) {
        console.error('Failed to connect to Vara Network:', error);
      }
    };

    initApi();
  }, []);

  return (
    <VaraContext.Provider value={{ api, isApiReady, account, setAccount }}>
      {children}
    </VaraContext.Provider>
  );
}

export const useVara = () => useContext(VaraContext);
