<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="close"></div>
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="editor" role="dialog" aria-modal="true">
        <div class="editor-head">
          <h2>{{ isEdit ? t("routeEditor.editTitle") : t("routeEditor.newTitle") }}</h2>
          <button class="icon-btn" :title="t('routeEditor.close')" @click="close">✕</button>
        </div>
        <form class="editor-body" @submit.prevent="save">
          <div class="field">
            <label>{{ t("routeEditor.name") }}</label>
            <input v-model="form.name" type="text" :placeholder="t('routeEditor.namePlaceholder')" required />
          </div>
          <div class="row2">
            <div class="field">
              <label>{{ t("routeEditor.id") }}</label>
              <input v-model="form.id" type="text" placeholder="my-route" required />
              <div class="hint">{{ t("routeEditor.idHint") }}</div>
            </div>
            <div class="field">
              <label>{{ t("routeEditor.language") }}</label>
              <input v-model="form.lang" type="text" :placeholder="t('routeEditor.langPlaceholder')" />
              <div class="hint">{{ t("routeEditor.langHint") }}</div>
            </div>
          </div>
          <div class="field inline">
            <input v-model="form.enabled" type="checkbox" />
            <span>{{ t("routeEditor.enabled") }}</span>
          </div>
          <div class="field">
            <label>{{ t("routeEditor.filters") }} <span class="lbl-note">{{ t("routeEditor.filtersNote") }}</span></label>
            <div v-for="(f, i) in form.filters" :key="i" class="filter-row">
              <select v-model="f.type">
                <option v-for="ft in FILTER_TYPES" :key="ft" :value="ft">{{ t("filter." + ft) }}</option>
              </select>
              <input v-model="f.matchText" type="text" :placeholder="t('routeEditor.matchPlaceholder')" />
              <label class="inline">
                <input v-model="f.exclude" type="checkbox" /><span>{{ t("routeEditor.not") }}</span>
              </label>
              <button type="button" class="icon-btn danger" @click="form.filters.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="btn btn-ghost add-filter" @click="addFilter">{{ t("routeEditor.addFilter") }}</button>
            <div class="err">{{ filterError }}</div>
          </div>
          <div class="row2">
            <div class="field">
              <label>{{ t("routeEditor.channel") }}</label>
              <input v-model="form.channelId" type="text" :placeholder="t('routeEditor.channelPlaceholder')" required />
            </div>
            <div class="field">
              <label>{{ t("routeEditor.thread") }} <span class="lbl-note">{{ t("routeEditor.threadNote") }}</span></label>
              <input v-model="form.threadId" type="text" :placeholder="t('routeEditor.threadPlaceholder')" />
            </div>
          </div>
          <div class="err">{{ formError }}</div>
        </form>
        <div class="editor-foot">
          <button class="btn btn-ghost" type="button" @click="close">{{ t("routeEditor.cancel") }}</button>
          <button class="btn btn-accent" type="button" :disabled="saving" @click="save">{{ t("routeEditor.save") }}</button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Filter, Route } from "~/types";
import { FILTER_TYPES, fmtMatch } from "~/types";

interface FilterForm extends Filter {
  matchText: string;
}

const props = defineProps<{ open: boolean; route: Route | null; saving: boolean }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", route: Route): void;
}>();

const { t } = useI18n();
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
      filterError.value = t("routeEditor.errFilterMatch", { n: i + 1 });
      return null;
    }
    filters.push({ type: f.type, match, exclude: f.exclude });
  }
  filterError.value = "";
  if (!filters.length) {
    filterError.value = t("routeEditor.errAddFilter");
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
    formError.value = t("routeEditor.errIdFormat");
    return;
  }
  if (!route.name) {
    formError.value = t("routeEditor.errName");
    return;
  }
  if (!route.target.channelId) {
    formError.value = t("routeEditor.errChannel");
    return;
  }
  emit("save", route);
}
</script>
