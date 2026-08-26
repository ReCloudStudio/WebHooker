<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { Filter, FilterNode, NamedFragment, Route, RouteTarget, RouteTemplate } from "~/types";
import { FRAGMENT_PRESETS, ROUTE_TEMPLATES } from "~/types";
import type { NodeForm } from "~/composables/useFilterNode";
import {
  blankLeafForm,
  blankNode,
  nodeToForm,
  nodeFormToRouteFilters,
  formToNode,
} from "~/composables/useFilterNode";

interface TargetForm {
  platform: "discord" | "telegram" | "feishu";
  channelId: string;
  threadId: string;
  chatId: string;
  topicId: string;
}

const props = withDefaults(
  defineProps<{ open: boolean; route: Route | null; saving: boolean; groupId?: string | null }>(),
  { groupId: null },
);

const emit = defineEmits<{ (e: "close"): void; (e: "save", route: Route): void }>();

const { t } = useI18n();

const isEdit = computed(() => props.route != null);
const filterError = ref("");
const targetError = ref("");
const formError = ref("");

const blankTarget = (): TargetForm => ({
  platform: "discord",
  channelId: "",
  threadId: "",
  chatId: "",
  topicId: "",
});

const form = reactive({
  id: "",
  name: "",
  enabled: true,
  fallback: false,
  stop: false,
  discordRolesText: "",
  targets: [] as TargetForm[],
});

const root = ref<NodeForm>(blankNode("all"));

const { fragments, load: loadFragments, save: saveFragments } = useFragmentsApi();
const fragmentName = ref("");
const fragmentError = ref("");

const testPayload = ref("");
const testEvent = ref("");
const testResult = ref<{ matched: boolean; explanation: string } | null>(null);
const testError = ref("");
const testing = ref(false);

function applyTemplate(tmpl: RouteTemplate): void {
  form.id = tmpl.id;
  form.name = t(tmpl.nameKey);
  form.targets = [blankTarget()];
  root.value = tmpl.filters.length ? nodeToForm({ all: tmpl.filters }) : blankNode("all");
}

function addTarget(): void {
  form.targets.push(blankTarget());
}

function validateNode(nf: NodeForm): string | null {
  if (nf.kind === "leaf") {
    if (nf.leaf.type === "field" && !nf.leaf.path.trim()) return t("routeEditor.errPath");
    if (nf.leaf.op !== "exists" && nf.leaf.values.every((v) => !v.trim()))
      return t("routeEditor.errValues");
    return null;
  }
  if (nf.kind === "all" || nf.kind === "any") {
    if (nf.children.length === 0) return t("routeEditor.errGroupEmpty");
    for (const c of nf.children) {
      const err = validateNode(c);
      if (err) return err;
    }
    return null;
  }
  if (nf.child) return validateNode(nf.child);
  return t("routeEditor.errGroupEmpty");
}

function collect(): Route | null {
  filterError.value = "";
  targetError.value = "";
  formError.value = "";

  let filters: Filter[] = [];
  let ast: FilterNode | undefined;
  if (!form.fallback) {
    const err = validateNode(root.value);
    if (err) {
      filterError.value = err;
      return null;
    }
    const res = nodeFormToRouteFilters(root.value);
    filters = res.filters;
    ast = res.ast;
  } else {
    const res = nodeFormToRouteFilters(root.value);
    const has = res.filters.length > 0 || res.ast !== undefined;
    if (has) {
      const err = validateNode(root.value);
      if (err) {
        filterError.value = err;
        return null;
      }
      filters = res.filters;
      ast = res.ast;
    }
  }

  const targets: RouteTarget[] = [];
  for (const tg of form.targets) {
    if (tg.platform === "telegram") {
      const chatId = tg.chatId.trim();
      if (!chatId) continue;
      targets.push({ platform: "telegram", chatId, topicId: tg.topicId.trim() || undefined });
    } else if (tg.platform === "feishu") {
      const chatId = tg.chatId.trim();
      if (!chatId) continue;
      targets.push({ platform: "feishu", chatId });
    } else {
      const channelId = tg.channelId.trim();
      if (!channelId) continue;
      targets.push({ platform: "discord", channelId, threadId: tg.threadId.trim() || undefined });
    }
  }

  const discordRoles = form.discordRolesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: form.id.trim(),
    name: form.name.trim(),
    enabled: form.enabled,
    fallback: form.fallback || undefined,
    stop: form.stop || undefined,
    discordRoleIds: discordRoles.length ? discordRoles : undefined,
    filters,
    ...(ast ? { ast } : {}),
    targets,
  };
}

function save(): void {
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
  form.targets.forEach((tg, i) => {
    if ((tg.platform === "telegram" || tg.platform === "feishu") && !tg.chatId.trim()) {
      targetError.value = t("routeEditor.errChat", { n: i + 1 });
    } else if (tg.platform === "discord" && !tg.channelId.trim()) {
      targetError.value = t("routeEditor.errChannel", { n: i + 1 });
    }
  });
  if (targetError.value) return;
  emit("save", route);
}

function close(): void {
  emit("close");
}

async function runTest(): Promise<void> {
  testError.value = "";
  testResult.value = null;
  let payload: unknown;
  try {
    payload = JSON.parse(testPayload.value);
  } catch {
    testError.value = t("routeEditor.testInvalidJson");
    return;
  }
  const node = formToNode(root.value);
  if (!node) {
    testError.value = t("routeEditor.errAddFilter");
    return;
  }
  testing.value = true;
  try {
    testResult.value = await apiFetch<{ matched: boolean; explanation: string }>(
      "/admin/api/test-match",
      {
        method: "POST",
        body: JSON.stringify({ node, event: testEvent.value.trim() || undefined, payload }),
      },
    );
  } catch (err) {
    testError.value = err instanceof Error ? err.message : String(err);
  } finally {
    testing.value = false;
  }
}

function insertNode(node: FilterNode): void {
  const child = nodeToForm(node);
  if (root.value.kind === "all" || root.value.kind === "any") {
    root.value.children.push(child);
  } else {
    root.value = {
      kind: "all",
      leaf: blankLeafForm(),
      children: [root.value, child],
      child: null,
    };
  }
}

function insertFragment(frag: NamedFragment): void {
  insertNode(frag.node);
}

async function saveAsFragment(): Promise<void> {
  fragmentError.value = "";
  const name = fragmentName.value.trim();
  if (!name) {
    fragmentError.value = t("routeEditor.fragmentsNameRequired");
    return;
  }
  if (!props.groupId) return;
  const node = formToNode(root.value);
  if (!node) {
    fragmentError.value = t("routeEditor.errAddFilter");
    return;
  }
  const id = `frag-${Math.random().toString(36).slice(2, 10)}`;
  const next: NamedFragment[] = [
    ...fragments.value.filter((f) => f.id !== id),
    { id, groupId: props.groupId, name, node },
  ];
  try {
    await saveFragments(props.groupId, next);
    fragmentName.value = "";
  } catch (err) {
    fragmentError.value = err instanceof Error ? err.message : String(err);
  }
}

function deleteFragment(frag: NamedFragment): void {
  if (!props.groupId) return;
  const next = fragments.value.filter((f) => f.id !== frag.id);
  saveFragments(props.groupId, next).catch((err) => {
    fragmentError.value = err instanceof Error ? err.message : String(err);
  });
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const r = props.route;
    form.id = r?.id ?? "";
    form.name = r?.name ?? "";
    form.enabled = r?.enabled ?? true;
    form.fallback = r?.fallback ?? false;
    form.stop = r?.stop ?? false;
    form.discordRolesText = r?.discordRoleIds?.length ? r.discordRoleIds.join(", ") : "";
    form.targets =
      r && r.targets.length
        ? r.targets.map((tg) => ({
            ...blankTarget(),
            ...tg,
            platform: tg.platform === "telegram" ? "telegram" : tg.platform === "feishu" ? "feishu" : "discord",
          }))
        : [blankTarget()];
    if (r?.ast) {
      root.value = nodeToForm(r.ast);
    } else if (r && r.filters.length) {
      root.value = nodeToForm({ all: r.filters });
    } else {
      root.value = blankNode("all");
    }
    filterError.value = "";
    targetError.value = "";
    formError.value = "";
    testPayload.value = "";
    testEvent.value = "";
    testResult.value = null;
    testError.value = "";
    fragmentName.value = "";
    fragmentError.value = "";
    if (props.groupId) loadFragments(props.groupId);
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="close" />
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="editor" role="dialog" aria-modal="true">
        <div class="editor-head">
          <div class="editor-heading">
            <span class="editor-eyebrow">{{ t("routeEditor.eyebrow") }}</span>
            <h2>{{ isEdit ? t("routeEditor.editTitle") : t("routeEditor.newTitle") }}</h2>
          </div>
          <button class="icon-btn" :title="t('routeEditor.close')" @click="close">✕</button>
        </div>

        <form class="editor-body" @submit.prevent="save">
          <section class="editor-section">
            <h3 class="editor-section-title">{{ t("routeEditor.sectionBasic") }}</h3>
            <div v-if="!isEdit" class="templates">
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
            <div class="field">
              <label>{{ t("routeEditor.name") }}</label>
              <input
                v-model="form.name"
                class="input"
                :placeholder="t('routeEditor.namePlaceholder')"
                required
              />
            </div>
            <div class="field">
              <label>{{ t("routeEditor.id") }}</label>
              <input v-model="form.id" class="input" placeholder="my-route" required />
              <div class="hint">{{ t("routeEditor.idHint") }}</div>
            </div>
          </section>

          <section class="editor-section">
            <h3 class="editor-section-title">{{ t("routeEditor.sectionOptions") }}</h3>
            <div class="field inline">
              <input v-model="form.enabled" type="checkbox" />
              <span>{{ t("routeEditor.enabled") }}</span>
            </div>
            <div class="field inline">
              <input v-model="form.fallback" type="checkbox" />
              <span>
                {{ t("routeEditor.fallback") }}
                <span class="lbl-note">{{ t("routeEditor.fallbackHint") }}</span>
              </span>
            </div>
            <div class="field inline">
              <input v-model="form.stop" type="checkbox" />
              <span>
                {{ t("routeEditor.stop") }}
                <span class="lbl-note">{{ t("routeEditor.stopHint") }}</span>
              </span>
            </div>
            <div class="field">
              <label>{{ t("routeEditor.discordRoles") }}</label>
              <input
                v-model="form.discordRolesText"
                class="input"
                :placeholder="t('routeEditor.discordRolesPlaceholder')"
              />
              <div class="hint">{{ t("routeEditor.discordRolesHint") }}</div>
            </div>
          </section>

          <section class="editor-section">
            <h3 class="editor-section-title">{{ t("routeEditor.sectionFilters") }}</h3>
            <div class="field">
              <label>{{ t("routeEditor.filters") }}</label>
            </div>
            <div class="field">
              <FilterNodeEditor :node="root" />
            </div>
            <div v-if="filterError" class="err">{{ filterError }}</div>
          </section>

          <section class="editor-section">
            <h3 class="editor-section-title">{{ t("routeEditor.testMatch") }}</h3>
            <div class="field">
              <input v-model="testEvent" class="input" :placeholder="t('routeEditor.testEvent')" />
            </div>
            <div class="field">
              <textarea
                v-model="testPayload"
                class="input test-payload"
                rows="6"
                :placeholder="t('routeEditor.testPayloadPlaceholder')"
              />
            </div>
            <div class="field">
              <button type="button" class="btn btn-ghost" :disabled="testing" @click="runTest">
                {{ testing ? "…" : t("routeEditor.testRun") }}
              </button>
            </div>
            <div v-if="testResult" class="test-result" :class="{ ok: testResult.matched }">
              <span class="test-badge">
                {{
                  testResult.matched
                    ? t("routeEditor.testMatched")
                    : t("routeEditor.testNotMatched")
                }}
              </span>
              <span class="test-explanation">{{ testResult.explanation }}</span>
            </div>
            <div v-if="testError" class="err">{{ testError }}</div>
          </section>

          <section v-if="groupId" class="editor-section">
            <h3 class="editor-section-title">{{ t("routeEditor.fragments") }}</h3>
            <div class="fragments-presets">
              <span class="hint">{{ t("routeEditor.fragmentsPresets") }}</span>
              <div v-for="preset in FRAGMENT_PRESETS" :key="preset.id" class="fragment-row">
                <span class="fragment-name">{{ t(preset.nameKey) }}</span>
                <button
                  type="button"
                  class="btn btn-ghost fragment-action"
                  @click="insertNode(preset.node)"
                >
                  {{ t("routeEditor.fragmentsInsert") }}
                </button>
              </div>
            </div>
            <div class="fragments-list">
              <div v-if="!fragments.length" class="hint">{{ t("routeEditor.fragmentsEmpty") }}</div>
              <div v-for="frag in fragments" :key="frag.id" class="fragment-row">
                <span class="fragment-name">{{ frag.name }}</span>
                <button
                  type="button"
                  class="btn btn-ghost fragment-action"
                  @click="insertFragment(frag)"
                >
                  {{ t("routeEditor.fragmentsInsert") }}
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  :title="t('routeEditor.fragmentsDelete')"
                  @click="deleteFragment(frag)"
                >
                  ✕
                </button>
              </div>
            </div>
            <div class="field fragment-save">
              <input
                v-model="fragmentName"
                class="input"
                :placeholder="t('routeEditor.fragmentsNamePlaceholder')"
              />
              <button type="button" class="btn btn-ghost" @click="saveAsFragment">
                {{ t("routeEditor.fragmentsSave") }}
              </button>
            </div>
            <div v-if="fragmentError" class="err">{{ fragmentError }}</div>
          </section>

          <section class="editor-section">
            <h3 class="editor-section-title">{{ t("routeEditor.sectionTargets") }}</h3>
            <div v-for="(tg, i) in form.targets" :key="i" class="target-row">
              <select v-model="tg.platform" class="tg-select">
                <option value="discord">Discord</option>
                <option value="telegram">Telegram</option>
                <option value="feishu">{{ t("routeEditor.platformFeishu") }}</option>
              </select>
              <template v-if="tg.platform === 'discord'">
                <input
                  v-model="tg.channelId"
                  class="input tg-in1"
                  :placeholder="t('routeEditor.channelPlaceholder')"
                />
                <input
                  v-model="tg.threadId"
                  class="input tg-in2"
                  :placeholder="t('routeEditor.threadPlaceholder')"
                />
              </template>
              <template v-else-if="tg.platform === 'telegram'">
                <input
                  v-model="tg.chatId"
                  class="input tg-in1"
                  :placeholder="t('routeEditor.chatPlaceholder')"
                />
                <input
                  v-model="tg.topicId"
                  class="input tg-in2"
                  :placeholder="t('routeEditor.topicPlaceholder')"
                />
              </template>
              <template v-else>
                <input
                  v-model="tg.chatId"
                  class="input tg-in1"
                  :placeholder="t('routeEditor.feishuChatPlaceholder')"
                />
              </template>
              <button
                type="button"
                class="icon-btn danger tg-del"
                :title="t('routeEditor.remove')"
                @click="form.targets.splice(i, 1)"
              >
                ✕
              </button>
            </div>
            <button type="button" class="btn btn-ghost add-filter" @click="addTarget">
              {{ t("routeEditor.addTarget") }}
            </button>
            <div v-if="targetError" class="err">{{ targetError }}</div>
          </section>

          <div v-if="formError" class="err">{{ formError }}</div>
        </form>

        <div class="editor-foot">
          <button class="btn btn-ghost" @click="close">{{ t("routeEditor.cancel") }}</button>
          <button class="btn btn-accent" :disabled="saving" @click="save">
            {{ t("routeEditor.save") }}
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
