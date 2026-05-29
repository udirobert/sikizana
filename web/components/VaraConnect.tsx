"use client";

import { useVara } from "./VaraProvider";
import { web3Enable, web3Accounts } from "@polkadot/extension-dapp";
import { useState } from "react";

export function VaraConnect() {
  const { account, setAccount, isApiReady } = useVara();
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      const extensions = await web3Enable("Sikizana");
      if (extensions.length === 0) {
        alert("No Polkadot/Vara extension found. Please install SubWallet or Enkrypt.");
        return;
      }

      const allAccounts = await web3Accounts();
      if (allAccounts.length > 0) {
        setAccount(allAccounts[0]);
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!account ? (
        <button
          onClick={connectWallet}
          disabled={!isApiReady || isConnecting}
          className="bg-white text-green-700 px-3 py-1 rounded-md text-xs font-bold hover:bg-green-50 transition disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-green-700 px-3 py-1 rounded-md">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-[10px] font-mono text-white">
            {account.address.slice(0, 6)}...{account.address.slice(-4)}
          </span>
        </div>
      )}
    </div>
  );
}
