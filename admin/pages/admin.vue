<template>
  <div>
    <header>
      <div class="brand">
        <div class="brand-mark">WH</div>
        <div>
          <h1>WebHooker</h1>
          <span class="tagline">CONFIG CONSOLE</span>
        </div>
      </div>
      <div class="head-actions">
        <button v-if="!needLogin && view === 'routes'" class="btn btn-accent" @click="openNew">
          + New Route
        </button>
        <button
          v-if="!needLogin && view === 'groups' && isSuper"
          class="btn btn-accent"
          @click="openNewGroup"
        >
          + New Group
        </button>
        <a v-if="!needLogin" class="btn btn-ghost" href="/admin/logout">Sign out</a>
      </div>
    </header>

    <main>
      <div v-if="needLogin" class="login">
        <div class="login-card">
          <h2>Config Console</h2>
          <p v-if="forbidden">
            Access denied — this GitHub account is not an admin or group admin.
          </p>
          <p v-else>Sign in with GitHub to manage routes.</p>
          <a class="btn btn-accent btn-lg" href="/admin/login">Sign in with GitHub</a>
        </div>
      </div>

      <template v-else>
        <nav class="tabs">
          <button class="tab" :class="{ active: view === 'routes' }" @click="switchView('routes')">
            Routes
          </button>
          <button
            v-if="isSuper"
            class="tab"
            :class="{ active: view === 'groups' }"
            @click="switchView('groups')"
          >
            Groups
          </button>
          <button class="tab" :class="{ active: view === 'logs' }" @click="switchView('logs')">
            Send Logs
          </button>
        </nav>

        <template v-if="view === 'routes'">
          <section class="toolbar">
            <div>
              <span class="kpi-label">ROUTES</span>
              <span class="kpi">{{ routes.length }}</span>
            </div>
            <div class="status">
              <span class="dot" :class="loading ? '' : 'ok'"></span>
              <span>{{ loading ? "loading" : "connected" }}</span>
            </div>
          </section>

          <p v-if="error" class="err">{{ error }}</p>

          <section class="routes">
            <RouteCard
              v-for="(r, i) in routes"
              :key="r.id"
              :route="r"
              :group-name="groupName(r.groupId)"
              :style="{ animationDelay: i * 45 + 'ms' }"
              @toggle="onToggle"
              @edit="openEdit"
              @delete="onDelete"
            />
          </section>

          <section v-if="!loading && !routes.length" class="empty">
            <p>No routes configured yet.</p>
            <button class="btn btn-accent" @click="openNew">Create your first route</button>
          </section>
        </template>

        <template v-else-if="view === 'groups'">
          <section class="toolbar">
            <div>
              <span class="kpi-label">GROUPS</span>
              <span class="kpi">{{ groups.length }}</span>
            </div>
            <div class="status">
              <span class="dot" :class="groupsLoading ? '' : 'ok'"></span>
              <span>{{ groupsLoading ? "loading" : "connected" }}</span>
            </div>
          </section>

          <p v-if="groupsError" class="err">{{ groupsError }}</p>

          <section class="routes">
            <article v-for="g in groups" :key="g.id" class="card">
              <div class="card-head">
                <div class="card-title">
                  <span class="route-name">{{ g.name || "(untitled)" }}</span>
                  <span class="route-id">{{ g.id }}</span>
                </div>
                <div class="card-actions">
                  <button class="icon-btn" title="Edit" @click="openEditGroup(g)">✎</button>
                  <button class="icon-btn danger" title="Delete" @click="onDeleteGroup(g)">✕</button>
                </div>
              </div>
              <div class="target">
                <span
                  ><b>ADMINS</b
                  ><code>{{ g.adminIds.length ? g.adminIds.join(", ") : "—" }}</code></span
                >
                <span
                  ><b>OWNERS</b
                  ><code>{{ g.owners && g.owners.length ? g.owners.join(", ") : "any" }}</code></span
                >
              </div>
            </article>
          </section>

          <section v-if="!groupsLoading && !groups.length" class="empty">
            <p>No groups yet. Groups scope routes by org/user and delegate access.</p>
            <button class="btn btn-accent" @click="openNewGroup">Create your first group</button>
          </section>
        </template>

        <template v-else>
          <section class="toolbar">
            <div class="status">
              <span class="dot" :class="logsLoading ? '' : 'ok'"></span>
              <span>{{ logsLoading ? "loading" : "connected" }}</span>
            </div>
          </section>
          <SendLogs :logs="logs" :loading="logsLoading" @refresh="loadLogs" />
        </template>
      </template>
    </main>

    <RouteEditor
      :open="editorOpen"
      :route="editing"
      :saving="saving"
      :groups="groups"
      @close="editorOpen = false"
      @save="onSave"
    />

    <GroupEditor
      :open="groupEditorOpen"
      :group="editingGroup"
      :saving="savingGroup"
      @close="groupEditorOpen = false"
      @save="onSaveGroup"
    />
  </div>
</template>

<script setup lang="ts">
import type { Group, Route } from "~/types";

const { routes, loading, needLogin, error, load, save } = useRoutesApi();
const { push } = useToasts();
const { logs, loading: logsLoading, load: loadLogs } = useSendLogs();
const {
  groups,
  isSuper,
  loading: groupsLoading,
  error: groupsError,
  load: loadGroups,
  save: saveGroups,
} = useGroupsApi();

const editorOpen = ref(false);
const editing = ref<Route | null>(null);
const saving = ref(false);
const forbidden = ref(false);
const view = ref<"routes" | "groups" | "logs">("routes");

const groupEditorOpen = ref(false);
const editingGroup = ref<Group | null>(null);
const savingGroup = ref(false);

onMounted(() => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    forbidden.value = params.get("error") === "forbidden";
  }
  load();
  loadLogs();
  loadGroups();
});

function groupName(id?: string): string | undefined {
  if (!id) return undefined;
  return groups.value.find((g) => g.id === id)?.name ?? id;
}

function switchView(next: "routes" | "groups" | "logs"): void {
  view.value = next;
  if (next === "routes") {
    load();
    loadGroups();
  }
  if (next === "groups") loadGroups();
  if (next === "logs") loadLogs();
}

function openNew(): void {
  editing.value = null;
  editorOpen.value = true;
}

function openEdit(route: Route): void {
  editing.value = route;
  editorOpen.value = true;
}

async function onSave(route: Route): Promise<void> {
  saving.value = true;
  try {
    let next: Route[];
    if (editing.value) {
      next = routes.value.map((r) => (r.id === editing.value!.id ? route : r));
    } else {
      if (routes.value.some((r) => r.id === route.id)) {
        push("Route ID already exists", "bad");
        return;
      }
      next = [...routes.value, route];
    }
    await save(next);
    editorOpen.value = false;
    push("Routes saved");
  } catch (err) {
    push(`Save failed: ${err instanceof Error ? err.message : err}`, "bad");
  } finally {
    saving.value = false;
  }
}

async function onToggle(route: Route): Promise<void> {
  try {
    await save(routes.value.map((r) => (r.id === route.id ? route : r)));
  } catch (err) {
    push(`Save failed: ${err instanceof Error ? err.message : err}`, "bad");
    load();
  }
}

async function onDelete(route: Route): Promise<void> {
  if (!window.confirm(`Delete route "${route.name || route.id}"?`)) return;
  try {
    await save(routes.value.filter((r) => r.id !== route.id));
    push("Route deleted");
  } catch (err) {
    push(`Delete failed: ${err instanceof Error ? err.message : err}`, "bad");
  }
}

function openNewGroup(): void {
  editingGroup.value = null;
  groupEditorOpen.value = true;
}

function openEditGroup(group: Group): void {
  editingGroup.value = group;
  groupEditorOpen.value = true;
}

async function onSaveGroup(group: Group): Promise<void> {
  savingGroup.value = true;
  try {
    let next: Group[];
    if (editingGroup.value) {
      next = groups.value.map((g) => (g.id === editingGroup.value!.id ? group : g));
    } else {
      if (groups.value.some((g) => g.id === group.id)) {
        push("Group ID already exists", "bad");
        return;
      }
      next = [...groups.value, group];
    }
    await saveGroups(next);
    groupEditorOpen.value = false;
    push("Groups saved");
  } catch (err) {
    push(`Save failed: ${err instanceof Error ? err.message : err}`, "bad");
  } finally {
    savingGroup.value = false;
  }
}

async function onDeleteGroup(group: Group): Promise<void> {
  const used = routes.value.filter((r) => r.groupId === group.id).length;
  const warn = used ? ` ${used} route(s) reference it and will lose their group.` : "";
  if (!window.confirm(`Delete group "${group.name || group.id}"?${warn}`)) return;
  try {
    await saveGroups(groups.value.filter((g) => g.id !== group.id));
    push("Group deleted");
  } catch (err) {
    push(`Delete failed: ${err instanceof Error ? err.message : err}`, "bad");
  }
}
</script>
