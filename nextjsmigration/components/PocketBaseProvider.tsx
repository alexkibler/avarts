"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { pb } from "@/lib/database";
import type { UserData } from "@/lib/types";

interface PocketBaseContextType {
  pb: typeof pb;
  user: UserData | null;
  isLoading: boolean;
}

const PocketBaseContext = createContext<PocketBaseContextType>({
  pb,
  user: null,
  isLoading: true,
});

export const usePocketBase = () => useContext(PocketBaseContext);

export function PocketBaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(pb.authStore.model as UserData | null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Sync initial state after mount (client-side)
    setUser(pb.authStore.model as UserData | null);
    setIsLoading(false);

    // Subscribe to auth state changes
    const unsubscribe = pb.authStore.onChange((token, model) => {
      setUser(model as UserData | null);
    });

    return () => unsubscribe();
  }, []);

  return (
    <PocketBaseContext.Provider value={{ pb, user, isLoading }}>
      {children}
    </PocketBaseContext.Provider>
  );
}
