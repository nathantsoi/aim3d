<template>
  <div class="timeline-panel">
    <div class="panel-header">
      <h2>Model History</h2>
    </div>

    <!-- Tree-view structure representing CAD feature operations -->
    <div class="tree-container">
      <div class="tree-title">Parametric History Tree</div>
      <div class="tree-list">
        <div 
          v-for="(feat, index) in store.features" 
          :key="feat.id" 
          class="tree-node"
          :class="{ 
            dirty: feat.isDirty,
            selected: store.selectedEntityId === feat.id + '_face_0'
          }"
          @click="onNodeClick(feat.id + '_face_0')"
        >
          <div class="node-indicator"></div>
          <div class="node-content">
            <span class="node-type">{{ feat.type }}</span>
            <span class="node-id">{{ feat.id }}</span>
          </div>
          <div class="node-param">{{ feat.value }}</div>
        </div>
      </div>
    </div>

    <!-- Visual timeline track -->
    <div class="timeline-track-container">
      <div class="track-header">Timeline Slider</div>
      <div class="track-wrapper">
        <div class="track-line"></div>
        <div 
          v-for="(feat, index) in store.features" 
          :key="'t_' + feat.id"
          class="track-tick"
          :class="{ active: index <= activeIndex }"
          @click="activeIndex = index"
          :title="feat.id"
        >
          <div class="tick-dot"></div>
          <span class="tick-label">{{ feat.type }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref } from 'vue';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'Timeline',
  setup() {
    const store = useCoreStore();
    const activeIndex = ref(2); // Mock current timeline marker state

    const onNodeClick = (entityId) => {
      store.selectEntity(store.selectedEntityId === entityId ? null : entityId);
    };

    return {
      store,
      activeIndex,
      onNodeClick
    };
  }
});
</script>

<style scoped>
.timeline-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header h2 {
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(220, 10%, 65%);
  margin: 0 0 10px 0;
  font-weight: 700;
}

.tree-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(220, 10%, 80%);
}

.tree-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid hsla(220, 15%, 25%, 0.4);
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: hsl(220, 15%, 11%);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.tree-node:hover {
  background-color: hsl(220, 15%, 15%);
}

.tree-node.selected {
  border-color: hsl(45, 100%, 55%);
  background-color: hsla(45, 100%, 55%, 0.05);
}

.tree-node.dirty {
  border-color: hsl(45, 100%, 55%);
  background-color: hsla(45, 100%, 55%, 0.08);
}

.node-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: hsl(220, 10%, 40%);
  margin-right: 8px;
}

.selected .node-indicator {
  background-color: hsl(45, 100%, 55%);
  box-shadow: 0 0 6px hsl(45, 100%, 55%);
}

.dirty .node-indicator {
  background-color: hsl(45, 100%, 55%);
}

.node-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.node-type {
  font-weight: 700;
  color: hsl(220, 10%, 90%);
}

.node-id {
  font-size: 0.65rem;
  color: hsl(220, 10%, 50%);
}

.node-param {
  font-family: monospace;
  font-weight: 700;
  color: hsl(200, 100%, 50%);
}

.timeline-track-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.track-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(220, 10%, 80%);
}

.track-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-left: 20px;
}

.track-line {
  position: absolute;
  top: 0;
  left: 24px;
  bottom: 0;
  width: 2px;
  background-color: hsla(220, 15%, 25%, 0.6);
  z-index: 1;
}

.track-tick {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  z-index: 2;
}

.tick-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: hsl(220, 15%, 20%);
  border: 2px solid hsla(220, 15%, 35%, 0.6);
}

.track-tick.active .tick-dot {
  background-color: hsl(200, 100%, 50%);
  border-color: hsla(200, 100%, 50%, 0.3);
  box-shadow: 0 0 6px hsl(200, 100%, 50%);
}

.tick-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: hsl(220, 10%, 55%);
}

.active .tick-label {
  color: hsl(220, 10%, 90%);
}
</style>
