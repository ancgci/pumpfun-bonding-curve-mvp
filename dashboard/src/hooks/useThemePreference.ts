import { useEffect, useState } from "react";

export type ThemePreference = "dark" | "light";

const STORAGE_KEY = "pumpfun-dashboard-theme";

function getSystemTheme(): ThemePreference {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getInitialTheme(): ThemePreference {
  if (typeof window === "undefined") return "dark";

  const savedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return getSystemTheme();
}

function applyTheme(theme: ThemePreference) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function useThemePreference() {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const initialTheme = getInitialTheme();
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = initialTheme;
      document.documentElement.style.colorScheme = initialTheme;
    }
    return initialTheme;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
}
