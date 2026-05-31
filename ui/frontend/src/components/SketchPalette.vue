<template>
  <div class="sketch-palette" data-testid="sketch-palette">
    <div class="palette-header">
      <button class="header-icon" title="Collapse">&minus;</button>
      <span class="palette-title">SKETCH PALETTE</span>
      <button class="header-icon" title="Dock">&raquo;</button>
    </div>

    <div class="palette-body">
      <button class="section-header" data-testid="options-toggle" @click="optionsOpen = !optionsOpen">
        <span class="section-caret">{{ optionsOpen ? '\u25BE' : '\u25B8' }}</span>
        <span>Options</span>
      </button>

      <div v-if="optionsOpen" class="section-content">
        <div class="palette-row">
          <span class="row-label">Linetype</span>
          <div class="row-control icon-group">
            <button class="palette-icon" title="Centerline">&#10043;</button>
            <button class="palette-icon" title="Construction">&#9711;</button>
          </div>
        </div>

        <div class="palette-row">
          <span class="row-label">Look At</span>
          <div class="row-control">
            <button class="palette-icon" title="Look At">&#9974;</button>
          </div>
        </div>

        <label
          v-for="option in toggleOptions"
          :key="option.key"
          class="palette-row option-row"
        >
          <span class="row-label">{{ option.label }}</span>
          <input
            type="checkbox"
            class="palette-check"
            :data-testid="`sketch-opt-${option.key}`"
            :checked="store.sketchPalette[option.key]"
            @change="store.toggleSketchOption(option.key)"
          />
        </label>
      </div>
    </div>

    <div class="palette-footer">
      <button class="finish-btn" data-testid="finish-sketch" @click="onFinish">Finish Sketch</button>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref } from 'vue';
import { useCoreStore } from '../store';
import { solveSketch2d } from '../services/tauriCommands';

const toggleOptions = [
  { key: 'sketchGrid', label: 'Sketch Grid' },
  { key: 'snap', label: 'Snap' },
  { key: 'slice', label: 'Slice' },
  { key: 'profile', label: 'Profile' },
  { key: 'points', label: 'Points' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'projectedGeometries', label: 'Projected Geometries' },
  { key: 'constructionGeometries', label: 'Construction Geometries' },
  { key: 'threeDSketch', label: '3D Sketch' }
];

export default defineComponent({
  name: 'SketchPalette',
  setup() {
    const store = useCoreStore();
    const optionsOpen = ref(true);

    const onFinish = async () => {
      // Solve the sketch through the headless solver, then leave sketch mode.
      try {
        await solveSketch2d();
      } finally {
        store.finishSketch();
      }
    };

    return {
      store,
      optionsOpen,
      toggleOptions,
      onFinish
    };
  }
});
</script>

<style scoped>
.sketch-palette {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 0.85rem;
}

.palette-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid hsla(220, 15%, 25%, 0.4);
}

.palette-title {
  flex-grow: 1;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: hsl(220, 10%, 85%);
}

.header-icon {
  background: none;
  border: 0;
  color: hsl(220, 10%, 55%);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0 2px;
}

.header-icon:hover {
  color: hsl(220, 10%, 90%);
}

.palette-body {
  flex-grow: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: 0;
  color: hsl(220, 10%, 90%);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  text-align: left;
}

.section-caret {
  color: hsl(220, 10%, 55%);
  font-size: 0.7rem;
}

.section-content {
  display: flex;
  flex-direction: column;
}

.palette-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  color: hsl(220, 10%, 85%);
}

.option-row {
  cursor: pointer;
}

.option-row:hover {
  background-color: hsla(220, 15%, 20%, 0.5);
}

.row-label {
  flex-grow: 1;
  font-weight: 600;
}

.row-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-group {
  gap: 14px;
}

.palette-icon {
  background: none;
  border: 0;
  color: hsl(0, 75%, 62%);
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
}

.palette-icon:hover {
  color: hsl(0, 80%, 70%);
}

.palette-check {
  width: 18px;
  height: 18px;
  accent-color: hsl(200, 100%, 50%);
  cursor: pointer;
}

.palette-footer {
  padding: 12px 16px;
  border-top: 1px solid hsla(220, 15%, 25%, 0.4);
  display: flex;
  justify-content: flex-end;
}

.finish-btn {
  padding: 8px 18px;
  background-color: hsla(200, 100%, 50%, 0.15);
  border: 1px solid hsla(200, 100%, 50%, 0.5);
  border-radius: 6px;
  color: hsl(200, 100%, 70%);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.finish-btn:hover {
  background-color: hsla(200, 100%, 50%, 0.25);
}
</style>
