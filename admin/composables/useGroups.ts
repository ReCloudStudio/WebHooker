import type { Group, GroupRole } from "~/types";

export function useGroupsApi() {
  const groups = ref<Group[]>([]);
  const isSuper = ref(false);
  /** groupId → role of the signed-in user (absent for super admins). */
  const roles = ref<Record<string, GroupRole>>({});
  const loading = ref(false);
  const needLogin = ref(false);
  const error = ref("");

  function roleOf(groupId: string): GroupRole | undefined {
    return isSuper.value ? "owner" : roles.value[groupId];
  }

  function canEditGroup(groupId: string): boolean {
    const r = roleOf(groupId);
    return isSuper.value || r === "owner";
  }

  function canEditRoutes(groupId: string): boolean {
    const r = roleOf(groupId);
    return isSuper.value || r === "owner" || r === "admin";
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      const res = await fetch("/admin/api/groups", {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 401) {
        needLogin.value = true;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        groups?: Group[];
        isSuper?: boolean;
        roles?: Record<string, GroupRole>;
      };
      groups.value = data.groups ?? [];
      isSuper.value = data.isSuper ?? false;
      roles.value = data.roles ?? {};
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function save(next: Group[]): Promise<void> {
    const res = await fetch("/admin/api/groups", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ groups: next }),
    });
    if (res.status === 401) {
      needLogin.value = true;
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    groups.value = next;
  }

  return { groups, isSuper, roles, roleOf, canEditGroup, canEditRoutes, loading, needLogin, error, load, save };
}
