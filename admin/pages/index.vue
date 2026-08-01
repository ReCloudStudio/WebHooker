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
        <button v-if="!needLogin" class="btn btn-accent" @click="openNew">+ New Route</button>
        <a v-if="!needLogin" class="btn btn-ghost" href="/admin/logout">Sign out</a>
      </div>
    </header>

    <main>
      <div v-if="needLogin" class="login">
        <div class="login-card">
          <h2>Config Console</h2>
          <p v-if="forbidden">Access denied — this GitHub account is not in <code>ADMIN_USER_IDS</code>.</p>
          <p v-else>Sign in with GitHub to manage routes.</p>
          <a class="btn btn-accent btn-lg" href="/admin/login">Sign in with GitHub</a>
        </div>
      </div>

      <template v-else>
        <nav class="tabs">
          <button class="tab" :class="{ active: view === 'routes' }" @click="switchView('routes')">
            Routes
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
      @close="editorOpen = false"
      @save="onSave"
    />
  </div>
</template>

<script setup lang="ts">
import type { Route } from "~/types";

const { routes, loading, needLogin, error, load, save } = useRoutesApi();
const { push } = useToasts();
const { logs, loading: logsLoading, load: loadLogs } = useSendLogs();

const editorOpen = ref(false);
const editing = ref<Route | null>(null);
const saving = ref(false);
const forbidden = ref(false);
const view = ref<"routes" | "logs">("routes");

onMounted(() => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    forbidden.value = params.get("error") === "forbidden";
  }
  load();
  loadLogs();
});

function switchView(next: "routes" | "logs"): void {
  view.value = next;
  if (next === "routes") load();
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
</script>
