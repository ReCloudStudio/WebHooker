<script setup lang="ts">
import type { NodeForm } from "~/composables/useFilterNode";
import { blankNode } from "~/composables/useFilterNode";
import { FILTER_TYPES, FILTER_OPS } from "~/types";

defineOptions({ name: "FilterNodeEditor" });

const props = withDefaults(
  defineProps<{ node: NodeForm; depth?: number; deletable?: boolean }>(),
  { depth: 0, deletable: false },
);

const emit = defineEmits<{ (e: "remove"): void }>();

const { t } = useI18n();

const NODE_KINDS = ["all", "any"] as const;

function addChild(kind: "leaf" | "all" | "any" | "not"): void {
  props.node.children.push(blankNode(kind));
}

function unwrapNot(): void {
  const child = props.node.child;
  if (!child) return;
  props.node.kind = child.kind;
  props.node.leaf = child.leaf;
  props.node.children = child.children;
  props.node.child = child.child;
}
</script>

<template>
  <div class="node-editor" :class="{ 'node-nested': depth > 0 }">
    <div v-if="node.kind === 'leaf'" class="leaf-row">
      <select v-model="node.leaf.type" class="node-select">
        <option v-for="ft in FILTER_TYPES" :key="ft" :value="ft">{{ t("filter." + ft) }}</option>
      </select>

      <input
        v-if="node.leaf.type === 'field'"
        v-model="node.leaf.path"
        class="input node-path"
        :placeholder="t('routeEditor.pathPlaceholder')"
      />

      <select
        v-if="node.leaf.type !== 'keyword'"
        v-model="node.leaf.op"
        class="node-select"
        :title="t('routeEditor.op')"
      >
        <option v-for="op in FILTER_OPS" :key="op" :value="op">{{ t("filterOp." + op) }}</option>
      </select>

      <TagInput
        v-if="node.leaf.type === 'keyword' || node.leaf.op !== 'exists'"
        v-model="node.leaf.values"
        class="node-values"
        :placeholder="t('routeEditor.valuesPlaceholder')"
      />

      <label class="inline node-exclude" :title="t('routeEditor.not')">
        <input v-model="node.leaf.exclude" type="checkbox" />
        <span>{{ t("routeEditor.not") }}</span>
      </label>

      <button
        v-if="deletable"
        type="button"
        class="icon-btn danger"
        :title="t('routeEditor.remove')"
        @click="emit('remove')"
      >
        ✕
      </button>
    </div>

    <div v-else-if="node.kind === 'all' || node.kind === 'any'" class="node-group">
      <div class="node-group-head">
        <select v-model="node.kind" class="node-combo">
          <option v-for="k in NODE_KINDS" :key="k" :value="k">{{ t("filterNode." + k) }}</option>
        </select>
        <div class="node-actions">
          <button type="button" class="btn btn-ghost node-add" @click="addChild('leaf')">
            + {{ t("routeEditor.addLeaf") }}
          </button>
          <button type="button" class="btn btn-ghost node-add" @click="addChild('all')">
            + {{ t("routeEditor.addGroup") }}
          </button>
          <button type="button" class="btn btn-ghost node-add" @click="addChild('not')">
            + {{ t("routeEditor.addNot") }}
          </button>
          <button
            v-if="deletable"
            type="button"
            class="icon-btn danger"
            :title="t('routeEditor.remove')"
            @click="emit('remove')"
          >
            ✕
          </button>
        </div>
      </div>
      <div class="node-children">
        <FilterNodeEditor
          v-for="(child, i) in node.children"
          :key="i"
          :node="child"
          :depth="depth + 1"
          deletable
          @remove="node.children.splice(i, 1)"
        />
        <div v-if="node.children.length === 0" class="node-empty">{{ t("filterNode.empty") }}</div>
      </div>
    </div>

    <div v-else class="node-group node-not">
      <div class="node-group-head">
        <span class="node-combo node-combo-label">{{ t("filterNode.not") }}</span>
        <div class="node-actions">
          <button type="button" class="btn btn-ghost node-add" @click="unwrapNot">
            {{ t("filterNode.unwrap") }}
          </button>
          <button
            v-if="deletable"
            type="button"
            class="icon-btn danger"
            :title="t('routeEditor.remove')"
            @click="emit('remove')"
          >
            ✕
          </button>
        </div>
      </div>
      <div class="node-children">
        <FilterNodeEditor v-if="node.child" :node="node.child" :depth="depth + 1" />
      </div>
    </div>
  </div>
</template>
