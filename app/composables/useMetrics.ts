import type { DeliveryMetrics } from "~/types";

export function useMetrics() {
  const { needLogin } = useAuthState();
  const metrics = ref<DeliveryMetrics | null>(null);
  const loading = ref(false);
  const error = ref("");

  async function load(groupId?: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
      const data = await apiFetch<{ metrics?: DeliveryMetrics }>(`/admin/api/metrics${qs}`);
      metrics.value = data.metrics ?? null;
    } catch (err) {
      if (!needLogin.value) error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  return { metrics, loading, error, load };
}
