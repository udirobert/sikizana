"use client";

import { useEffect, useState } from "react";
import { PERSONA_STORAGE_KEY, type Persona } from "@/lib/persona-theme";

/** Reads the persisted chat persona (same key as /books). */
export function usePersona(): Persona {
  const [persona, setPersona] = useState<Persona>("siki");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERSONA_STORAGE_KEY);
      if (saved === "siki" || saved === "zana") {
        setPersona(saved);
      }
    } catch {
      /* private browsing */
    }
  }, []);

  return persona;
}
