<template>
  <div>
    <div class="log-toolbar">
      <span class="kpi-label">{{ t("audit.title") }}</span>
      <div class="log-filters">
        <label class="filter-label">{{ t("audit.filterGroup") }}</label>
        <select
          class="filter-select"
          :value="selectedGroupId"
          :disabled="loading"
          @change="onGroupFilter"
        >
          <option value="">{{ t("audit.allGroups") }}</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">
            {{ g.name || g.id }}
          </option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="refresh">
        {{ t("audit.refresh") }}
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!loading && !entries.length" class="empty-log">{{ t("audit.empty") }}</p>

    <div class="log-list">
      <article v-for="e in entries" :key="e.id ?? e.ts" class="log-entry">
        <div class="log-head">
          <span class="dot ok"></span>
          <span class="log-route">{{ e.action }}</span>
          <span class="log-event">{{ e.actorLogin || e.actorId || "-" }}</span>
          <span class="log-status ok">{{ e.targetType || "-" }}</span>
          <span class="log-time">{{ fmtTime(e.ts) }}</span>
        </div>
        <div class="log-meta">
          <span
            ><b>{{ t("audit.target") }}</b
            ><code>{{ e.targetId || "-" }}</code></span
          >
          <span
            ><b>{{ t("audit.group") }}</b
            ><code>{{ e.groupId || "-" }}</code></span
          >
          <span v-if="e.detail && Object.keys(e.detail).length > 0"
            ><b>{{ t("audit.detail") }}</b
            ><code>{{ JSON.stringify(e.detail) }}</code></span
          >
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuditEntry, Group } from "~/types";

const { t } = useI18n();

defineProps<{
  entries: AuditEntry[];
  loading: boolean;
  error: string;
  groups: Group[];
  selectedGroupId: string;
}>();
const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "filter"): void;
  (e: "update:selectedGroupId", value: string): void;
}>();

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
</script>
