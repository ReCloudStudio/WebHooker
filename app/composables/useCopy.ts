/**
 * Clipboard helper with execCommand fallback and a "just copied" flag keyed
 * by whatever identifies the copied value (a token, "url", "secret", ...).
 * The flag resets after `duration` ms.
 */
export function useCopy(duration = 1500) {
  const copied = ref("");

  async function copy(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    copied.value = key;
    window.setTimeout(() => {
      if (copied.value === key) copied.value = "";
    }, duration);
  }

  return { copied, copy };
}
