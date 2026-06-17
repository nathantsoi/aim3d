<template>
  <div class="timeline-bar" v-show="store.activeMode === 'design'">
    <!-- Sketch mode: replace the timeline with the active sketch's constraints. -->
    <template v-if="store.isSketchMode">
      <div class="bar-label">Constraints</div>
      <div class="constraint-strip" data-testid="constraint-strip">
        <button
          v-for="constraint in store.sketchConstraints"
          :key="constraint.id"
          class="constraint-chip"
          :class="{ selected: store.selectedEntityId === constraint.id }"
          :title="`${constraint.type}: ${constraint.entities}`"
          data-testid="constraint-chip"
          @click="onSelectConstraint(constraint)"
        >
          <span class="chip-glyph">{{ constraint.glyph }}</span>
          <span class="chip-type">{{ constraint.type }}</span>
        </button>
        <div v-if="!store.sketchConstraints.length" class="track-empty">No constraints</div>
      </div>
    </template>

    <!-- Default: parametric timeline. -->
    <template v-else>
      <div class="bar-label">Timeline</div>
      <div class="track">
        <div class="track-line"></div>
        <div
          v-for="(feature, index) in store.features"
          :key="'t_' + feature.id"
          class="track-tick"
          :class="{ active: index <= activeIndex, selected: store.selectedEntityId === feature.selectionToken }"
          data-testid="timeline-tick"
        >
          <button
            class="tick-button"
            :title="feature.id"
            @click="onScrub(index, feature)"
          >
            <span class="tick-dot"></span>
            <span class="tick-label">{{ feature.type }}</span>
          </button>
          <button
            class="tick-delete"
            :title="`Delete ${feature.label}`"
            data-testid="timeline-delete"
            @click.stop="onDelete(feature)"
          >
            &times;
          </button>
        </div>
        <div v-if="!store.features.length" class="track-empty">No timeline features</div>
      </div>
    </template>
  </div>
</template>

<script>
import { computed, defineComponent, ref } from 'vue';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'TimelineBar',
  setup() {
    const store = useCoreStore();
    const scrubIndex = ref(null);

    const activeIndex = computed(() =>
      scrubIndex.value === null ? store.features.length - 1 : scrubIndex.value
    );

    const onScrub = (index, feature) => {
      scrubIndex.value = index;
      store.selectEntity(
        store.selectedEntityId === feature.selectionToken ? null : feature.selectionToken
      );
    };

    const onDelete = (feature) => {
      scrubIndex.value = null;
      store.deleteEntity(feature.id, 'feature');
    };

    const onSelectConstraint = (constraint) => {
      store.selectEntity(
        store.selectedEntityId === constraint.id ? null : constraint.id
      );
    };

    return {
      store,
      activeIndex,
      onScrub,
      onDelete,
      onSelectConstraint
    };
  }
});
</script>

<style scoped>
.timeline-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 64px;
  padding: 0 24px;
  background-color: hsla(220, 15%, 18%, 0.85);
  backdrop-filter: blur(12px);
  border-top: 1px solid hsla(220, 15%, 25%, 0.4);
  overflow-x: auto;
}

.bar-label {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(220, 10%, 65%);
  flex-shrink: 0;
}

.track {
  position: relative;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 8px;
  min-height: 48px;
}

.track-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 18px;
  height: 2px;
  background-color: hsla(220, 15%, 25%, 0.6);
  z-index: 1;
}

.track-tick {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 2;
  flex-shrink: 0;
}

.tick-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.tick-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: hsl(220, 15%, 14%);
  border: 2px solid hsla(220, 15%, 35%, 0.6);
}

.track-tick.active .tick-dot {
  background-color: hsl(200, 100%, 50%);
  border-color: hsla(200, 100%, 50%, 0.3);
}

.track-tick.selected .tick-dot {
  border-color: hsl(45, 100%, 55%);
  box-shadow: 0 0 8px hsla(45, 100%, 55%, 0.5);
}

.tick-label {
  color: hsl(220, 10%, 55%);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.track-tick.active .tick-label {
  color: hsl(220, 10%, 90%);
}

.tick-delete {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid hsla(0, 85%, 65%, 0.4);
  border-radius: 50%;
  background-color: hsla(220, 20%, 12%, 0.95);
  color: hsl(0, 85%, 68%);
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.track-tick:hover .tick-delete {
  opacity: 1;
}

.tick-delete:hover {
  background-color: hsla(0, 85%, 65%, 0.2);
}

.track-empty {
  color: hsl(220, 10%, 50%);
  font-size: 0.75rem;
  font-style: italic;
}

.constraint-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}

.constraint-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background-color: hsl(220, 15%, 14%);
  border: 1px solid hsla(220, 15%, 30%, 0.6);
  border-radius: 16px;
  color: hsl(220, 10%, 80%);
  cursor: pointer;
  font: inherit;
  font-size: 0.74rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.constraint-chip:hover {
  border-color: hsla(200, 100%, 50%, 0.7);
  color: hsl(200, 100%, 75%);
}

.constraint-chip.selected {
  border-color: hsl(45, 100%, 55%);
  color: hsl(45, 100%, 65%);
  box-shadow: 0 0 8px hsla(45, 100%, 55%, 0.35);
}

.chip-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background-color: hsla(200, 100%, 50%, 0.16);
  color: hsl(200, 100%, 70%);
  font-size: 0.8rem;
  font-weight: 700;
}

.constraint-chip.selected .chip-glyph {
  background-color: hsla(45, 100%, 55%, 0.18);
  color: hsl(45, 100%, 68%);
}

.chip-type {
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
