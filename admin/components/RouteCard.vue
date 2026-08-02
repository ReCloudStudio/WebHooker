<template>
  <article class="card" :class="{ disabled: !route.enabled }">
    <div class="card-head">
      <div class="card-title">
        <label class="switch">
          <input type="checkbox" :checked="route.enabled" @change="onToggle" />
          <span class="track"></span>
        </label>
        <span class="route-name">{{ route.name || t("route.untitled") }}</span>
        <span class="route-id">{{ route.id }}</span>
        <span v-if="route.lang" class="badge lang">{{ route.lang }}</span>
        <span v-if="route.fallback" class="badge fallback">{{ t("route.fallback") }}</span>
      </div>
      <div class="card-actions">
        <button class="icon-btn" :title="t('routeEditor.editTitle')" @click="$emit('edit', route)">✎</button>
        <button class="icon-btn danger" :title="t('routeEditor.close')" @click="$emit('delete', route)">✕</button>
      </div>
    </div>
    <div class="chips">
      <span v-for="(f, i) in route.filters" :key="i" class="chip" :class="{ exclude: f.exclude }">
        <span class="f-type">{{ f.exclude ? t("routeEditor.not") + " " : "" }}{{ t("filter." + f.type) }}</span>
        <span class="f-val">{{ fmtMatch(f.match) }}</span>
      </span>
      <span v-if="!route.filters.length" class="chip"><span class="f-type">{{ t("route.noFilters") }}</span></span>
    </div>
    <div class="target">
      <span><b>{{ t("route.channel") }}</b><code>{{ route.target.channelId }}</code></span>
      <span v-if="route.target.threadId"><b>{{ t("route.thread") }}</b><code>{{ route.target.threadId }}</code></span>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Route } from "~/types";
import { fmtMatch } from "~/types";

const { t } = useI18n();

const props = defineProps<{ route: Route }>();
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
