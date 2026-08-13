import type { AuditEntry } from "~/types";

export function useAuditApi() {
  const entries = ref<AuditEntry[]>([]);
  const loading = ref(false);
  const needLogin = ref(false);
  const error = ref("");

  async function load(limit = 50, groupId?: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      let url = `/admin/api/audit?limit=${limit}`;
      if (groupId) url += `&groupId=${encodeURIComponent(groupId)}`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 401) {
        needLogin.value = true;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { audit?: AuditEntry[] };
      entries.value = data.audit ?? [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, needLogin, error, load };
}
