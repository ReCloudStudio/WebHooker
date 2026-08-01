<template>
  <div>
    <div class="log-toolbar">
      <span class="kpi-label">LAST {{ logs.length }} SENDS</span>
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="refresh">⟳ Refresh</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!loading && !logs.length" class="empty-log">No send records yet — trigger a webhook to see results.</p>

    <div class="log-list">
      <article v-for="l in logs" :key="l.ts + l.routeId" class="log-entry" :class="{ fail: !l.ok }">
        <div class="log-head">
          <span class="dot" :class="l.ok ? 'ok' : 'bad'"></span>
          <span class="log-route">{{ l.routeId }}</span>
          <span class="log-event">{{ l.event }}</span>
          <span class="log-time">{{ fmtTime(l.ts) }}</span>
        </div>
        <div class="log-meta">
          <span v-if="l.repo"><b>REPO</b><code>{{ l.repo }}</code></span>
          <span><b>TARGET</b><code>{{ l.target }}</code></span>
        </div>
        <div v-if="!l.ok && l.error" class="log-error">{{ l.error }}</div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SendRecord } from "~/types";

const props = defineProps<{ logs: SendRecord[]; loading: boolean }>();
const emit = defineEmits<{ (e: "refresh"): void }>();

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function refresh(): void {
  emit("refresh");
}
</script>
