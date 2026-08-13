import type { AuditEntry } from "~/types";

export function useAuditApi() {
  const { needLogin } = useAuthState();
  const entries = ref<AuditEntry[]>([]);
  const loading = ref(false);
  const error = ref("");

  async function load(limit = 50, groupId?: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      let url = `/admin/api/audit?limit=${limit}`;
      if (groupId) url += `&groupId=${encodeURIComponent(groupId)}`;
      const data = await apiFetch<{ audit?: AuditEntry[] }>(url);
      entries.value = data.audit ?? [];
    } catch (err) {
      if (!needLogin.value) error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, needLogin, error, load };
}
