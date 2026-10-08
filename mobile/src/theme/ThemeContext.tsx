import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type ThemeColors } from "./colors";

export type ThemeMode = "system" | "light" | "dark";
const STORAGE_KEY = "ondal.themeMode";

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: "light" | "dark";
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "light" || value === "dark" || value === "system") setModeState(value);
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const scheme = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  const colors = scheme === "dark" ? darkColors : lightColors;
  const value = useMemo(() => ({ mode, scheme, colors, setMode }), [mode, scheme, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
