import { defineStore } from 'pinia';

export const useCoreStore = defineStore('core', {
  state: () => ({
    activeDocumentId: 'doc_1001',
    documentPath: 'Untitled.a3d',
    features: [
      { id: 'feat_Sketch_1', type: 'Sketch', value: 0.0, isDirty: false },
      { id: 'feat_Extrude_1', type: 'Extrude', value: 10.0, isDirty: false },
      { id: 'feat_Fillet_1', type: 'Fillet', value: 2.0, isDirty: false }
    ],
    selectedEntityId: null, // Stable entity ID mapped via TNP
    operations: [
      { id: 'op_Pocket_1', type: 'Pocket2D', toolDiameter: 6.0, stepover: 2.4, status: 'Stale' }
    ],
    gcode: '; No code posted',
    isSimulating: false,
    simulationStats: { collisions: 0, materialRemoved: 0.0 }
  }),

  actions: {
    selectEntity(entityId) {
      this.selectedEntityId = entityId;
      console.log(`[Frontend Store] Selection updated: ${entityId}`);
    },

    updateFeatureParameter(featureId, value) {
      const feat = this.features.find(f => f.id === featureId);
      if (feat) {
        feat.value = value;
        feat.isDirty = true;
        console.log(`[Frontend Store] Feature ${featureId} marked dirty. Parameter: ${value}`);
      }
    },

    async triggerParametricRecompute() {
      console.log('[Frontend Store] Sending recompute command to Headless Core FFI...');
      // Simulates FFI recompute sweep
      await new Promise(resolve => setTimeout(resolve, 150));
      
      this.features.forEach(f => { f.isDirty = false; });
      console.log('[Frontend Store] Core parametric sweep complete. Layout stabilized.');
    },

    async runCAMGeneration(opId) {
      console.log(`[Frontend Store] Launching thread workers for offset generation: ${opId}`);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const op = this.operations.find(o => o.id === opId);
      if (op) {
        op.status = 'Ready';
      }
      this.gcode = (
        `; aim3d Posted G-code for ${opId}\n` +
        `T1 M6\n` +
        `G0 X0 Y0 Z10\n` +
        `G1 X12 Y8 Z-2 F800\n` +
        `G1 X24 Y8 Z-2\n` +
        `M30\n`
      );
      console.log('[Frontend Store] CAM offsets generated. G-code posted.');
    },

    async executeSimulation() {
      this.isSimulating = true;
      console.log('[Frontend Store] Running volumetric Taichi SDF subtraction loop...');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      this.isSimulating = false;
      this.simulationStats = { collisions: 0, materialRemoved: 1420.5 };
      console.log('[Frontend Store] Taichi sweep complete. VRAM status: OK.');
    }
  }
});
