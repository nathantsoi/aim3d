<template>
  <div v-if="draft" class="construction-command" data-testid="construction-command-panel">
    <div class="command-header">
      <h2>Construction</h2>
      <span class="command-kind">{{ draft.label }}</span>
    </div>

    <p class="command-hint">
      Complete each input below. Use the viewport to pick geometry when a step is active, then click OK to
      add the feature to the timeline.
    </p>

    <div class="command-steps">
      <div
        v-for="(field, index) in definition.fields"
        :key="field.key"
        class="command-step"
        :class="{ active: draft.activeFieldKey === field.key }"
        data-testid="construction-command-step"
      >
        <div class="step-title">
          <span class="step-index">{{ index + 1 }}</span>
          <span>{{ field.label }}</span>
        </div>

        <template v-if="field.type === 'number'">
          <label class="input-item">
            <input
              :data-testid="`construction-field-${field.key}`"
              type="number"
              :min="field.min"
              :max="field.max"
              :step="field.step ?? 1"
              :value="draft.values[field.key]"
              @focus="store.setConstructionActiveField(field.key)"
              @input="onNumberField(field.key, $event)"
            />
            <span v-if="field.unit" class="unit">{{ field.unit }}</span>
          </label>
        </template>

        <template v-else-if="pickFieldTypes.has(field.type)">
          <label class="input-item">
            <select
              :data-testid="`construction-field-${field.key}`"
              :value="draft.values[field.key]"
              @focus="store.setConstructionActiveField(field.key)"
              @change="onSelectField(field.key, $event.target.value)"
            >
              <option value="" disabled>Select…</option>
              <option v-for="option in optionsFor(field)" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="pick-btn"
            :class="{ active: draft.activeFieldKey === field.key }"
            data-testid="construction-pick-button"
            @click="store.setConstructionActiveField(field.key)"
          >
            Pick in viewport
          </button>
          <p v-if="field.placeholder" class="field-hint">{{ field.placeholder }}</p>
        </template>

        <template v-else>
          <label class="input-item">
            <input
              :data-testid="`construction-field-${field.key}`"
              type="text"
              :placeholder="field.placeholder || 'Enter reference'"
              :value="draft.values[field.key]"
              @focus="store.setConstructionActiveField(field.key)"
              @input="onTextField(field.key, $event)"
            />
          </label>
          <button
            type="button"
            class="pick-btn"
            :class="{ active: draft.activeFieldKey === field.key }"
            @click="store.setConstructionActiveField(field.key)"
          >
            Pick in viewport
          </button>
        </template>
      </div>
    </div>

    <div class="command-actions">
      <button type="button" class="cancel-btn" data-testid="construction-cancel" @click="store.cancelConstructionCommand">
        Cancel
      </button>
      <button
        type="button"
        class="ok-btn"
        data-testid="construction-confirm"
        :disabled="!canConfirm"
        @click="store.confirmConstructionCommand"
      >
        OK
      </button>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent } from 'vue';
import { canConfirmConstructionDraft, getConstructionCommandDef, pickOptionsForField } from '../config/constructionCommands';
import { useCoreStore } from '../store';

const PICK_FIELD_TYPES = new Set(['plane', 'axis', 'point', 'face', 'edge', 'vertex', 'path']);

export default defineComponent({
  name: 'ConstructionCommandPanel',
  setup() {
    const store = useCoreStore();
    const draft = computed(() => store.pendingConstruction);
    const definition = computed(() => getConstructionCommandDef(draft.value?.kind) ?? { fields: [] });
    const canConfirm = computed(() => canConfirmConstructionDraft(draft.value));

    const optionsFor = (field) => pickOptionsForField(field.type, store.browser);

    const onNumberField = (key, event) => {
      store.updateConstructionDraft({ [key]: Number.parseFloat(event.target.value) });
    };

    const onSelectField = (key, value) => {
      store.updateConstructionDraft({ [key]: value });
    };

    const onTextField = (key, event) => {
      store.updateConstructionDraft({ [key]: event.target.value });
    };

    return {
      store,
      draft,
      definition,
      canConfirm,
      pickFieldTypes: PICK_FIELD_TYPES,
      optionsFor,
      onNumberField,
      onSelectField,
      onTextField
    };
  }
});
</script>

<style scoped>
.construction-command {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.command-header h2 {
  margin: 0;
  font-size: 1rem;
  text-transform: uppercase;
  color: hsl(220, 10%, 65%);
}

.command-kind {
  display: block;
  margin-top: 4px;
  font-size: 0.95rem;
  font-weight: 700;
  color: hsl(28, 100%, 62%);
}

.command-hint,
.field-hint {
  margin: 0;
  font-size: 0.75rem;
  color: hsl(220, 10%, 58%);
  line-height: 1.45;
}

.command-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.command-step {
  background-color: hsl(220, 15%, 13%);
  border: 1px solid hsla(220, 15%, 25%, 0.5);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-step.active {
  border-color: hsla(28, 100%, 55%, 0.75);
  box-shadow: 0 0 0 1px hsla(28, 100%, 55%, 0.25);
}

.step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: hsl(220, 10%, 88%);
}

.step-index {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background-color: hsla(28, 100%, 55%, 0.2);
  color: hsl(28, 100%, 62%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.input-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
}

input,
select {
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  color: hsl(220, 10%, 90%);
  font: inherit;
  padding: 7px 8px;
}

.unit {
  color: hsl(220, 10%, 55%);
  font-size: 0.72rem;
}

.pick-btn {
  align-self: flex-start;
  background-color: hsla(28, 100%, 55%, 0.12);
  border: 1px solid hsla(28, 100%, 55%, 0.45);
  border-radius: 6px;
  color: hsl(28, 100%, 62%);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 6px 10px;
}

.pick-btn.active {
  background-color: hsla(28, 100%, 55%, 0.28);
}

.command-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 8px;
}

.cancel-btn,
.ok-btn {
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 8px 16px;
}

.cancel-btn {
  background: transparent;
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  color: hsl(220, 10%, 75%);
}

.ok-btn {
  background-color: hsla(28, 100%, 55%, 0.22);
  border: 1px solid hsl(28, 100%, 55%);
  color: hsl(28, 100%, 62%);
}

.ok-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
