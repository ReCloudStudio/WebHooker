<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="close"></div>
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="editor" role="dialog" aria-modal="true">
        <div class="editor-head">
          <h2>{{ isEdit ? "Edit route" : "New route" }}</h2>
          <button class="icon-btn" title="Close" @click="close">✕</button>
        </div>
        <form class="editor-body" @submit.prevent="save">
          <div class="field">
            <label>Name</label>
            <input v-model="form.name" type="text" placeholder="My Route" required />
          </div>
          <div class="row2">
            <div class="field">
              <label>ID</label>
              <input v-model="form.id" type="text" placeholder="my-route" required />
              <div class="hint">Unique, use a-z / 0-9 / dashes</div>
            </div>
            <div class="field">
              <label>Language</label>
              <input v-model="form.lang" type="text" placeholder="en" />
              <div class="hint">en or zh; custom via KV i18n:&lt;lang&gt;</div>
            </div>
          </div>
          <div class="field inline">
            <input v-model="form.enabled" type="checkbox" />
            <span>Route enabled</span>
          </div>
          <div class="field">
            <label>Filters <span class="lbl-note">(all must match · AND)</span></label>
            <div v-for="(f, i) in form.filters" :key="i" class="filter-row">
              <select v-model="f.type">
                <option v-for="t in FILTER_TYPES" :key="t" :value="t">{{ FILTER_LABELS[t] }}</option>
              </select>
              <input v-model="f.matchText" type="text" placeholder="match value" />
              <label class="inline" title="Invert this filter">
                <input v-model="f.exclude" type="checkbox" /><span>NOT</span>
              </label>
              <button type="button" class="icon-btn danger" title="Remove filter" @click="form.filters.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="btn btn-ghost add-filter" @click="addFilter">+ Add filter</button>
            <div class="err">{{ filterError }}</div>
          </div>
          <div class="row2">
            <div class="field">
              <label>Channel ID</label>
              <input v-model="form.channelId" type="text" placeholder="Discord channel ID" required />
            </div>
            <div class="field">
              <label>Thread ID <span class="lbl-note">(optional)</span></label>
              <input v-model="form.threadId" type="text" placeholder="Optional thread ID" />
            </div>
          </div>
          <div class="err">{{ formError }}</div>
        </form>
        <div class="editor-foot">
          <button class="btn btn-ghost" type="button" @click="close">Cancel</button>
          <button class="btn btn-accent" type="button" :disabled="saving" @click="save">Save route</button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Filter, Route } from "~/types";
import { FILTER_TYPES, FILTER_LABELS, fmtMatch } from "~/types";

interface FilterForm extends Filter {
  matchText: string;
}

const props = defineProps<{ open: boolean; route: Route | null; saving: boolean }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", route: Route): void;
}>();

const isEdit = computed(() => props.route != null);
const filterError = ref("");
const formError = ref("");

const form = reactive({
  id: "",
  name: "",
  lang: "",
  enabled: true,
  channelId: "",
  threadId: "",
  filters: [] as FilterForm[],
});

function parseMatch(text: string): string | string[] | null {
  const parts = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : parts;
}

function blankFilter(): FilterForm {
  return { type: "event", match: "", exclude: false, matchText: "" };
}

function addFilter(): void {
  form.filters.push(blankFilter());
  filterError.value = "";
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const r = props.route;
    form.id = r?.id ?? "";
    form.name = r?.name ?? "";
    form.lang = r?.lang ?? "";
    form.enabled = r?.enabled ?? true;
    form.channelId = r?.target.channelId ?? "";
    form.threadId = r?.target.threadId ?? "";
    form.filters = (r && r.filters.length
      ? r.filters
      : [{ type: "event", match: "", exclude: false }]
    ).map((f) => ({ ...f, matchText: fmtMatch(f.match) })) as FilterForm[];
    filterError.value = "";
    formError.value = "";
  },
);

function close(): void {
  emit("close");
}

function collect(): Route | null {
  const filters: Filter[] = [];
  for (let i = 0; i < form.filters.length; i++) {
    const f = form.filters[i]!;
    const match = parseMatch(f.matchText);
    if (!match) {
      filterError.value = `Filter ${i + 1} needs a match value`;
      return null;
    }
    filters.push({ type: f.type, match, exclude: f.exclude });
  }
  filterError.value = "";
  if (!filters.length) {
    filterError.value = "Add at least one filter";
    return null;
  }
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    enabled: form.enabled,
    lang: form.lang.trim() || undefined,
    filters,
    target: {
      channelId: form.channelId.trim(),
      threadId: form.threadId.trim() || undefined,
    },
  };
}

function save(): void {
  formError.value = "";
  const route = collect();
  if (!route) return;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(route.id)) {
    formError.value = "ID must be a-z / 0-9 / dashes";
    return;
  }
  if (!route.name) {
    formError.value = "Name is required";
    return;
  }
  if (!route.target.channelId) {
    formError.value = "Channel ID is required";
    return;
  }
  emit("save", route);
}
</script>
