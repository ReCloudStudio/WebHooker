<template>
  <article class="card" :class="{ disabled: !route.enabled }">
    <div class="card-head">
      <div class="card-title">
        <label class="switch" @click.prevent>
          <input type="checkbox" :checked="route.enabled" @change="onToggle" />
          <span class="track"></span>
        </label>
        <span class="route-name">{{ route.name || "(untitled)" }}</span>
        <span class="route-id">{{ route.id }}</span>
        <span v-if="route.lang" class="badge lang">{{ route.lang }}</span>
        <span v-if="groupName" class="badge group">{{ groupName }}</span>
      </div>
      <div class="card-actions">
        <button class="icon-btn" title="Edit" @click="$emit('edit', route)">✎</button>
        <button class="icon-btn danger" title="Delete" @click="$emit('delete', route)">✕</button>
      </div>
    </div>
    <div class="chips">
      <span v-for="(f, i) in route.filters" :key="i" class="chip" :class="{ exclude: f.exclude }">
        <span class="f-type">{{ f.exclude ? "NOT " : "" }}{{ FILTER_LABELS[f.type] || f.type }}</span>
        <span class="f-val">{{ fmtMatch(f.match) }}</span>
      </span>
      <span v-if="!route.filters.length" class="chip"><span class="f-type">no filters</span></span>
    </div>
    <div class="target">
      <span><b>CHANNEL</b><code>{{ route.target.channelId }}</code></span>
      <span v-if="route.target.threadId"><b>THREAD</b><code>{{ route.target.threadId }}</code></span>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Route } from "~/types";
import { FILTER_LABELS, fmtMatch } from "~/types";

const props = defineProps<{ route: Route; groupName?: string }>();
const emit = defineEmits<{
  (e: "toggle", route: Route): void;
  (e: "edit", route: Route): void;
  (e: "delete", route: Route): void;
}>();

function onToggle(event: Event): void {
  const next = { ...props.route, enabled: (event.target as HTMLInputElement).checked };
  emit("toggle", next);
}
</script>
