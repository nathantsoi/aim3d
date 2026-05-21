import adsk.core
import adsk.fusion
import adsk.cam
import pytest

def test_fusion_facade():
    # 1. Retrieve the singleton Application
    app = adsk.core.Application.get()
    assert app is not None
    
    # 2. Check Graceful Headless Degradation
    assert app.userInterface is None # Headless returns None
    
    # 3. Create a Document
    doc = app.documents.add(0) # 0 is standard design doc
    assert doc is not None
    assert app.documents.count == 1
    
    # 4. Traverse collection index
    active_doc = app.activeDocument
    assert active_doc == doc
    
    # 5. Unsupported Feature Gating test
    with pytest.raises(adsk.Aim3dUnsupportedFeatureError) as excinfo:
        app.execute_macro("run_monolithic_gui_loop()")
    assert "is not supported by aim3d" in str(excinfo.value)
    
    print("[Python Test] Legacy Fusion compatibility facade validation successful!")

if __name__ == "__main__":
    test_fusion_facade()
