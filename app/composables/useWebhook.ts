export interface GroupWebhookInfo {
  url: string;
  hasSecret: boolean;
  secret?: string;
}

export function useWebhookApi() {
  const loading = ref(false);
  const error = ref("");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    loading.value = true;
    error.value = "";
    try {
      return await apiFetch<T>(path, init);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function info(groupId: string): Promise<GroupWebhookInfo> {
    return request(`/admin/api/groups/${encodeURIComponent(groupId)}/webhook`);
  }

  function regenerate(groupId: string): Promise<GroupWebhookInfo> {
    return request(`/admin/api/groups/${encodeURIComponent(groupId)}/webhook/regenerate`, {
      method: "POST",
    });
  }

  function disable(groupId: string): Promise<{ ok: boolean }> {
    return request(`/admin/api/groups/${encodeURIComponent(groupId)}/webhook`, {
      method: "DELETE",
    });
  }

  return { loading, error, info, regenerate, disable };
}
