<script setup lang="ts">
import type { DeliveryMetrics, Group, Route, SendRecord } from "~/types";

const props = defineProps<{
  groups: Group[];
  logs: SendRecord[];
  metrics: DeliveryMetrics | null;
  groupsLoading: boolean;
  logsLoading: boolean;
  metricsLoading: boolean;
}>();

const { t } = useI18n();
const router = useRouter();

const routesByGroup = ref<Record<string, Route[]>>({});
const routesLoading = ref(false);

const allRoutes = computed(() => {
  const out: Array<Route & { group?: Group }> = [];
  for (const g of props.groups) {
    for (const r of routesByGroup.value[g.id] ?? []) out.push({ ...r, group: g });
  }
  return out;
});

async function loadRoutes() {
  if (!props.groups.length) return;
  routesLoading.value = true;
  const entries = await Promise.all(
    props.groups.map(async (g) => {
      try {
        const data = await apiFetch<{ routes?: Route[] }>(
          `/admin/api/groups/${encodeURIComponent(g.id)}/routes`,
        );
        return [g.id, data.routes ?? []] as const;
      } catch {
        return [g.id, []] as const;
      }
    }),
  );
  routesByGroup.value = Object.fromEntries(entries);
  routesLoading.value = false;
}

onMounted(loadRoutes);
watch(() => props.groups, loadRoutes);

const kpis = computed(() => {
  const m = props.metrics;
  const total = m?.total ?? 0;
  const ok = m?.ok ?? 0;
  const rate = total ? (ok / total) * 100 : 0;
  return [
    { label: t("metrics.total"), value: total.toLocaleString(), tone: "accent" },
    { label: t("metrics.successRate"), value: `${rate.toFixed(1)}%`, tone: "ok" },
    { label: t("metrics.failed"), value: (m?.failed ?? 0).toLocaleString(), tone: "bad" },
    {
      label: t("metrics.avgDuration"),
      value: `${(m?.avgDurationMs ?? 0).toFixed(0)}ms`,
      tone: "muted",
    },
  ];
});

const KPI_TEXT: Record<string, string> = {
  accent: "text-accent",
  ok: "text-ok",
  bad: "text-bad",
  muted: "text-text",
};

const EVENT_TONES: Record<string, string> = {
  push: "ok",
  pull_request: "accent",
  issues: "warn",
  workflow_run: "info",
  check_suite: "info",
  check_run: "info",
  release: "ok",
  deployment: "accent",
};

const EVENT_BADGE: Record<string, string> = {
  ok: "bg-ok-dim text-ok",
  accent: "bg-accent-dim text-accent",
  warn: "bg-warn-dim text-warn",
  info: "bg-info-dim text-info",
  bad: "bg-bad-dim text-bad",
  muted: "bg-surface-2 text-muted",
};

function eventBadge(ev: string): string {
  return EVENT_BADGE[EVENT_TONES[ev] ?? "muted"] ?? EVENT_BADGE.muted!;
}

function fmtTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.max(1, Math.round(d / 1000))}s`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h`;
  return `${Math.round(d / 86_400_000)}d`;
}

function platformLabel(p?: string): string {
  return p === "telegram" ? "TG" : p === "discord" ? "DC" : "—";
}

function routeEvents(r: Route): string[] {
  return r.filters
    .filter((f) => f.type === "event")
    .flatMap((f) => (Array.isArray(f.match) ? f.match : [f.match]));
}
</script>

<template>
  <div class="space-y-6">
    <!-- KPI cards -->
    <section class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <div v-for="k in kpis" :key="k.label" class="rounded border border-border bg-surface p-5">
        <div class="text-[11px] font-bold uppercase tracking-[1.5px] text-faint">{{ k.label }}</div>
        <div
          class="mt-2 text-2xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums]"
          :class="KPI_TEXT[k.tone] ?? KPI_TEXT.muted"
        >
          {{ metricsLoading ? "—" : k.value }}
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <!-- Routes overview -->
      <section class="rounded border border-border bg-surface xl:col-span-2">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 class="text-sm font-bold tracking-tight">{{ t("overview.routes") }}</h2>
          <span class="text-xs text-faint [font-variant-numeric:tabular-nums]">{{
            allRoutes.length
          }}</span>
        </div>

        <div v-if="routesLoading" class="px-5 py-12 text-center text-faint">
          {{ t("status.loading") }}
        </div>
        <div v-else-if="!allRoutes.length" class="px-5 py-12 text-center text-muted">
          <p class="mb-3">{{ t("routes.emptyGroup") }}</p>
          <button class="btn btn-accent btn-sm" @click="router.replace('/admin/groups')">
            {{ t("routes.createFirst") }}
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr
                class="border-b border-border text-[10px] font-bold uppercase tracking-[1.2px] text-faint"
              >
                <th class="px-5 py-2.5">Route</th>
                <th class="px-3 py-2.5">Group</th>
                <th class="px-3 py-2.5">Events</th>
                <th class="px-3 py-2.5">Targets</th>
                <th class="px-5 py-2.5 text-right">State</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in allRoutes.slice(0, 8)"
                :key="r.id"
                class="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2"
                @click="router.replace('/admin/groups')"
              >
                <td class="px-5 py-3">
                  <div class="font-semibold text-text">{{ r.name || r.id }}</div>
                  <div class="font-mono text-[11px] text-faint">{{ r.id }}</div>
                </td>
                <td class="px-3 py-3 text-muted">{{ r.group?.name || "—" }}</td>
                <td class="px-3 py-3">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="ev in routeEvents(r).slice(0, 2)"
                      :key="ev"
                      class="rounded-full bg-accent-dim px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent"
                    >
                      {{ ev }}
                    </span>
                    <span v-if="routeEvents(r).length > 2" class="text-[10px] text-faint">
                      +{{ routeEvents(r).length - 2 }}
                    </span>
                  </div>
                </td>
                <td class="px-3 py-3">
                  <div class="flex items-center gap-1">
                    <span
                      v-for="tg in r.targets.slice(0, 3)"
                      :key="tg.channelId ?? tg.chatId ?? platformLabel(tg.platform)"
                      class="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {{ platformLabel(tg.platform) }}
                    </span>
                    <span v-if="r.targets.length > 3" class="text-[10px] text-faint">
                      +{{ r.targets.length - 3 }}
                    </span>
                  </div>
                </td>
                <td class="px-5 py-3 text-right">
                  <span class="dot" :class="r.enabled ? 'ok' : 'bad'" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Recent send logs -->
      <section class="rounded border border-border bg-surface">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 class="text-sm font-bold tracking-tight">{{ t("overview.recent") }}</h2>
          <button class="text-xs font-semibold text-accent" @click="router.replace('/admin/logs')">
            {{ t("overview.viewAll") }}
          </button>
        </div>

        <div v-if="logsLoading" class="px-5 py-12 text-center text-faint">
          {{ t("status.loading") }}
        </div>
        <div v-else-if="!logs.length" class="px-5 py-12 text-center text-faint">
          {{ t("metrics.empty") }}
        </div>

        <ul v-else class="divide-y divide-border">
          <li
            v-for="log in logs.slice(0, 10)"
            :key="log.id ?? `${log.ts}-${log.target}`"
            class="flex items-center gap-3 px-5 py-3"
          >
            <span class="dot" :class="log.ok ? 'ok' : 'bad'" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  :class="eventBadge(log.event)"
                >
                  {{ log.event }}
                </span>
                <span class="truncate text-[12px] text-muted">{{ log.repo || log.target }}</span>
              </div>
              <div class="mt-0.5 truncate font-mono text-[11px] text-faint">{{ log.target }}</div>
            </div>
            <span class="text-[11px] font-medium text-faint [font-variant-numeric:tabular-nums]">
              {{ fmtTime(log.ts) }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
