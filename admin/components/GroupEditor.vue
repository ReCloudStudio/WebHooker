<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="close"></div>
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="editor" role="dialog" aria-modal="true">
        <div class="editor-head">
          <h2>{{ isEdit ? t("groupEditor.editTitle") : t("groupEditor.newTitle") }}</h2>
          <button class="icon-btn" :title="t('groupEditor.close')" @click="close">✕</button>
        </div>
        <form class="editor-body" @submit.prevent="save">
          <div class="row2">
            <div class="field">
              <label>{{ t("groupEditor.name") }}</label>
              <input
                v-model="form.name"
                type="text"
                :placeholder="t('groupEditor.namePlaceholder')"
                required
              />
            </div>
            <div class="field">
              <label>{{ t("groupEditor.id") }}</label>
              <input
                v-model="form.id"
                type="text"
                :placeholder="t('groupEditor.idPlaceholder')"
                :disabled="isEdit"
                required
              />
              <div class="hint">{{ t("groupEditor.idHint") }}</div>
            </div>
          </div>
          <div class="field">
            <label
              >{{ t("groupEditor.admins") }}
              <span class="lbl-note">{{ t("groupEditor.adminsNote") }}</span></label
            >
            <input
              v-model="form.adminIds"
              type="text"
              :placeholder="t('groupEditor.adminsPlaceholder')"
            />
            <div class="hint">{{ t("groupEditor.adminsHint") }}</div>
          </div>
          <div class="field">
            <label
              >{{ t("groupEditor.owners") }}
              <span class="lbl-note">{{ t("groupEditor.ownersNote") }}</span></label
            >
            <input
              v-model="form.owners"
              type="text"
              :placeholder="t('groupEditor.ownersPlaceholder')"
            />
            <div class="hint">{{ t("groupEditor.ownersHint") }}</div>
          </div>
          <div class="err">{{ formError }}</div>
        </form>
        <div class="editor-foot">
          <button class="btn btn-ghost" type="button" @click="close">
            {{ t("groupEditor.cancel") }}
          </button>
          <button class="btn btn-accent" type="button" :disabled="saving" @click="save">
            {{ t("groupEditor.save") }}
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Group } from "~/types";

const { t } = useI18n();

const props = defineProps<{ open: boolean; group: Group | null; saving: boolean }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", group: Group): void;
}>();

const isEdit = computed(() => props.group != null);
const formError = ref("");

const form = reactive({
  id: "",
  name: "",
  adminIds: "",
  owners: "",
});

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const g = props.group;
    form.id = g?.id ?? "";
    form.name = g?.name ?? "";
    form.adminIds = (g?.adminIds ?? []).join(", ");
    form.owners = (g?.owners ?? []).join(", ");
    formError.value = "";
  },
);

function close(): void {
  emit("close");
}

function save(): void {
  formError.value = "";
  const id = form.id.trim();
  const name = form.name.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    formError.value = t("groupEditor.errIdFormat");
    return;
  }
  if (!name) {
    formError.value = t("groupEditor.errName");
    return;
  }
  const owners = splitList(form.owners);
  emit("save", {
    id,
    name,
    adminIds: splitList(form.adminIds),
    owners: owners.length ? owners : undefined,
  });
}
</script>
