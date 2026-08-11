import type { GroupInvite } from "~/types";

export function useInvitesApi() {
  const loading = ref(false);
  const error = ref("");

  async function create(groupId: string, role: "admin" | "viewer"): Promise<string> {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch(`/admin/api/groups/${encodeURIComponent(groupId)}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url?: string };
      return data.url ?? "";
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function list(groupId: string): Promise<GroupInvite[]> {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch(`/admin/api/groups/${encodeURIComponent(groupId)}/invites`, {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { invites?: GroupInvite[] };
      return data.invites ?? [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function revoke(token: string): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch(`/admin/api/invites/${encodeURIComponent(token)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, create, list, revoke };
}
