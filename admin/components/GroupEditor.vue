<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="close"></div>
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="editor" role="dialog" aria-modal="true">
        <div class="editor-head">
          <h2>{{ isEdit ? "Edit group" : "New group" }}</h2>
          <button class="icon-btn" title="Close" @click="close">✕</button>
        </div>
        <form class="editor-body" @submit.prevent="save">
          <div class="row2">
            <div class="field">
              <label>Name</label>
              <input v-model="form.name" type="text" placeholder="My Team" required />
            </div>
            <div class="field">
              <label>ID</label>
              <input v-model="form.id" type="text" placeholder="my-team" :disabled="isEdit" required />
              <div class="hint">Unique, use a-z / 0-9 / dashes</div>
            </div>
          </div>
          <div class="field">
            <label>Group admins <span class="lbl-note">(GitHub login or user id, comma-separated)</span></label>
            <input v-model="form.adminIds" type="text" placeholder="octocat, 12345" />
            <div class="hint">These users can view logs and edit this group's routes.</div>
          </div>
          <div class="field">
            <label>Owner scope <span class="lbl-note">(GitHub org / user logins, comma-separated)</span></label>
            <input v-model="form.owners" type="text" placeholder="my-org, some-user" />
            <div class="hint">
              Only webhook events from these orgs/users enter this group's routes. Leave empty for no
              restriction.
            </div>
          </div>
          <div class="err">{{ formError }}</div>
        </form>
        <div class="editor-foot">
          <button class="btn btn-ghost" type="button" @click="close">Cancel</button>
          <button class="btn btn-accent" type="button" :disabled="saving" @click="save">Save group</button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Group } from "~/types";

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
    formError.value = "ID must be a-z / 0-9 / dashes";
    return;
  }
  if (!name) {
    formError.value = "Name is required";
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
