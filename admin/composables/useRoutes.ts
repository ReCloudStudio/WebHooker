import type { Route } from "~/types";

export function useRoutesApi() {
  const routes = ref<Route[]>([]);
  const loading = ref(false);
  const needLogin = ref(false);
  const error = ref("");

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      const res = await fetch("/admin/api/routes", {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 401) {
        needLogin.value = true;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { routes?: Route[] };
      routes.value = data.routes ?? [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function save(next: Route[]): Promise<void> {
    const res = await fetch("/admin/api/routes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ routes: next }),
    });
    if (res.status === 401) {
      needLogin.value = true;
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    routes.value = next;
  }

  return { routes, loading, needLogin, error, load, save };
}
