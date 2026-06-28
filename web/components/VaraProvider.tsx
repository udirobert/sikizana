"use client";

import { ApiPromise, WsProvider } from '@polkadot/api';
import { GearApi } from '@gear-js/api';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface VaraContextType {
  api: ApiPromise | null;
  isApiReady: boolean;
  account: any | null;
  setAccount: (account: any) => void;
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
  const [account, setAccount] = useState<any>(null);

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
