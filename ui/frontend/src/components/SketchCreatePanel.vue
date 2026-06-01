<template>
  <div v-if="draft" class="sketch-create" data-testid="sketch-create-panel">
    <div class="command-header">
      <h2>Sketch</h2>
      <span class="command-kind">{{ draft.label }}</span>
    </div>

    <p class="command-hint">
      Select the plane to sketch on. Use the viewport to pick a planar face or construction plane, then click
      OK to create the sketch and enter sketch mode.
    </p>

    <div class="command-step active" data-testid="sketch-plane-step">
      <div class="step-title">
        <span class="step-index">1</span>
        <span>Sketch plane</span>
      </div>

      <label class="input-item">
        <select
          data-testid="sketch-plane-field"
          :value="draft.values.plane"
          @focus="store.setSketchPlaneActiveField()"
          @change="onPlaneSelect($event.target.value)"
        >
          <option value="" disabled>Select a plane...</option>
          <option v-for="option in planeOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
        </select>
      </label>

      <button
        type="button"
        class="pick-btn active"
        data-testid="sketch-plane-pick-button"
        @click="store.setSketchPlaneActiveField()"
      >
        Pick in viewport
      </button>
      <p class="field-hint">Click an origin plane, construction plane, or planar face in the 3D view.</p>
    </div>

    <div class="command-actions">
      <button type="button" class="cancel-btn" data-testid="sketch-create-cancel" @click="store.cancelSketchCreation">
        Cancel
      </button>
      <button
        type="button"
        class="ok-btn"
        data-testid="sketch-create-confirm"
        :disabled="!canConfirm"
        @click="store.confirmSketchCreation"
      >
        OK
      </button>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent } from 'vue';
import { canConfirmSketchPlane, sketchPlaneOptions } from '../contracts/sketchPlane';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'SketchCreatePanel',
  setup() {
    const store = useCoreStore();
    const draft = computed(() => store.pendingSketchCreation);
    const planeOptions = computed(() => sketchPlaneOptions(store.browser));
    const canConfirm = computed(() => canConfirmSketchPlane(draft.value));

    const onPlaneSelect = (value) => {
      store.updateSketchCreationDraft({ plane: value });
    };

    return {
      store,
      draft,
      planeOptions,
      canConfirm,
      onPlaneSelect
    };
  }
});
</script>

<style scoped>
.sketch-create {
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
  color: hsl(200, 100%, 62%);
}

.command-hint,
.field-hint {
  margin: 0;
  font-size: 0.75rem;
  color: hsl(220, 10%, 58%);
  line-height: 1.45;
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
  border-color: hsla(200, 100%, 55%, 0.75);
  box-shadow: 0 0 0 1px hsla(200, 100%, 55%, 0.25);
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
  background-color: hsla(200, 100%, 55%, 0.2);
  color: hsl(200, 100%, 62%);
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

select {
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  color: hsl(220, 10%, 90%);
  font: inherit;
  padding: 7px 8px;
}

.pick-btn {
  align-self: flex-start;
  background-color: hsla(200, 100%, 55%, 0.12);
  border: 1px solid hsla(200, 100%, 55%, 0.45);
  border-radius: 6px;
  color: hsl(200, 100%, 62%);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 6px 10px;
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
  background-color: hsla(200, 100%, 55%, 0.22);
  border: 1px solid hsl(200, 100%, 55%);
  color: hsl(200, 100%, 62%);
}

.ok-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
