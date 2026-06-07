<template>
  <div v-if="draft" class="sketch-command" data-testid="sketch-element-command-panel">
    <div class="command-header">
      <h2>Sketch</h2>
      <span class="command-kind">{{ draft.label }}</span>
    </div>

    <p class="command-hint">
      Complete each step below. Click in the viewport to place points on the sketch plane. Numeric fields
      accept values or parameter names (for example <code>d1</code>).
    </p>

    <div class="command-steps">
      <div
        v-for="(field, index) in definition.fields"
        :key="field.key"
        class="command-step"
        :class="{ active: draft.activeFieldKey === field.key }"
        data-testid="sketch-command-step"
      >
        <div class="step-title">
          <span class="step-index">{{ index + 1 }}</span>
          <span>{{ field.label }}</span>
        </div>

        <template v-if="field.type === 'point'">
          <p class="field-value" data-testid="sketch-point-value">
            {{
              draft.values[field.key]
                ? `(${draft.values[field.key][0].toFixed(2)}, ${draft.values[field.key][1].toFixed(2)})`
                : 'Click in viewport'
            }}
          </p>
          <button
            type="button"
            class="pick-btn"
            :class="{ active: draft.activeFieldKey === field.key }"
            data-testid="sketch-pick-button"
            @click="store.setSketchElementActiveField(field.key)"
          >
            Pick in viewport
          </button>
        </template>

        <template v-else-if="field.type === 'dimension'">
          <label class="input-item">
            <input
              :data-testid="`sketch-field-${field.key}`"
              type="text"
              :value="draft.values[field.key]"
              :placeholder="field.default?.toString() ?? '10'"
              @focus="store.setSketchElementActiveField(field.key)"
              @input="onDimensionField(field.key, $event)"
            />
            <span v-if="field.unit" class="unit">{{ field.unit }}</span>
          </label>
          <p v-if="resolvedPreview(field.key)" class="field-hint">
            Resolved: {{ resolvedPreview(field.key) }} {{ field.unit ?? 'mm' }}
          </p>
          <div class="variable-row">
            <input
              v-model="newVariableName"
              data-testid="sketch-new-variable-name"
              type="text"
              placeholder="Variable name"
            />
            <input
              v-model.number="newVariableValue"
              data-testid="sketch-new-variable-value"
              type="number"
              step="0.1"
              placeholder="Value"
            />
            <button type="button" class="pick-btn" data-testid="sketch-add-variable" @click="addVariable">
              Add variable
            </button>
          </div>
          <ul v-if="store.sketchParameters.length" class="variable-list">
            <li v-for="param in store.sketchParameters" :key="param.name">
              <button type="button" class="var-chip" @click="useVariable(field.key, param.name)">
                {{ param.name }} = {{ param.value }}
              </button>
            </li>
          </ul>
          <button
            v-if="field.bindRadius"
            type="button"
            class="pick-btn"
            :class="{ active: draft.activeFieldKey === field.key }"
            @click="store.setSketchElementActiveField(field.key)"
          >
            Set radius by second click
          </button>
        </template>
      </div>
    </div>

    <div class="command-actions">
      <button type="button" class="cancel-btn" data-testid="sketch-element-cancel" @click="store.cancelSketchElement">
        Cancel
      </button>
      <button
        type="button"
        class="ok-btn"
        data-testid="sketch-element-confirm"
        :disabled="!canConfirm"
        @click="store.confirmSketchElement"
      >
        OK
      </button>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, ref } from 'vue';
import { canConfirmSketchElement, getSketchCommandDef } from '../config/sketchCommands';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'SketchElementCommandPanel',
  setup() {
    const store = useCoreStore();
    const draft = computed(() => store.pendingSketchElement);
    const definition = computed(() => getSketchCommandDef(draft.value?.kind) ?? { fields: [] });
    const canConfirm = computed(() =>
      canConfirmSketchElement(draft.value, (raw) => store.resolveSketchNumeric(raw))
    );
    const newVariableName = ref('');
    const newVariableValue = ref(10);

    const resolvedPreview = (key) => {
      const value = store.resolveSketchNumeric(draft.value?.values?.[key]);
      return Number.isFinite(value) ? value.toFixed(3) : null;
    };

    const onDimensionField = (key, event) => {
      const text = event.target.value;
      const numeric = Number.parseFloat(text);
      store.updateSketchElementDraft({
        [key]: Number.isFinite(numeric) && String(numeric) === text.trim() ? numeric : text
      });
    };

    const useVariable = (fieldKey, name) => {
      store.updateSketchElementDraft({ [fieldKey]: name });
    };

    const addVariable = () => {
      store.addSketchParameter(newVariableName.value, newVariableValue.value);
      newVariableName.value = '';
    };

    return {
      store,
      draft,
      definition,
      canConfirm,
      newVariableName,
      newVariableValue,
      resolvedPreview,
      onDimensionField,
      useVariable,
      addVariable
    };
  }
});
</script>

<style scoped>
.sketch-command {
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
  color: hsl(195, 100%, 62%);
}

.command-hint,
.field-hint {
  margin: 0;
  font-size: 0.75rem;
  color: hsl(220, 10%, 58%);
  line-height: 1.45;
}

.command-hint code {
  font-family: monospace;
  color: hsl(195, 100%, 70%);
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
  border-color: hsla(195, 100%, 55%, 0.75);
  box-shadow: 0 0 0 1px hsla(195, 100%, 55%, 0.25);
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
  background-color: hsla(195, 100%, 55%, 0.2);
  color: hsl(195, 100%, 62%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.field-value {
  margin: 0;
  font-family: monospace;
  font-size: 0.8rem;
  color: hsl(195, 100%, 70%);
}

.input-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
}

input {
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

.variable-row {
  display: grid;
  grid-template-columns: 1fr 72px auto;
  gap: 6px;
  align-items: center;
}

.variable-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.var-chip {
  background-color: hsla(195, 100%, 55%, 0.12);
  border: 1px solid hsla(195, 100%, 55%, 0.35);
  border-radius: 999px;
  color: hsl(195, 100%, 62%);
  cursor: pointer;
  font-size: 0.72rem;
  padding: 4px 8px;
}

.pick-btn {
  align-self: flex-start;
  background-color: hsla(195, 100%, 55%, 0.12);
  border: 1px solid hsla(195, 100%, 55%, 0.45);
  border-radius: 6px;
  color: hsl(195, 100%, 62%);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 6px 10px;
}

.pick-btn.active {
  background-color: hsla(195, 100%, 55%, 0.28);
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
  background-color: hsla(195, 100%, 55%, 0.22);
  border: 1px solid hsl(195, 100%, 55%);
  color: hsl(195, 100%, 62%);
}

.ok-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
