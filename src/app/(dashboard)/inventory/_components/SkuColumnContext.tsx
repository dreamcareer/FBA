"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type SkuColumnState = {
  expanded: boolean;
  toggle: () => void;
};

const SkuColumnContext = createContext<SkuColumnState>({
  expanded: false,
  toggle: () => {},
});

/** SKU列のASIN/JAN表示をヘッダーと各行で共有するプロバイダー */
export function SkuColumnProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <SkuColumnContext.Provider
      value={{ expanded, toggle: () => setExpanded((v) => !v) }}
    >
      {children}
    </SkuColumnContext.Provider>
  );
}

export function useSkuColumn() {
  return useContext(SkuColumnContext);
}
