"use client";

import { ReactNode } from "react";
import { VaraProvider } from "@/components/VaraProvider";

export function ClientProviders({ children }: { children: ReactNode }) {
  return <VaraProvider>{children}</VaraProvider>;
}
