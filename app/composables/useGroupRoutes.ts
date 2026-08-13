import type { Route } from "~/types";

export function useGroupRoutesApi() {
  const { needLogin } = useAuthState();
  const routes = ref<Route[]>([]);
  const loading = ref(false);
  const error = ref("");

  async function load(groupId: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      const data = await apiFetch<{ routes?: Route[] }>(
        `/admin/api/groups/${encodeURIComponent(groupId)}/routes`,
      );
      routes.value = data.routes ?? [];
    } catch (err) {
      if (!needLogin.value) error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function save(groupId: string, next: Route[]): Promise<void> {
    await apiFetch(`/admin/api/groups/${encodeURIComponent(groupId)}/routes`, {
      method: "PUT",
      body: JSON.stringify({ routes: next }),
    });
    routes.value = next;
  }

  return { routes, loading, needLogin, error, load, save };
}
