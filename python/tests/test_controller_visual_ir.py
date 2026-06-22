import pytest

from aim3d.controller import (
    Tool,
    VisualIRValidationError,
    VisualProgramBuilder,
    assert_valid_visual_ir,
    compile_visual_ir_to_gcode,
    validate_visual_ir,
    simulate_program_mesh,
)
from aim3d.daemon import Aim3dCncDaemon, ControllerClient


def sample_visual_ir():
    program = (
        VisualProgramBuilder()
        .tool(Tool(id=1, kind="flat_endmill", diameter_mm=6.0, flute_count=3))
        .pocket(
            "op-pocket",
            tool_id=1,
            boundary=[(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)],
            target_depth_mm=-2.0,
            feed_rate_mm_min=600.0,
            spindle_rpm=8000.0,
        )
        .build()
    )
    return program.to_dict()


def test_visual_ir_schema_like_validation_and_compile():
    document = sample_visual_ir()

    assert validate_visual_ir(document) == []
    assert_valid_visual_ir(document)
    gcode = compile_visual_ir_to_gcode(document)

    assert "G21" in gcode
    assert "G54" in gcode
    assert "T1 M6" in gcode
    assert "G1 Z-2 F600" in gcode
    assert gcode.endswith("M30\n")


def test_visual_ir_rejects_missing_tool_and_unsafe_operation():
    document = sample_visual_ir()
    document["operations"][0]["tool_id"] = 99
    document["operations"][0]["safe_z_mm"] = -3.0

    errors = validate_visual_ir(document)
    assert any("missing tool 99" in error for error in errors)
    assert any("safe_z_mm" in error for error in errors)
    with pytest.raises(VisualIRValidationError):
        assert_valid_visual_ir(document)


def test_daemon_session_accepts_visual_ir_and_commands():
    daemon = Aim3dCncDaemon()
    loaded = daemon.handle("POST", "/program/visual-ir", {"program": sample_visual_ir()})
    assert loaded["programLoaded"] is True

    armed = daemon.handle("POST", "/command/arm")
    assert armed["state"] == "armed"
    running = daemon.handle("POST", "/command/start")
    assert running["state"] == "running"
    paused = daemon.handle("POST", "/command/pause")
    assert paused["state"] == "feed_hold"
    simulated = daemon.handle("POST", "/command/simulate")
    assert simulated["simulation"]["path"] == "posted-gcode"


def test_controller_client_request_shapes_and_transport():
    calls = []

    def transport(method, path, payload):
        calls.append((method, path, payload))
        return {"ok": True, "path": path}

    client = ControllerClient(base_url="http://controller.local", transport=transport)
    shape = client.request_shape("POST", "/command/jog", {"x": 1})
    assert shape == {
        "method": "POST",
        "url": "http://controller.local/command/jog",
        "json": {"x": 1},
    }

    result = client.jog(x=1.0, y=2.0, z=0.0)
    assert result["ok"] is True
    assert calls == [("POST", "/command/jog", {"x": 1.0, "y": 2.0, "z": 0.0})]


def test_lightweight_simulator_mesh(record_meshes):
    gcode = (
        "G21 G90\n"
        "T1 M6\n"
        "G0 X10 Y10 Z5\n"
        "G1 X90 Y10 Z-2 F600\n"
        "M30\n"
    )
    tools = [{"id": 1, "diameter_mm": 6.0, "kind": "flat_endmill"}]
    mesh = simulate_program_mesh(gcode, (100.0, 100.0, 25.0), tools, 10)
    
    assert "positions" in mesh
    assert "normals" in mesh
    assert "indices" in mesh
    assert len(mesh["positions"]) > 0

    if record_meshes:
        import os
        from pathlib import Path
        from mesh_utils import write_obj_mesh
        records_dir = Path(__file__).resolve().parents[1] / "test_artifacts" / "obj"
        records_dir.mkdir(parents=True, exist_ok=True)
        write_obj_mesh(str(records_dir / "test_lightweight_simulator_mesh.obj"), mesh)
