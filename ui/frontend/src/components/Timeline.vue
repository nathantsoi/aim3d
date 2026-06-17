<template>
  <div class="timeline-panel">
    <!-- Machine DRO replaces the header entirely in machine mode -->
    <MachineDRO v-if="store.activeMode === 'machine'" />

    <div v-if="store.activeMode !== 'machine'" class="panel-header">
      <h2>{{ store.activeMode === 'manufacture' ? 'Manufacture Browser' : 'Model Tree' }}</h2>
    </div>

    <section v-if="store.activeMode === 'design'" class="tree-container">
      <div class="tree-title">{{ store.documentPath }}</div>

      <div v-if="hasBrowser" class="browser-tree" data-testid="model-browser">
        <div class="browser-folder">
          <div class="folder-header">
            <span class="folder-label">Origin</span>
            <button
              class="visibility-toggle"
              data-testid="origin-visibility-toggle"
              :title="store.browser.origin?.visible ? 'Hide Origin' : 'Show Origin'"
              :class="{ dimmed: !store.browser.origin?.visible }"
              @click="store.toggleOriginVisibility()"
            >
              👁
            </button>
          </div>
          <div class="folder-children">
            <div
              v-for="plane in store.browser.origin.planes"
              :key="plane"
              class="browser-leaf clickable"
              :class="{ selected: store.selectedEntityId === plane || (store.pendingSketchCreation && store.pendingSketchCreation.values.plane === plane) }"
              data-testid="origin-plane"
              @click="onBrowserNodeClick(plane)"
            >{{ planeLabel(plane) }}</div>
          </div>
        </div>

        <div v-if="constructionGroups.planes.length" class="browser-folder">
          <span class="folder-label">Planes</span>
          <div class="folder-children">
            <div
              v-for="object in constructionGroups.planes"
              :key="object.id"
              class="browser-leaf clickable"
              :class="{ selected: store.selectedEntityId === object.id || (store.pendingSketchCreation && store.pendingSketchCreation.values.plane === object.id) }"
              data-testid="construction-node"
              @click="onBrowserNodeClick(object.id)"
            >
              <span class="node-type">{{ object.label }}</span>
              <span class="leaf-kind">{{ object.kind }}</span>
            </div>
          </div>
        </div>

        <div v-if="constructionGroups.axes.length" class="browser-folder">
          <span class="folder-label">Axes</span>
          <div class="folder-children">
            <div
              v-for="object in constructionGroups.axes"
              :key="object.id"
              class="browser-leaf clickable"
              :class="{ selected: store.selectedEntityId === object.id }"
              data-testid="construction-axis-node"
              @click="onBrowserNodeClick(object.id)"
            >
              <span class="node-type">{{ object.label }}</span>
              <span class="leaf-kind">{{ object.kind }}</span>
            </div>
          </div>
        </div>

        <div v-if="constructionGroups.points.length" class="browser-folder">
          <span class="folder-label">Points</span>
          <div class="folder-children">
            <div
              v-for="object in constructionGroups.points"
              :key="object.id"
              class="browser-leaf clickable"
              :class="{ selected: store.selectedEntityId === object.id }"
              data-testid="construction-point-node"
              @click="onBrowserNodeClick(object.id)"
            >
              <span class="node-type">{{ object.label }}</span>
              <span class="leaf-kind">{{ object.kind }}</span>
            </div>
          </div>
        </div>

        <div v-if="store.browser.sketches.length" class="browser-folder">
          <span class="folder-label">Sketches</span>
          <div class="folder-children">
            <div
              v-for="sketch in store.browser.sketches"
              :key="sketch.id"
              class="browser-sketch"
              data-testid="browser-sketch"
            >
              <button class="sketch-toggle" @click="toggleSketch(sketch.id)">
                <span class="twisty">{{ isExpanded(sketch.id) ? '▾' : '▸' }}</span>
                <span class="node-type">{{ sketch.id }}</span>
                <span class="leaf-kind">{{ planeText(sketch.plane) }}</span>
              </button>
              <div v-if="isExpanded(sketch.id)" class="folder-children">
                <div
                  v-for="entity in sketch.entities"
                  :key="entity.id"
                  class="browser-leaf"
                  data-testid="sketch-entity"
                >
                  <span class="node-type">{{ entity.kind }}</span>
                  <span v-if="entity.construction" class="leaf-kind">construction</span>
                </div>
                <div v-if="!sketch.entities.length" class="browser-leaf empty">No entities</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="store.browser.bodies.length" class="browser-folder">
          <span class="folder-label">Bodies</span>
          <div class="folder-children">
            <div
              v-for="body in store.browser.bodies"
              :key="body.id"
              class="browser-leaf clickable"
              :class="{ selected: store.selectedEntityId === body.id }"
              data-testid="body-node"
              @click="onBrowserNodeClick(body.id)"
            >{{ body.name }}</div>
          </div>
        </div>
      </div>

      <div v-if="hasBrowser" class="timeline-subtitle">Timeline</div>
      <div class="tree-list">
        <div
          v-for="feature in store.features"
          :key="feature.id"
          class="tree-node-row"
        >
          <button
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
          <button
            v-if="feature.type === 'Sketch'"
            class="open-btn"
            :title="`Open ${feature.label}`"
            data-testid="sketch-open"
            @click="onOpenSketch(feature.id)"
          >
            &#9998;
          </button>
          <button
            class="delete-btn"
            :title="`Delete ${feature.label}`"
            data-testid="feature-delete"
            @click="onDelete(feature.id, 'feature')"
          >
            &times;
          </button>
        </div>
      </div>
    </section>

    <section v-if="store.activeMode === 'manufacture'" class="tree-container">
      <div class="tree-title">Setups</div>
      <div v-for="setup in store.setups" :key="setup.id" class="setup-group">
        <div class="tree-node-row">
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
          <button
            class="delete-btn"
            :title="`Delete ${setup.name}`"
            data-testid="setup-delete"
            @click="onDelete(setup.id, 'setup')"
          >
            &times;
          </button>
        </div>

        <div class="operation-list">
          <div
            v-for="operation in store.operationsBySetup[setup.id]"
            :key="operation.id"
            class="tree-node-row"
          >
            <button
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
            <button
              class="delete-btn"
              :title="`Delete ${operation.name}`"
              data-testid="operation-delete"
              @click="onDelete(operation.id, 'operation')"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Machine mode visibility controls (origin, stock, G54) -->
    <section v-if="store.activeMode === 'machine'" class="tree-container visibility-section">
      <div class="tree-title">Viewport</div>
      <div class="browser-tree">
        <div class="browser-folder">
          <div class="folder-header">
            <span class="folder-label">Origin</span>
            <button
              class="visibility-toggle"
              data-testid="origin-visibility-toggle"
              :title="store.browser?.origin?.visible ? 'Hide Origin' : 'Show Origin'"
              :class="{ dimmed: !store.browser?.origin?.visible }"
              @click="store.toggleOriginVisibility()"
            >👁</button>
          </div>
        </div>
        <div class="browser-folder">
          <div class="folder-header">
            <span class="folder-label">Stock</span>
            <button
              class="visibility-toggle"
              data-testid="stock-visibility-toggle"
              :title="store.showStock ? 'Hide Stock' : 'Show Stock'"
              :class="{ dimmed: !store.showStock }"
              @click="store.toggleStockVisibility()"
            >👁</button>
          </div>
        </div>
        <div class="browser-folder">
          <div class="folder-header">
            <span class="folder-label">G54 Frame</span>
            <button
              class="visibility-toggle"
              data-testid="g54-visibility-toggle"
              :title="store.showG54Frame ? 'Hide G54 Frame' : 'Show G54 Frame'"
              :class="{ dimmed: !store.showG54Frame }"
              @click="store.toggleG54FrameVisibility()"
            >👁</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, ref } from 'vue';
import { useCoreStore } from '../store';
import MachineDRO from './MachineDRO.vue';

export default defineComponent({
  name: 'Timeline',
  components: { MachineDRO },
  setup() {
    const store = useCoreStore();

    // Sketches are expanded by default; this tracks the ones the user collapsed.
    const collapsedSketches = ref({});

    const constructionGroups = computed(() => {
      const items = store.browser?.construction ?? [];
      return {
        planes: items.filter((item) => item.category === 'plane' || item.category === 'ucs'),
        axes: items.filter((item) => item.category === 'axis'),
        points: items.filter((item) => item.category === 'point')
      };
    });

    const hasBrowser = computed(() => {
      return Boolean(store.browser);
    });

    const isExpanded = (sketchId) => !collapsedSketches.value[sketchId];

    const toggleSketch = (sketchId) => {
      collapsedSketches.value = {
        ...collapsedSketches.value,
        [sketchId]: isExpanded(sketchId)
      };
    };

    const planeLabel = (token) => `${String(token).replace('origin_', '')} plane`;

    const planeText = (plane) => {
      if (!plane) return '';
      if (plane.kind === 'Origin') return plane.originPlane;
      if (plane.kind === 'ConstructionPlane') return plane.constructionPlane;
      if (plane.kind === 'PlanarFace') return plane.face;
      return plane.kind;
    };

    const onNodeClick = (entityId) => {
      store.selectEntity(store.selectedEntityId === entityId ? null : entityId);
    };

    const onBrowserNodeClick = (entityId) => {
      if (store.pendingSketchCreation) {
        store.applyViewportPickToSketch(entityId);
        return;
      }
      if (store.pendingConstruction) {
        store.applyViewportPickToConstruction(entityId);
        return;
      }
      store.selectEntity(store.selectedEntityId === entityId ? null : entityId);
    };

    const onDelete = (entityId, kind) => {
      store.deleteEntity(entityId, kind);
    };

    const onOpenSketch = (sketchId) => {
      store.enterSketchMode(sketchId);
    };

    return {
      store,
      hasBrowser,
      constructionGroups,
      isExpanded,
      toggleSketch,
      planeLabel,
      planeText,
      onNodeClick,
      onBrowserNodeClick,
      onDelete,
      onOpenSketch
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
.setup-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Viewport visibility section in machine mode — compact, no extra padding */
.visibility-section {
  padding: 10px 14px;
  border-top: 1px solid hsla(220, 15%, 15%, 0.8);
}

.tree-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(220, 10%, 80%);
}

.browser-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.browser-folder {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.folder-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: hsl(220, 10%, 60%);
}

.folder-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 10px;
  border-left: 1px solid hsla(220, 15%, 25%, 0.4);
}

.browser-leaf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  font-size: 0.72rem;
  color: hsl(220, 10%, 82%);
  border-radius: 4px;
}

.browser-leaf.empty {
  color: hsl(220, 10%, 45%);
  font-style: italic;
}

.leaf-kind {
  color: hsl(220, 10%, 50%);
  font-size: 0.62rem;
  font-family: monospace;
}

.sketch-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  font-size: 0.72rem;
  text-align: left;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.sketch-toggle:hover {
  background-color: hsl(220, 15%, 15%);
}

.twisty {
  color: hsl(220, 10%, 55%);
  width: 10px;
}

.timeline-subtitle {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: hsl(220, 10%, 60%);
  margin-top: 4px;
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

.tree-node-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-node {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  flex-grow: 1;
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

.delete-btn,
.open-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: hsl(220, 10%, 45%);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.open-btn {
  opacity: 1;
  color: hsl(200, 100%, 60%);
}

.tree-node-row:hover .delete-btn {
  opacity: 1;
}

.open-btn:hover {
  color: hsl(200, 100%, 70%);
  border-color: hsla(200, 100%, 50%, 0.4);
  background-color: hsla(200, 100%, 50%, 0.12);
}

.delete-btn:hover {
  color: hsl(0, 85%, 68%);
  border-color: hsla(0, 85%, 65%, 0.4);
  background-color: hsla(0, 85%, 65%, 0.12);
}

.folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.visibility-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: hsl(200, 100%, 60%);
  font-size: 0.85rem;
  padding: 0 4px;
  display: flex;
  align-items: center;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.visibility-toggle.dimmed {
  color: hsl(220, 10%, 40%);
  opacity: 0.5;
}

.visibility-toggle:hover {
  color: hsl(200, 100%, 70%);
}

.browser-leaf.clickable {
  cursor: pointer;
}

.browser-leaf.clickable:hover {
  background-color: hsl(220, 15%, 15%);
}

.browser-leaf.selected {
  background-color: hsla(45, 100%, 55%, 0.1);
  color: hsl(45, 100%, 75%);
}
</style>
