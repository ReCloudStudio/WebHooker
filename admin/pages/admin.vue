<template>
  <div>
    <header>
      <div class="brand">
        <div class="brand-mark">WH</div>
        <div>
          <h1>WebHooker</h1>
          <span class="tagline">{{ t("app.tagline") }}</span>
        </div>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" @click="toggle">{{ t("app.langToggle") }}</button>
        <button
          v-if="!needLogin && selectedGroup && canEditRoutes(selectedGroup.id)"
          class="btn btn-accent"
          @click="openNew"
        >
          {{ t("app.newRoute") }}
        </button>
        <button
          v-if="!needLogin && !selectedGroup && view === 'groups' && isSuper"
          class="btn btn-accent"
          @click="openNewGroup"
        >
          {{ t("app.newGroup") }}
        </button>
        <a v-if="!needLogin" class="btn btn-ghost" href="/admin/logout">{{ t("app.signOut") }}</a>
      </div>
    </header>

    <main>
      <div v-if="needLogin" class="login">
        <div class="login-card">
          <h2>{{ t("login.title") }}</h2>
          <p v-if="forbidden">{{ t("login.forbidden") }}</p>
          <p v-else>{{ t("login.prompt") }}</p>
          <a class="btn btn-accent btn-lg" href="/admin/login">{{ t("login.button") }}</a>
        </div>
      </div>

      <template v-else>
        <!-- Group detail view -->
        <template v-if="selectedGroup">
          <section class="toolbar">
            <div class="crumbs">
              <button class="btn btn-ghost btn-sm" @click="exitGroup">{{ t("group.back") }}</button>
              <span class="kpi-label">{{ t("group.routesIn", { name: selectedGroup.name }) }}</span>
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
        </template>

        <!-- Top-level views -->
        <template v-else>
          <nav class="tabs">
            <button
              class="tab"
              :class="{ active: view === 'groups' }"
              @click="switchView('groups')"
            >
              {{ t("tab.groups") }}
            </button>
            <button class="tab" :class="{ active: view === 'logs' }" @click="switchView('logs')">
              {{ t("tab.logs") }}
            </button>
            <button class="tab" :class="{ active: view === 'audit' }" @click="switchView('audit')">
              {{ t("tab.audit") }}
            </button>
          </nav>

          <template v-if="view === 'groups'">
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
                class="card group-card"
                :style="{ animationDelay: i * 45 + 'ms' }"
                @click="enterGroup(g)"
              >
                <div class="card-head">
                  <div class="card-title">
                    <span class="route-name">{{ g.name || t("route.untitled") }}</span>
                    <span class="route-id">{{ g.id }}</span>
                    <span v-if="roleOf(g.id)" class="badge lang">{{ t("role.badge", { role: t("roles." + roleOf(g.id)) }) }}</span>
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
                    ><code>{{ (g.members ?? []).length || (g.adminIds || []).length || "—" }}</code></span
                  >
                  <span
                    ><b>{{ t("groups.owners") }}</b
                    ><code>{{
                      g.owners && g.owners.length ? g.owners.join(", ") : t("groups.any")
                    }}</code></span
                  >
                </div>
                <div class="group-open">{{ t("groups.open") }}</div>
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
        </template>
      </template>
    </main>

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

const { t, toggle } = useI18n();
const { push } = useToasts();
const { logs, loading: logsLoading, load: loadLogs } = useSendLogs();
const { entries: auditEntries, loading: auditLoading, error: auditError, load: loadAudit } = useAuditApi();
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
const view = ref<"groups" | "logs" | "audit">("groups");
const selectedGroup = ref<Group | null>(null);

const groupEditorOpen = ref(false);
const editingGroup = ref<Group | null>(null);
const savingGroup = ref(false);

const logFilterGroup = ref("");
const auditFilterGroup = ref("");

onMounted(() => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    forbidden.value = params.get("error") === "forbidden";
    const invite = params.get("invite");
    if (invite === "ok") push(t("members.inviteOk"));
    else if (invite != null && invite !== "ok") push(t("members.inviteBad"), "bad");
  }
  loadGroups();
  loadLogs(50, logFilterGroup.value || undefined);
});

function switchView(next: "groups" | "logs" | "audit"): void {
  view.value = next;
  if (next === "groups") loadGroups();
  if (next === "logs") loadLogs(50, logFilterGroup.value || undefined);
  if (next === "audit") loadAudit(50, auditFilterGroup.value || undefined);
}

function enterGroup(group: Group): void {
  selectedGroup.value = group;
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
    let next: Group[];
    if (editingGroup.value) {
      next = groups.value.map((g) => (g.id === editingGroup.value!.id ? group : g));
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
  } catch (err) {
    push(t("toast.saveFailed", { msg: err instanceof Error ? err.message : String(err) }), "bad");
  } finally {
    savingGroup.value = false;
  }
}

async function onDeleteGroup(group: Group): Promise<void> {
  const used = groupRoutes.value.filter((r) => r.groupId === group.id).length;
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
