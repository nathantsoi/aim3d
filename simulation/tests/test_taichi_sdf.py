import sys
import os
# Allow importing from sibling directories
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from taichi_sdf_engine import TaichiSdfEngine, simulate_toolpath_sdf
import numpy as np

def test_taichi_simulation():
    # 1. Instantiate the Engine
    engine = TaichiSdfEngine(resolution=(128, 128, 128))
    assert engine.resolution == (128, 128, 128)
    
    # 2. Run mock subtractive sweep
    metrics = engine.run_subtractive_step(
        cutter_pos_start=(0.0, 0.0, 10.0),
        cutter_pos_end=(10.0, 0.0, 10.0),
        cutter_radius=2.0
    )
    assert metrics["removed_volume"] > 0
    assert not metrics["holder_collision"]
    
    # 3. Test differentiable loss calculation
    target = np.array([0.1, 0.2, 0.3])
    current = np.array([0.12, 0.18, 0.32])
    
    loss, grads = engine.compute_differentiable_loss(target, current)
    assert loss > 0
    assert grads.shape == (3,)
    
    # 4. End-to-end simulation helper check
    toolpath = [(0.0, 0.0, 0.0), (10.0, 10.0, 0.0), (20.0, 10.0, -5.0)]
    report = simulate_toolpath_sdf(toolpath)
    assert report["status"] == "VALID"
    assert report["collisions_detected"] == 0
    
    print("[Python Test] Volumetric Taichi SDF Simulation validation successful!")

if __name__ == "__main__":
    test_taichi_simulation()
