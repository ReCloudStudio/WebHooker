import type { SendRecord } from "~/types";

export function useSendLogs() {
  const logs = ref<SendRecord[]>([]);
  const loading = ref(false);
  const needLogin = ref(false);
  const error = ref("");

  async function load(limit = 50, groupId?: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      let url = `/admin/api/logs?limit=${limit}`;
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
      const data = (await res.json()) as { logs?: SendRecord[] };
      logs.value = data.logs ?? [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function loadById(id: number): Promise<SendRecord | null> {
    const res = await fetch(`/admin/api/logs/${id}`, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (res.status === 401) {
      needLogin.value = true;
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { log?: SendRecord };
    return data.log ?? null;
  }

  return { logs, loading, needLogin, error, load, loadById };
}