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
          <div v-if="!isEdit" class="field">
            <label
              >{{ t("routeEditor.templates") }}
              <span class="lbl-note">{{ t("routeEditor.templatesNote") }}</span></label
            >
            <div class="templates">
              <button
                v-for="tmpl in ROUTE_TEMPLATES"
                :key="tmpl.id"
                type="button"
                class="template-chip"
                :class="{ active: form.id === tmpl.id }"
                @click="applyTemplate(tmpl)"
              >
                {{ t(tmpl.nameKey) }}
              </button>
            </div>
          </div>
          <div class="field">
            <label>{{ t("routeEditor.name") }}</label>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('routeEditor.namePlaceholder')"
              required
            />
          </div>
          <div class="row2">
            <div class="field">
              <label>{{ t("routeEditor.id") }}</label>
              <input v-model="form.id" type="text" placeholder="my-route" required />
              <div class="hint">{{ t("routeEditor.idHint") }}</div>
            </div>
            <div class="field">
              <label>{{ t("routeEditor.language") }}</label>
              <input
                v-model="form.lang"
                type="text"
                :placeholder="t('routeEditor.langPlaceholder')"
              />
              <div class="hint">{{ t("routeEditor.langHint") }}</div>
            </div>
          </div>
          <div class="field inline">
            <input v-model="form.enabled" type="checkbox" />
            <span>{{ t("routeEditor.enabled") }}</span>
          </div>
          <div class="field inline">
            <input v-model="form.fallback" type="checkbox" />
            <span
              >{{ t("routeEditor.fallback") }}
              <span class="lbl-note">{{ t("routeEditor.fallbackHint") }}</span></span
            >
          </div>
          <div class="field inline">
            <input v-model="form.stop" type="checkbox" />
            <span
              >{{ t("routeEditor.stop") }}
              <span class="lbl-note">{{ t("routeEditor.stopHint") }}</span></span
            >
          </div>
          <div class="field">
            <label
              >{{ t("routeEditor.filters") }}
              <span class="lbl-note">{{ t("routeEditor.filtersNote") }}</span></label
            >
            <div v-for="(f, i) in form.filters" :key="i" class="filter-row">
              <select v-model="f.type">
                <option v-for="ft in FILTER_TYPES" :key="ft" :value="ft">
                  {{ t("filter." + ft) }}
                </option>
              </select>
              <input
                v-model="f.matchText"
                type="text"
                :placeholder="t('routeEditor.matchPlaceholder')"
              />
              <label class="inline">
                <input v-model="f.exclude" type="checkbox" /><span>{{ t("routeEditor.not") }}</span>
              </label>
              <button type="button" class="icon-btn danger" @click="form.filters.splice(i, 1)">
                ✕
              </button>
            </div>
            <button type="button" class="btn btn-ghost add-filter" @click="addFilter">
              {{ t("routeEditor.addFilter") }}
            </button>
            <div class="err">{{ filterError }}</div>
          </div>
          <div class="field">
            <label
              >{{ t("routeEditor.targets") }}
              <span class="lbl-note">{{ t("routeEditor.targetsNote") }}</span></label
            >
            <div v-for="(tg, i) in form.targets" :key="i" class="target-row">
              <select v-model="tg.platform">
                <option value="discord">Discord</option>
                <option value="telegram">Telegram</option>
              </select>
              <template v-if="tg.platform === 'discord'">
                <input
                  v-model="tg.channelId"
                  type="text"
                  class="tg-in1"
                  :placeholder="t('routeEditor.channelPlaceholder')"
                />
                <input
                  v-model="tg.threadId"
                  type="text"
                  class="tg-in2"
                  :placeholder="t('routeEditor.threadPlaceholder')"
                />
              </template>
              <template v-else>
                <input
                  v-model="tg.chatId"
                  type="text"
                  class="tg-in1"
                  :placeholder="t('routeEditor.chatPlaceholder')"
                />
                <input
                  v-model="tg.topicId"
                  type="text"
                  class="tg-in2"
                  :placeholder="t('routeEditor.topicPlaceholder')"
                />
              </template>
              <button type="button" class="icon-btn danger" @click="form.targets.splice(i, 1)">
                ✕
              </button>
            </div>
            <button type="button" class="btn btn-ghost add-filter" @click="addTarget">
              {{ t("routeEditor.addTarget") }}
            </button>
            <div class="err">{{ targetError }}</div>
          </div>
          <div class="err">{{ formError }}</div>
        </form>
        <div class="editor-foot">
          <button class="btn btn-ghost" type="button" @click="close">
            {{ t("routeEditor.cancel") }}
          </button>
          <button class="btn btn-accent" type="button" :disabled="saving" @click="save">
            {{ t("routeEditor.save") }}
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Filter, Route, RouteTarget } from "~/types";
import { FILTER_TYPES, ROUTE_TEMPLATES, fmtMatch } from "~/types";

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
const targetError = ref("");
const formError = ref("");

interface TargetForm extends RouteTarget {
  platform: "discord" | "telegram";
}

function blankTarget(): TargetForm {
  return {
    platform: "discord",
    channelId: "",
    threadId: "",
    chatId: "",
    topicId: "",
  };
}

const form = reactive({
  id: "",
  name: "",
  lang: "",
  enabled: true,
  fallback: false,
  stop: false,
  targets: [] as TargetForm[],
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

function applyTemplate(tmpl: (typeof ROUTE_TEMPLATES)[number]): void {
  form.id = tmpl.id;
  form.name = t(tmpl.nameKey);
  form.filters = tmpl.filters.map((f) => ({
    ...f,
    matchText: fmtMatch(f.match),
  })) as FilterForm[];
  form.targets = [blankTarget()];
  filterError.value = "";
  targetError.value = "";
  formError.value = "";
}

function addTarget(): void {
  form.targets.push(blankTarget());
  targetError.value = "";
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
    form.fallback = r?.fallback ?? false;
    form.stop = r?.stop ?? false;
    form.targets =
      r && r.targets.length
        ? r.targets.map((tg) => ({ ...blankTarget(), ...tg }))
        : [blankTarget()];
    form.filters = (
      r && r.filters.length
        ? r.filters
        : form.fallback
          ? []
          : [{ type: "event", match: "", exclude: false }]
    ).map((f) => ({ ...f, matchText: fmtMatch(f.match) })) as FilterForm[];
    filterError.value = "";
    targetError.value = "";
    formError.value = "";
  },
);

watch(
  () => form.fallback,
  (v) => {
    if (v && form.filters.every((f) => f.matchText.trim() === "")) {
      form.filters = [];
      filterError.value = "";
    }
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
  if (!form.fallback && !filters.length) {
    filterError.value = t("routeEditor.errAddFilter");
    return null;
  }

  const targets: RouteTarget[] = [];
  for (let i = 0; i < form.targets.length; i++) {
    const tg = form.targets[i]!;
    targets.push({
      platform: tg.platform,
      channelId: tg.channelId.trim() || undefined,
      threadId: tg.threadId.trim() || undefined,
      chatId: tg.chatId.trim() || undefined,
      topicId: tg.topicId.trim() || undefined,
    });
  }
  targetError.value = "";

  return {
    id: form.id.trim(),
    name: form.name.trim(),
    enabled: form.enabled,
    fallback: form.fallback || undefined,
    stop: form.stop || undefined,
    lang: form.lang.trim() || undefined,
    filters,
    targets,
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
  if (!route.targets.length) {
    targetError.value = t("routeEditor.errTargets");
    return;
  }
  for (let i = 0; i < route.targets.length; i++) {
    const tg = route.targets[i]!;
    if (tg.platform === "telegram") {
      if (!tg.chatId) {
        targetError.value = t("routeEditor.errChat", { n: i + 1 });
        return;
      }
    } else if (!tg.channelId) {
      targetError.value = t("routeEditor.errChannel", { n: i + 1 });
      return;
    }
  }
  emit("save", route);
}
</script>
