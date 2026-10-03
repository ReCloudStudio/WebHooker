import { onMounted, readonly, ref } from "vue";

export type ThemePreference = "auto" | "light" | "dark";

const STORAGE_KEY = "wh-theme";
const theme = ref<ThemePreference>("auto");
const isDark = ref(false);
let initialized = false;

function resolveSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(targetTheme: ThemePreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const darkActive = targetTheme === "dark" || (targetTheme === "auto" && resolveSystemDark());
  isDark.value = darkActive;
  if (darkActive) {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
  } else {
    root.classList.remove("dark");
    if (targetTheme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }
}

export function useTheme() {
  function setTheme(next: ThemePreference) {
    theme.value = next;
    try {
      if (next === "auto") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // localStorage may fail in sandboxed or private contexts
    }
    applyTheme(next);
  }

  function cycleTheme() {
    const order: readonly ThemePreference[] = ["auto", "light", "dark"] as const;
    const idx = order.indexOf(theme.value);
    const next = order[(idx + 1) % order.length];
    if (next) {
      setTheme(next);
    }
  }

  onMounted(() => {
    if (initialized) return;
    initialized = true;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "auto") {
        theme.value = stored;
      }
    } catch {
      // fallback to auto
    }

    applyTheme(theme.value);

    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", () => {
        if (theme.value === "auto") {
          applyTheme("auto");
        }
      });
    }
  });

  return {
    theme: readonly(theme),
    isDark: readonly(isDark),
    setTheme,
    cycleTheme,
  };
}
