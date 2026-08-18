import type { NamedFragment } from "~/types";

export function useFragmentsApi() {
  const { needLogin } = useAuthState();
  const fragments = ref<NamedFragment[]>([]);
  const loading = ref(false);
  const error = ref("");

  async function load(groupId: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      const data = await apiFetch<{ fragments?: NamedFragment[] }>(
        `/admin/api/groups/${encodeURIComponent(groupId)}/fragments`,
      );
      fragments.value = data.fragments ?? [];
    } catch (err) {
      if (!needLogin.value) error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function save(groupId: string, next: NamedFragment[]): Promise<void> {
    await apiFetch(`/admin/api/groups/${encodeURIComponent(groupId)}/fragments`, {
      method: "PUT",
      body: JSON.stringify({ fragments: next }),
    });
    fragments.value = next;
  }

  return { fragments, loading, needLogin, error, load, save };
}
