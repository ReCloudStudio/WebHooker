<template>
  <div>
    <div class="log-toolbar">
      <span class="kpi-label">{{ t("logs.lastSends", { n: logs.length }) }}</span>
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="refresh">
        {{ t("logs.refresh") }}
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!loading && !logs.length" class="empty-log">{{ t("logs.empty") }}</p>

    <div class="log-list">
      <article v-for="l in logs" :key="l.ts + l.routeId" class="log-entry" :class="{ fail: !l.ok }">
        <div class="log-head">
          <span class="dot" :class="l.ok ? 'ok' : 'bad'"></span>
          <span class="log-route">{{ l.routeId }}</span>
          <span class="log-event">{{ l.event }}</span>
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
  </div>
</template>

<script setup lang="ts">
import type { SendRecord } from "~/types";

const { t } = useI18n();

const props = defineProps<{ logs: SendRecord[]; loading: boolean }>();
const emit = defineEmits<{ (e: "refresh"): void }>();

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function refresh(): void {
  emit("refresh");
}
</script>
