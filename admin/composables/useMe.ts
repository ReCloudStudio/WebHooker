import type { Me } from "~/types";

export function useMeApi() {
  const me = ref<Me | null>(null);
  const loading = ref(false);
  const needLogin = ref(false);

  async function load(): Promise<void> {
    loading.value = true;
    needLogin.value = false;
    try {
      const res = await fetch("/admin/api/me", {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 401) {
        needLogin.value = true;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      me.value = (await res.json()) as Me;
    } catch {
      me.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { me, loading, needLogin, load };
}
