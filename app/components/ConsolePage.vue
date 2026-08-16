<template>
  <div class="flex min-h-screen bg-bg text-text">
    <!-- Sidebar -->
    <aside
      class="sticky top-0 z-30 flex h-screen w-[240px] flex-shrink-0 flex-col border-r border-border bg-surface max-lg:hidden"
    >
      <div class="flex items-center gap-3 px-5 py-5">
        <div class="brand-mark">WH</div>
        <div>
          <div class="text-sm font-extrabold tracking-tight">WebHooker</div>
          <div class="text-[10px] font-semibold uppercase tracking-[2px] text-faint">
            {{ t("app.tagline") }}
          </div>
        </div>
      </div>

      <nav class="flex-1 space-y-0.5 px-3">
        <button
          v-for="n in nav"
          :key="n.id"
          class="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] font-semibold transition-colors"
          :class="
            n.id === activeNav
              ? 'bg-accent-dim text-accent'
              : 'text-muted hover:bg-surface-2 hover:text-text'
          "
          @click="switchView(n.id)"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="n.id === activeNav ? 'bg-accent' : 'bg-border-strong'"
          />
          {{ n.label }}
        </button>
      </nav>

      <div class="border-t border-border px-3 py-4">
        <a
          class="block rounded-[8px] px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-2"
          href="/admin/logout"
        >
          {{ t("app.signOut") }}
        </a>
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border px-6 py-3"
        style="background: var(--header-bg); backdrop-filter: blur(12px)"
      >
        <div>
          <h1 class="text-[15px] font-extrabold tracking-tight">{{ pageTitle }}</h1>
          <p v-if="needLogin" class="text-[11px] text-faint">{{ t("login.title") }}</p>
          <p v-else class="text-[11px] text-faint">
            {{ loadingAny ? t("status.loading") : t("status.connected") }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="view === 'overview'" class="btn btn-ghost btn-sm" @click="refreshOverview">
            {{ t("metrics.refresh") }}
          </button>
          <button class="btn btn-ghost btn-sm" @click="toggle">{{ t("app.langToggle") }}</button>
          <button
            v-if="!needLogin && selectedGroup && canEditRoutes(selectedGroup.id)"
            class="btn btn-accent btn-sm"
            @click="openNew"
          >
            {{ t("app.newRoute") }}
          </button>
          <button
            v-if="!needLogin && !selectedGroup && view === 'groups' && isSuper"
            class="btn btn-accent btn-sm"
            @click="openNewGroup"
          >
            {{ t("app.newGroup") }}
          </button>
        </div>
      </header>

      <!-- Mobile nav -->
      <nav class="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 lg:hidden">
        <button
          v-for="n in nav"
          :key="n.id"
          class="whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[13px] font-semibold transition-colors"
          :class="n.id === activeNav ? 'bg-accent-dim text-accent' : 'text-muted'"
          @click="switchView(n.id)"
        >
          {{ n.label }}
        </button>
      </nav>

      <main class="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-6 max-sm:px-4">
        <div v-if="needLogin" class="login">
          <div class="login-card">
            <h2>{{ t("login.title") }}</h2>
            <p v-if="forbidden">{{ t("login.forbidden") }}</p>
            <p v-else>{{ t("login.prompt") }}</p>
            <a class="btn btn-accent btn-lg" href="/admin/login">{{ t("login.button") }}</a>
          </div>
        </div>

        <template v-else>
          <!-- Overview dashboard -->
          <AdminHome
            v-if="view === 'overview'"
            :key="refreshKey"
            :groups="groups"
            :logs="logs"
            :metrics="metrics"
            :groups-loading="groupsLoading"
            :logs-loading="logsLoading"
            :metrics-loading="metricsLoading"
          />

          <!-- Group detail view -->
          <template v-else-if="selectedGroup">
            <section class="toolbar">
              <div class="crumbs">
                <button class="btn btn-ghost btn-sm" @click="exitGroup">
                  {{ t("group.back") }}
                </button>
                <span class="kpi-label">{{
                  t("group.routesIn", { name: selectedGroup.name })
                }}</span>
                <span class="kpi">{{ groupRoutes.length }}</span>
              </div>
              <div class="status">
                <span class="dot" :class="groupRoutesLoading ? '' : 'ok'"></span>
                <span>{{ groupRoutesLoading ? t("status.loading") : t("status.connected") }}</span>
              </div>
            </section>

            <p v-if="groupRoutesError" class="err">{{ groupRoutesError }}</p>

            <section class="routes">
              <RouteCard
                v-for="(r, i) in groupRoutes"
                :key="r.id"
                :route="r"
                :at-first="i === 0"
                :at-last="i === groupRoutes.length - 1"
                :readonly="!canEditRoutes(selectedGroup.id)"
                :style="{ animationDelay: i * 45 + 'ms' }"
                @toggle="onToggle"
                @edit="openEdit"
                @delete="onDelete"
                @move="onMove"
              />
            </section>

            <section v-if="!groupRoutesLoading && !groupRoutes.length" class="empty">
              <p>{{ t("routes.emptyGroup") }}</p>
              <button
                v-if="canEditRoutes(selectedGroup.id)"
                class="btn btn-accent"
                @click="openNew"
              >
                {{ t("routes.createFirst") }}
              </button>
            </section>

            <MembersPanel
              :group="selectedGroup"
              :can-edit="canEditGroup(selectedGroup.id)"
              :saving="savingGroup"
              @save="onSaveGroupFromPanel"
            />

            <WebhookPanel
              v-if="canEditGroup(selectedGroup.id)"
              :group-id="selectedGroup.id"
              :can-edit="canEditGroup(selectedGroup.id)"
            />
          </template>

          <!-- Top-level views -->
          <template v-else-if="view === 'groups'">
            <section class="toolbar">
              <div>
                <span class="kpi-label">{{ t("kpi.groups") }}</span>
                <span class="kpi">{{ groups.length }}</span>
              </div>
              <div class="status">
                <span class="dot" :class="groupsLoading ? '' : 'ok'"></span>
                <span>{{ groupsLoading ? t("status.loading") : t("status.connected") }}</span>
              </div>
            </section>

            <p v-if="groupsError" class="err">{{ groupsError }}</p>

            <section class="routes">
              <article
                v-for="(g, i) in groups"
                :key="g.id"
                class="card cursor-pointer"
                :style="{ animationDelay: i * 45 + 'ms' }"
                @click="enterGroup(g)"
              >
                <div class="card-head">
                  <div class="card-title">
                    <span class="route-name">{{ g.name || t("route.untitled") }}</span>
                    <span class="route-id">{{ g.id }}</span>
                    <span v-if="roleOf(g.id)" class="badge lang">{{
                      t("role.badge", { role: t("roles." + roleOf(g.id)) })
                    }}</span>
                  </div>
                  <div v-if="canEditGroup(g.id)" class="card-actions" @click.stop>
                    <button
                      class="icon-btn"
                      :title="t('groupEditor.editTitle')"
                      @click="openEditGroup(g)"
                    >
                      ✎
                    </button>
                    <button class="icon-btn danger" @click="onDeleteGroup(g)">✕</button>
                  </div>
                </div>
                <div class="target">
                  <span
                    ><b>{{ t("groups.members") }}</b
                    ><code>{{
                      (g.members ?? []).length || (g.adminIds || []).length || "—"
                    }}</code></span
                  >
                  <span
                    ><b>{{ t("groups.owners") }}</b
                    ><code>{{
                      g.owners && g.owners.length ? g.owners.join(", ") : t("groups.any")
                    }}</code></span
                  >
                </div>
                <div class="group-open mt-2.5 text-right text-xs font-medium text-accent">
                  {{ t("groups.open") }}
                </div>
              </article>
            </section>

            <section v-if="!groupsLoading && !groups.length" class="empty">
              <p>{{ t("groups.empty") }}</p>
              <button v-if="isSuper" class="btn btn-accent" @click="openNewGroup">
                {{ t("groups.createFirst") }}
              </button>
            </section>
          </template>

          <template v-else-if="view === 'logs'">
            <section class="toolbar">
              <div class="status">
                <span class="dot" :class="logsLoading ? '' : 'ok'"></span>
                <span>{{ logsLoading ? t("status.loading") : t("status.connected") }}</span>
              </div>
            </section>
            <SendLogs
              :logs="logs"
              :loading="logsLoading"
              :error="logsError"
              :groups="groups"
              :selected-group-id="logFilterGroup"
              @refresh="loadLogs(50, logFilterGroup || undefined)"
              @filter="loadLogs(50, logFilterGroup || undefined)"
              @update:selected-group-id="logFilterGroup = $event"
            />
          </template>

          <template v-else-if="view === 'audit'">
            <AuditLog
              :entries="auditEntries"
              :loading="auditLoading"
              :error="auditError"
              :groups="groups"
              :selected-group-id="auditFilterGroup"
              @refresh="loadAudit(50, auditFilterGroup || undefined)"
              @filter="loadAudit(50, auditFilterGroup || undefined)"
              @update:selected-group-id="auditFilterGroup = $event"
            />
          </template>

          <template v-else-if="view === 'metrics'">
            <MetricsPanel
              :metrics="metrics"
              :loading="metricsLoading"
              :error="metricsError"
              :groups="groups"
              :selected-group-id="metricsFilterGroup"
              @refresh="loadMetrics(metricsFilterGroup || undefined)"
              @filter="loadMetrics(metricsFilterGroup || undefined)"
              @update:selected-group-id="metricsFilterGroup = $event"
            />
          </template>
        </template>
      </main>
    </div>

    <RouteEditor
      :open="editorOpen"
      :route="editing"
      :saving="saving"
      @close="editorOpen = false"
      @save="onSave"
    />

    <GroupEditor
      :open="groupEditorOpen"
      :group="editingGroup"
      :saving="savingGroup"
      :super-admin="isSuper"
      @close="groupEditorOpen = false"
      @save="onSaveGroup"
    />
  </div>
</template>

<script setup lang="ts">
import type { Group, Route } from "~/types";
import { useAuditApi } from "~/composables/useAudit";
import WebhookPanel from "~/components/WebhookPanel.vue";
import AdminHome from "~/components/AdminHome.vue";

const { t, toggle } = useI18n();
const { push } = useToasts();
const route = useRoute();
const router = useRouter();

/**
 * The console view mirrors the URL path so navigation is deep-linkable:
 * /admin (overview) · /admin/groups · /admin/logs · /admin/audit · /admin/metrics.
 * Unknown slugs 404.
 */
type View = "overview" | "groups" | "logs" | "audit" | "metrics";
const view = computed<View | null>(() => {
  const seg = route.path.split("/").filter(Boolean)[1];
  if (!seg) return "overview";
  if (
    seg === "overview" ||
    seg === "groups" ||
    seg === "logs" ||
    seg === "audit" ||
    seg === "metrics"
  )
    return seg;
  return null;
});

if (view.value === null) {
  throw createError({ statusCode: 404, statusMessage: "Page not found", fatal: false });
}

const nav = computed(() => [
  { id: "overview" as View, label: t("tab.overview"), path: "/admin" },
  { id: "groups" as View, label: t("tab.groups"), path: "/admin/groups" },
  { id: "logs" as View, label: t("tab.logs"), path: "/admin/logs" },
  { id: "audit" as View, label: t("tab.audit"), path: "/admin/audit" },
  { id: "metrics" as View, label: t("tab.metrics"), path: "/admin/metrics" },
]);

const activeNav = computed<View>(() => view.value ?? "overview");

const pageTitle = computed(() => {
  if (selectedGroup.value) return t("group.routesIn", { name: selectedGroup.value.name });
  switch (view.value) {
    case "overview":
      return t("tab.overview");
    case "groups":
      return t("tab.groups");
    case "logs":
      return t("tab.logs");
    case "audit":
      return t("tab.audit");
    case "metrics":
      return t("tab.metrics");
    default:
      return "";
  }
});

const loadingAny = computed(
  () =>
    groupsLoading.value ||
    logsLoading.value ||
    metricsLoading.value ||
    groupRoutesLoading.value ||
    auditLoading.value,
);

const { logs, loading: logsLoading, error: logsError, load: loadLogs } = useSendLogs();
const {
  entries: auditEntries,
  loading: auditLoading,
  error: auditError,
  load: loadAudit,
} = useAuditApi();
const { metrics, loading: metricsLoading, error: metricsError, load: loadMetrics } = useMetrics();
const {
  groups,
  isSuper,
  roles,
  roleOf,
  canEditGroup,
  canEditRoutes,
  loading: groupsLoading,
  needLogin,
  error: groupsError,
  load: loadGroups,
  save: saveGroups,
  rename: groupsRename,
} = useGroupsApi();
const {
  routes: groupRoutes,
  loading: groupRoutesLoading,
  error: groupRoutesError,
  load: loadGroupRoutes,
  save: saveGroupRoutes,
} = useGroupRoutesApi();

const editorOpen = ref(false);
const editing = ref<Route | null>(null);
const saving = ref(false);
const forbidden = ref(false);
const selectedGroup = ref<Group | null>(null);

const groupEditorOpen = ref(false);
const editingGroup = ref<Group | null>(null);
const savingGroup = ref(false);

const logFilterGroup = ref("");
const auditFilterGroup = ref("");
const metricsFilterGroup = ref("");
const refreshKey = ref(0);

onMounted(() => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    forbidden.value = params.get("error") === "forbidden";
    const invite = params.get("invite");
    if (invite === "ok") push(t("members.inviteOk"));
    else if (invite != null && invite !== "ok") push(t("members.inviteBad"), "bad");
    if (params.get("install") === "ok") push(t("install.ok"));
  }
  loadGroups();
  loadLogs(50, logFilterGroup.value || undefined);
  loadMetrics();
});

// Tab switches are client-side navigations (no remount), so load the audit
// log whenever the audit view becomes active — including direct deep links.
watch(
  view,
  (v) => {
    if (v === "audit") loadAudit(50, auditFilterGroup.value || undefined);
    if (v === "metrics") loadMetrics(metricsFilterGroup.value || undefined);
  },
  { immediate: true },
);

function switchView(next: View): void {
  const path = next === "overview" ? "/admin" : `/admin/${next}`;
  if (route.path !== path) router.replace(path);
}

async function refreshOverview(): Promise<void> {
  refreshKey.value++;
  await Promise.all([loadGroups(), loadLogs(50, logFilterGroup.value || undefined), loadMetrics()]);
  push(t("overview.refreshed"));
}

function enterGroup(group: Group): void {
  selectedGroup.value = group;
  groupRoutes.value = [];
  loadGroupRoutes(group.id);
}

function exitGroup(): void {
  selectedGroup.value = null;
  loadGroups();
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
  const group = selectedGroup.value;
  if (!group) return;
  saving.value = true;
  try {
    let next: Route[];
    if (editing.value) {
      next = groupRoutes.value.map((r) => (r.id === editing.value!.id ? route : r));
    } else {
      if (groupRoutes.value.some((r) => r.id === route.id)) {
        push(t("toast.routeIdExists"), "bad");
        return;
      }
      next = [...groupRoutes.value, route];
    }
    await saveGroupRoutes(group.id, next);
    editorOpen.value = false;
    push(t("toast.routesSaved"));
  } catch (err) {
    push(t("toast.saveFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
  } finally {
    saving.value = false;
  }
}

async function onMove(route: Route, dir: -1 | 1): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  const i = groupRoutes.value.findIndex((r) => r.id === route.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= groupRoutes.value.length) return;
  const next = [...groupRoutes.value];
  [next[i], next[j]] = [next[j]!, next[i]!];
  try {
    await saveGroupRoutes(group.id, next);
  } catch (err) {
    push(t("toast.saveFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
    loadGroupRoutes(group.id);
  }
}

async function onToggle(route: Route): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  try {
    await saveGroupRoutes(
      group.id,
      groupRoutes.value.map((r) => (r.id === route.id ? route : r)),
    );
  } catch (err) {
    push(t("toast.saveFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
    loadGroupRoutes(group.id);
  }
}

async function onDelete(route: Route): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  if (!window.confirm(t("confirm.deleteRoute", { name: route.name || route.id }))) return;
  try {
    await saveGroupRoutes(
      group.id,
      groupRoutes.value.filter((r) => r.id !== route.id),
    );
    push(t("toast.routeDeleted"));
  } catch (err) {
    push(t("toast.deleteFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
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

async function onSaveGroupFromPanel(group: Group): Promise<void> {
  savingGroup.value = true;
  try {
    const next = groups.value.map((g) => (g.id === group.id ? group : g));
    await saveGroups(next);
    selectedGroup.value = group;
    push(t("toast.groupSaved"));
  } catch (err) {
    push(t("toast.saveFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
    if (selectedGroup.value) {
      loadGroups();
    }
  } finally {
    savingGroup.value = false;
  }
}

async function onSaveGroup(group: Group): Promise<void> {
  savingGroup.value = true;
  try {
    const editing = editingGroup.value;
    let next: Group[];
    if (editing) {
      if (group.id !== editing.id) {
        // Id changed: rename first so routes/webhook secret/invites follow,
        // then persist the remaining edits under the new id.
        await groupsRename(editing.id, group.id);
        next = [...groups.value.filter((g) => g.id !== editing.id), group];
      } else {
        next = groups.value.map((g) => (g.id === editing.id ? group : g));
      }
    } else {
      if (groups.value.some((g) => g.id === group.id)) {
        push(t("toast.groupIdExists"), "bad");
        return;
      }
      next = [...groups.value, group];
    }
    await saveGroups(next);
    groupEditorOpen.value = false;
    push(t("toast.groupSaved"));
    await loadGroups();
  } catch (err) {
    push(t("toast.saveFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
  } finally {
    savingGroup.value = false;
  }
}

async function onDeleteGroup(group: Group): Promise<void> {
  // Fetch the real route count for this group instead of relying on the
  // routes of whichever group happens to be open in the detail view.
  let used = 0;
  try {
    const data = await apiFetch<{ routes?: Route[] }>(
      `/admin/api/groups/${encodeURIComponent(group.id)}/routes`,
    );
    used = (data.routes ?? []).length;
  } catch {
    // Count is best-effort; proceed without the warning.
  }
  const warn = used ? t("confirm.deleteGroupWarn", { n: used }) : "";
  if (!window.confirm(t("confirm.deleteGroup", { name: group.name || group.id }) + warn)) return;
  try {
    await saveGroups(groups.value.filter((g) => g.id !== group.id));
    push(t("toast.groupDeleted"));
  } catch (err) {
    push(t("toast.deleteFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
  }
}
</script>
