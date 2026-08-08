<template>
  <div>
    <div class="log-toolbar">
      <span class="kpi-label">{{ t("logs.lastSends", { n: logs.length }) }}</span>
      <div class="log-filters">
        <label class="filter-label">{{ t("logs.filterGroup") }}</label>
        <select
          class="filter-select"
          :value="selectedGroupId"
          :disabled="loading"
          @change="onGroupFilter"
        >
          <option value="">{{ t("logs.allGroups") }}</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">
            {{ g.name || g.id }}
          </option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="refresh">
        {{ t("logs.refresh") }}
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!loading && !logs.length" class="empty-log">{{ t("logs.empty") }}</p>

    <div class="log-list">
      <article
        v-for="l in logs"
        :key="l.id ?? l.ts + l.routeId"
        class="log-entry"
        :class="{ fail: !l.ok, clickable: true }"
        @click="openDetail(l)"
      >
        <div class="log-head">
          <span class="dot" :class="l.ok ? 'ok' : 'bad'"></span>
          <span class="log-route">{{ l.routeId }}</span>
          <span class="log-event">{{ l.event }}</span>
          <span v-if="l.status" class="log-status" :class="l.ok ? 'ok' : 'bad'">{{
            l.status
          }}</span>
          <span class="log-time">{{ fmtTime(l.ts) }}</span>
        </div>
        <div class="log-meta">
          <span v-if="l.repo"
            ><b>{{ t("logs.repo") }}</b
            ><code>{{ l.repo }}</code></span
          >
          <span
            ><b>{{ t("logs.target") }}</b
            ><code>{{ l.target }}</code></span
          >
        </div>
        <div v-if="!l.ok && l.error" class="log-error">{{ l.error }}</div>
      </article>
    </div>

    <div v-if="detailOpen" class="modal-overlay" @click.self="closeDetail">
      <div class="log-detail">
        <div class="detail-head">
          <h3>{{ t("logs.detailTitle") }}</h3>
          <button class="icon-btn" @click="closeDetail">✕</button>
        </div>

        <p v-if="detailLoading" class="empty-log">{{ t("status.loading") }}</p>
        <p v-else-if="detailError" class="err">{{ detailError }}</p>

        <dl v-else-if="detail" class="detail-grid">
          <template v-for="row in detailRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>
              <code v-if="row.code">{{ row.value }}</code>
              <span v-else>{{ row.value }}</span>
            </dd>
          </template>
        </dl>

        <p v-else class="err">{{ t("logs.detailMissing") }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Group, SendRecord } from "~/types";

const { t } = useI18n();
const { loadById } = useSendLogs();

const props = defineProps<{
  logs: SendRecord[];
  loading: boolean;
  groups: Group[];
  selectedGroupId: string;
}>();
const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "filter"): void;
  (e: "update:selectedGroupId", value: string): void;
}>();

const detailOpen = ref(false);
const detail = ref<SendRecord | null>(null);
const detailLoading = ref(false);
const detailError = ref("");

const detailRows = computed(() => {
  const l = detail.value;
  if (!l) return [] as Array<{ label: string; value: string; code?: boolean }>;
  const rows: Array<{ label: string; value: string; code?: boolean }> = [
    { label: t("logs.id"), value: String(l.id ?? "-"), code: true },
    { label: t("logs.time"), value: fmtTime(l.ts) },
    { label: t("logs.route"), value: l.routeId, code: true },
    { label: t("logs.event"), value: l.event, code: true },
    { label: t("logs.action"), value: l.action || "-", code: true },
    { label: t("logs.actor"), value: l.actor || "-", code: true },
    { label: t("logs.deliveryId"), value: l.deliveryId || "-", code: true },
    { label: t("logs.repo"), value: l.repo || "-", code: true },
    { label: t("logs.target"), value: l.target, code: true },
    { label: t("logs.platform"), value: l.platform || "-", code: true },
    { label: t("logs.status"), value: l.status != null ? String(l.status) : "-", code: true },
    { label: t("logs.messageId"), value: l.messageId || "-", code: true },
    { label: t("logs.errorCode"), value: l.errorCode || "-", code: true },
    { label: t("logs.duration"), value: l.durationMs != null ? `${l.durationMs} ms` : "-" },
    { label: t("logs.attempts"), value: l.attempts != null ? String(l.attempts) : "-" },
    { label: t("logs.ok"), value: l.ok ? t("logs.yes") : t("logs.no") },
    { label: t("logs.error"), value: l.error || "-" },
  ];
  if (l.detail && Object.keys(l.detail).length > 0) {
    rows.push({
      label: t("logs.detail"),
      value: JSON.stringify(l.detail, null, 2),
      code: true,
    });
  }
  return rows;
});

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function refresh(): void {
  emit("refresh");
}

function onGroupFilter(e: Event): void {
  emit("update:selectedGroupId", (e.target as HTMLSelectElement).value);
  emit("filter");
}

async function openDetail(l: SendRecord): Promise<void> {
  if (l.id == null) return;
  detailOpen.value = true;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  try {
    detail.value = await loadById(l.id);
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : String(err);
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail(): void {
  detailOpen.value = false;
  detail.value = null;
}
</script>
