<template>
  <div class="timeline-panel">
    <div class="panel-header">
      <h2>Model Tree</h2>
    </div>

    <section class="tree-container">
      <div class="tree-title">{{ store.documentPath }}</div>
      <div class="tree-list">
        <button
          v-for="feature in store.features"
          :key="feature.id"
          class="tree-node"
          :class="{
            dirty: feature.isDirty,
            selected: store.selectedEntityId === feature.selectionToken
          }"
          data-testid="feature-tree-node"
          @click="onNodeClick(feature.selectionToken)"
        >
          <span class="node-indicator"></span>
          <span class="node-content">
            <span class="node-type">{{ feature.label }}</span>
            <span class="node-id">{{ feature.id }}</span>
          </span>
          <span class="node-param">{{ feature.value }}</span>
        </button>
      </div>
    </section>

    <section class="tree-container">
      <div class="tree-title">Setups</div>
      <div v-for="setup in store.setups" :key="setup.id" class="setup-group">
        <button
          class="tree-node setup-node"
          :class="{ dirty: setup.isDirty, selected: store.selectedEntityId === setup.id }"
          data-testid="setup-tree-node"
          @click="onNodeClick(setup.id)"
        >
          <span class="node-indicator"></span>
          <span class="node-content">
            <span class="node-type">{{ setup.name }}</span>
            <span class="node-id">{{ setup.workOffset }} / {{ setup.units }}</span>
          </span>
        </button>

        <div class="operation-list">
          <button
            v-for="operation in store.operationsBySetup[setup.id]"
            :key="operation.id"
            class="tree-node operation-node"
            :class="{
              dirty: operation.isDirty || operation.status === 'Stale',
              selected: store.selectedEntityId === operation.id
            }"
            data-testid="operation-tree-node"
            @click="onNodeClick(operation.id)"
          >
            <span class="node-indicator"></span>
            <span class="node-content">
              <span class="node-type">{{ operation.name }}</span>
              <span class="node-id">{{ operation.type }}</span>
            </span>
            <span class="node-param">{{ operation.status }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="timeline-track-container">
      <div class="track-header">Timeline</div>
      <div class="track-wrapper">
        <div class="track-line"></div>
        <button
          v-for="(feature, index) in store.features"
          :key="'t_' + feature.id"
          class="track-tick"
          :class="{ active: index <= activeIndex }"
          :title="feature.id"
          @click="activeIndex = index"
        >
          <span class="tick-dot"></span>
          <span class="tick-label">{{ feature.type }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script>
import { defineComponent, ref } from 'vue';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'Timeline',
  setup() {
    const store = useCoreStore();
    const activeIndex = ref(2);

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
  color: hsl(220, 10%, 65%);
  margin: 0 0 10px 0;
  font-weight: 700;
}

.tree-container,
.setup-group,
.timeline-track-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree-title,
.track-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(220, 10%, 80%);
}

.tree-list,
.operation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid hsla(220, 15%, 25%, 0.4);
}

.operation-list {
  margin-left: 16px;
}

.tree-node,
.track-tick {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background-color: hsl(220, 15%, 11%);
  border: 1px solid transparent;
  border-radius: 6px;
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
}

.selected .node-indicator,
.dirty .node-indicator {
  background-color: hsl(45, 100%, 55%);
}

.node-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.node-type {
  color: hsl(220, 10%, 90%);
  font-weight: 700;
}

.node-id {
  color: hsl(220, 10%, 50%);
  font-size: 0.65rem;
}

.node-param {
  color: hsl(200, 100%, 50%);
  font-family: monospace;
  font-weight: 700;
}

.timeline-track-container {
  gap: 12px;
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
}

.tick-label {
  color: hsl(220, 10%, 55%);
  font-size: 0.75rem;
  font-weight: 600;
}

.active .tick-label {
  color: hsl(220, 10%, 90%);
}
</style>
