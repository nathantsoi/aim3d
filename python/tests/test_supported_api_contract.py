import asyncio
import json
from types import SimpleNamespace

import numpy as np
import pytest

import adsk
import adsk.cam
import adsk.core
import adsk.fusion
import aim3d.cam as aim_cam
import aim3d.core as aim_core
from aim3d import _native


@pytest.fixture(autouse=True)
def reset_application_singleton():
    adsk.core.Application._instance = None
    yield
    adsk.core.Application._instance = None


def test_adsk_core_base_value_and_geometry_contracts():
    base = adsk.core.Base()
    real = adsk.core.ValueInput.createByReal(2.5)
    expression = adsk.core.ValueInput.createByString("5 mm")
    point = adsk.core.Point3D.create(1, 2, 3)
    vector = adsk.core.Vector3D.create(4, 5, 6)
    matrix = adsk.core.Matrix3D.create()

    assert adsk.core.Base.classType() == "adsk.core.Base"
    assert base.objectType == "adsk.core.Base"
    assert base.isValid is True
    assert real.value == 2.5
    assert real.expression == "2.5"
    assert expression.value is None
    assert expression.expression == "5 mm"
    assert point.asArray() == [1.0, 2.0, 3.0]
    assert vector.asArray() == [4.0, 5.0, 6.0]
    assert matrix.asArray() == [
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]


def test_adsk_collection_contracts_and_unsupported_add():
    first = SimpleNamespace(name="first")
    second = SimpleNamespace(name="second")
    collection = adsk.core.BaseCollection([first, second])

    assert collection.count == 2
    assert len(collection) == 2
    assert list(collection) == [first, second]
    assert collection.item(0) is first
    assert collection.item(99) is None
    assert collection.itemByName("second") is second
    assert collection[1] is second

    with pytest.raises(IndexError):
        collection[99]
    with pytest.raises(adsk.Aim3dUnsupportedFeatureError):
        collection.add(SimpleNamespace())

    object_collection = adsk.core.ObjectCollection.create()
    assert object_collection.add(first) is True
    assert object_collection.itemByName("first") is first


def test_adsk_application_document_products_and_sync_guard(tmp_path):
    app = adsk.core.Application.get()
    doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    save_path = tmp_path / "contract.a3d"

    assert app.documents.count == 1
    assert app.activeDocument is doc
    assert app.activeProduct is doc.design
    assert doc.saveAs(save_path, description="ignored", tags="ignored") is True
    assert doc.name == "contract"
    assert doc.filePath == str(save_path)
    assert doc.dataFile.filePath == str(save_path)
    assert doc.products.itemByProductType(adsk.fusion.Design.productType) is doc.design
    assert doc.products.itemByProductType(adsk.cam.CAM.productType) is adsk.cam.CAM.cast(doc)

    async def call_sync_wrapper_from_loop():
        coroutine = doc._native_doc.save_async(save_path)
        with pytest.raises(RuntimeError, match="Cannot synchronously block"):
            adsk.core._run_sync(coroutine, "aim3d.core.Document.save_async")
        coroutine.close()

    asyncio.run(call_sync_wrapper_from_loop())


def test_adsk_document_open_wraps_native_document(tmp_path):
    app = adsk.core.Application.get()
    source = app.documents.add(0)
    source_path = tmp_path / "open-source.a3d"
    assert source.saveAs(source_path)

    opened = app.documents.open(source_path, visible=False)

    assert opened.filePath == str(source_path)
    assert opened.name == "open-source"
    assert app.activeDocument is opened


def test_adsk_fusion_design_component_feature_contracts():
    native_body = SimpleNamespace(name="Body1")
    native_component = SimpleNamespace(name="Root", b_rep_bodies=[native_body])
    native_design = SimpleNamespace(root_component=native_component)
    native_doc = SimpleNamespace(file_path="fixture.a3d", design=native_design)
    document = adsk.core.Document(native_doc)
    design = adsk.fusion.Design.cast(document)
    root = design.rootComponent

    assert adsk.fusion.Design.cast(design) is design
    assert adsk.fusion.Design.cast(object()) is None
    assert design.name == "Design"
    assert root.name == "Root"
    assert root.bRepBodies.count == 1
    assert root.bRepBodies.item(0).name == "Body1"
    assert root.bRepBodies.item(0).isValid is True
    assert root.occurrences.count == 0
    assert design.occurrences is root.occurrences

    sketch_input = root.sketches.createInput("XY")
    assert sketch_input.plane == "XY"
    extrude_input = root.features.extrudeFeatures.createInput("profile", 0)
    distance = adsk.core.ValueInput.createByReal(10)
    assert extrude_input.setDistanceExtent(False, distance) is True
    assert extrude_input.distance is distance
    assert extrude_input.isSymmetric is False

    sketch = root.sketches.add(sketch_input)
    assert sketch.name == "Sketch1"

    extrude = root.features.extrudeFeatures.add(extrude_input)
    assert extrude.bodies.count == 1
    assert root.bRepBodies.count == 2

    occurrence = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    assert occurrence.name == "Occurrence1"


def test_adsk_fusion_sketch_profile_extrude_and_timeline():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    design = adsk.fusion.Design.cast(doc)
    root = design.rootComponent
    sketch = root.sketches.add(root.xYConstructionPlane)

    line = sketch.sketchCurves.sketchLines.addByTwoPoints(
        adsk.core.Point3D.create(0, 0, 0),
        adsk.core.Point3D.create(3, 0, 0),
    )
    rect = sketch.sketchCurves.sketchLines.addTwoPointRectangle(
        adsk.core.Point3D.create(0, 0, 0),
        adsk.core.Point3D.create(2, 1, 0),
    )
    circle = sketch.sketchCurves.sketchCircles.addByCenterRadius(adsk.core.Point3D.create(0, 0, 0), 2)

    assert line.endSketchPoint.geometry.asArray() == [3.0, 0.0, 0.0]
    assert rect.count == 4
    assert circle.radius == 2.0
    assert sketch.profiles.count >= 2

    distance = adsk.core.ValueInput.createByString("10 mm")
    extrude = root.features.extrudeFeatures.addSimple(
        sketch.profiles.item(0),
        distance,
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation,
    )

    assert extrude.bodies.count == 1
    assert extrude.bodies.item(0).faces.count == 6
    assert design.timeline.count == 1
    assert design.timeline.item(0).name == extrude.timelineObject.name


def test_aim3d_core_parametric_sketch_rectangle_extrude_snapshot():
    doc = aim_core.documents.create()

    # A fresh document projects an empty model.
    fresh = doc.core_state_snapshot()
    assert fresh["features"] == []
    assert fresh["viewportScene"]["solids"] == []

    sketch_token = doc.add_sketch("XY")
    assert sketch_token == "feat_Sketch_1"
    assert doc.add_rectangle(sketch_token, 0.0, 0.0, 2.0, 1.0) is True
    extrude_token = doc.add_extrude(sketch_token, 10.0)
    assert extrude_token == "feat_Extrude_1"

    snapshot = doc.core_state_snapshot()
    feature_types = [feature["type"] for feature in snapshot["features"]]
    assert feature_types == ["Sketch", "Extrude"]
    extrude_feature = snapshot["features"][1]
    assert extrude_feature["id"] == "feat_Extrude_1"
    assert extrude_feature["value"] == 10
    assert extrude_feature["selectionToken"] == "feat_Extrude_1_face_0"

    solids = snapshot["viewportScene"]["solids"]
    assert len(solids) == 1
    assert solids[0]["sourceToken"] == "feat_Extrude_1_face_0"
    assert len(solids[0]["positions"]) > 0
    assert len(solids[0]["indices"]) % 3 == 0


def test_aim3d_core_general_feature_model_snapshot_v2():
    doc = aim_core.documents.create()

    # Construction plane, then a sketch anchored to it via a plane reference.
    plane_token = doc.add_construction_plane("OffsetPlane", ["origin_XY"], 5.0)
    assert plane_token == "con_Plane_1"
    sketch_token = doc.add_sketch({"kind": "ConstructionPlane", "token": plane_token})
    assert sketch_token == "feat_Sketch_1"

    # Sketch-contained entities (line + rectangle) live inside the sketch.
    assert doc.add_sketch_entity(sketch_token, {"kind": "Line", "points": [[0, 0], [3, 0]]}) == "sk_ent_1"
    assert doc.add_rectangle(sketch_token, 0.0, 0.0, 2.0, 1.0) is True

    # Extrude evaluates a body; revolve is a schema-first stub on the timeline.
    assert doc.add_extrude(sketch_token, 10.0) == "feat_Extrude_1"
    assert doc.add_revolve(sketch_token, 90.0, "Cut") == "feat_Revolve_1"

    snapshot = doc.core_state_snapshot()
    assert snapshot["schemaVersion"] == 2
    assert [feature["type"] for feature in snapshot["features"]] == ["Sketch", "Extrude", "Revolve"]

    browser = snapshot["browser"]
    assert browser["origin"]["planes"] == ["origin_XY", "origin_XZ", "origin_YZ"]
    assert browser["construction"][0]["id"] == "con_Plane_1"
    assert browser["construction"][0]["category"] == "plane"

    sketch = browser["sketches"][0]
    assert sketch["plane"] == {"kind": "ConstructionPlane", "constructionPlane": "con_Plane_1"}
    assert [entity["kind"] for entity in sketch["entities"]] == ["Line", "Rectangle2Point"]

    revolve = snapshot["features"][2]
    assert revolve["operation"] == "Cut"

    # Only the extrude produces a renderable body.
    assert len(snapshot["viewportScene"]["solids"]) == 1
    assert len(browser["bodies"]) == 1


def test_ui_bridge_emits_core_snapshot_as_json_line():
    import io

    from aim3d import ui_bridge

    doc = aim_core.documents.create()
    sketch_token = doc.add_sketch("XY")
    doc.add_rectangle(sketch_token, 0.0, 0.0, 2.0, 1.0)
    doc.add_extrude(sketch_token, 10.0)

    stream = io.StringIO()
    line = ui_bridge.emit_snapshot(doc, stream=stream)

    assert stream.getvalue() == line + "\n"
    message = json.loads(line)
    assert message["channel"] == ui_bridge.CORE_SNAPSHOT_CHANNEL
    assert message["channel"] == "core://changed"
    assert [feature["type"] for feature in message["snapshot"]["features"]] == ["Sketch", "Extrude"]
    assert len(message["snapshot"]["viewportScene"]["solids"]) == 1


def _ws_client_recv_one(host, port, timeout=5.0):
    """Minimal browser-equivalent WebSocket client: handshake + read one text frame."""
    import base64
    import os
    import socket
    import struct

    key = base64.b64encode(os.urandom(16)).decode("ascii")
    sock = socket.create_connection((host, port), timeout=timeout)
    sock.settimeout(timeout)
    request = (
        "GET / HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(request.encode("ascii"))

    buffer = b""

    def read_more():
        nonlocal buffer
        chunk = sock.recv(4096)
        if not chunk:
            raise AssertionError("server closed before sending a frame")
        buffer += chunk

    # Consume the handshake response.
    while b"\r\n\r\n" not in buffer:
        read_more()
    assert b"101 Switching Protocols" in buffer.split(b"\r\n", 1)[0]
    buffer = buffer.split(b"\r\n\r\n", 1)[1]

    # Read one (unmasked, server->client) text frame.
    while len(buffer) < 2:
        read_more()
    length = buffer[1] & 0x7F
    consumed = 2
    if length == 126:
        while len(buffer) < 4:
            read_more()
        length = struct.unpack(">H", buffer[2:4])[0]
        consumed = 4
    elif length == 127:
        while len(buffer) < 10:
            read_more()
        length = struct.unpack(">Q", buffer[2:10])[0]
        consumed = 10
    while len(buffer) < consumed + length:
        read_more()
    payload = buffer[consumed:consumed + length]
    sock.close()
    return payload.decode("utf-8")


def test_ui_bridge_serves_snapshot_over_websocket():
    from aim3d import ui_bridge

    doc = aim_core.documents.create()
    sketch_token = doc.add_sketch("XY")
    doc.add_rectangle(sketch_token, 0.0, 0.0, 2.0, 1.0)
    doc.add_extrude(sketch_token, 10.0)

    server = ui_bridge.LiveServer("127.0.0.1", 0)
    try:
        sent = server.push(doc)
        # A GUI that connects after the push still gets the cached latest frame.
        received = _ws_client_recv_one("127.0.0.1", server.port)
    finally:
        server.close()

    assert received == sent
    message = json.loads(received)
    assert [feature["type"] for feature in message["features"]] == ["Sketch", "Extrude"]
    assert len(message["viewportScene"]["solids"]) == 1


def test_ui_bridge_endpoint_honors_env(monkeypatch):
    from aim3d import ui_bridge

    monkeypatch.setenv(ui_bridge.BRIDGE_HOST_ENV, "10.0.0.5")
    monkeypatch.setenv(ui_bridge.BRIDGE_WS_PORT_ENV, "9999")
    assert ui_bridge.bridge_endpoint() == ("10.0.0.5", 9999)


def test_adsk_fusion_workflow_writes_through_to_core_snapshot():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    design = adsk.fusion.Design.cast(doc)
    root = design.rootComponent

    sketch = root.sketches.add(root.xYConstructionPlane)
    sketch.sketchCurves.sketchLines.addTwoPointRectangle(
        adsk.core.Point3D.create(0, 0, 0),
        adsk.core.Point3D.create(2, 1, 0),
    )
    root.features.extrudeFeatures.addSimple(
        sketch.profiles.item(0),
        adsk.core.ValueInput.createByString("10 mm"),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation,
    )

    # The Fusion-compatible facade mutated the native core (source of truth),
    # so the core snapshot reflects the timeline and generated solid.
    snapshot = doc._state.native_doc.core_state_snapshot()
    assert [feature["type"] for feature in snapshot["features"]] == ["Sketch", "Extrude"]
    assert len(snapshot["viewportScene"]["solids"]) == 1


def test_aim3d_native_sketch_solver_binding():
    result = aim_core.solve_sketch_2d(
        points=[
            {"id": 1, "x": 0.0, "y": 0.0, "fixed": True},
            {"id": 2, "x": 4.0, "y": 0.0, "fixed": False},
        ],
        entities=[
            {"id": 101, "type": 0, "point_a_id": 1},
            {"id": 102, "type": 0, "point_a_id": 2},
        ],
        constraints=[
            {"type": 1, "entity_a_id": 101, "entity_b_id": 102, "value": 5.0},
        ],
    )

    assert result.status == 0
    assert result.points[1].x == pytest.approx(5.0, abs=1.0e-5)


def test_adsk_cam_setup_operation_contracts():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    cam = adsk.cam.CAM.cast(doc)
    setup = cam.setups.itemByName("Setup1")
    operation = setup.operations.itemByName("Pocket1")

    assert adsk.cam.CAM.cast(cam) is cam
    assert adsk.cam.CAM.cast(object()) is None
    assert cam.name == "CAM"
    assert setup.name == "Setup1"
    assert setup.createOperationInput("milling").operationType == "milling"
    assert setup.operations.item(0) is operation
    assert operation.name == "Pocket1"
    assert operation.generateToolpath() is True
    assert "G1" in setup.postProcess()
    assert cam.setups.createInput().operationType == "milling"

    new_setup = cam.setups.add(cam.setups.createInput())
    assert new_setup.name == "Setup"
    new_operation = setup.operations.add(setup.createOperationInput("milling"))
    assert new_operation.name == "milling"


def test_adsk_cam_milling_workflow_facade():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    cam = adsk.cam.CAM.cast(doc)
    manager = adsk.cam.CAMManager.get()
    tools = manager.libraryManager.toolLibraries.toolLibraryAtURL(
        adsk.core.URL.create("systemlibraryroot://Samples/Milling Tools (Metric).json")
    )
    tool = tools.item(0)

    setup_input = cam.setups.createInput(adsk.cam.OperationTypes.MillingOperation)
    setup = cam.setups.add(setup_input)
    setup.parameters.itemByName("job_stockOffsetTop").expression = "2 mm"
    assert setup.parameters.itemByName("job_stockOffsetTop").expression == "2 mm"

    operation_input = setup.operations.createInput("face")
    operation_input.tool = tool
    operation_input.parameters.itemByName("tolerance").expression = "0.01 mm"
    operation = setup.operations.add(operation_input)
    future = cam.generateToolpath(operation)
    assert future.isGenerationCompleted is True

    nc_input = cam.ncPrograms.createInput()
    nc_input.operations = [operation]
    program = cam.ncPrograms.add(nc_input)
    assert program.postProcess(adsk.cam.NCProgramPostProcessOptions.create()) is True


def test_aim3d_core_document_async_mesh_and_release(tmp_path):
    async def run():
        doc = aim_core.documents.create()
        save_path = tmp_path / "async-contract.a3d"
        assert doc.file_path == "Untitled.a3d"
        assert doc.design.root_component.name == "RootComponent"
        assert await doc.save_async(save_path) is True
        assert doc.file_path == str(save_path)
        assert await doc.recompute_async() is True
        assert await doc.inspect_bodies_async() is True
        opened = await aim_core.documents.open_async(save_path)
        assert opened.file_path == str(save_path)
        return doc, opened

    doc, opened = asyncio.run(run())
    body = doc.design.root_component.b_rep_bodies[0]
    vertices_buffer = body.get_vertices_tensor()
    positions = np.asarray(doc.meshes.positions())
    normals = np.asarray(doc.meshes.normals())
    colors = np.asarray(doc.meshes.colors())
    indices = np.asarray(doc.meshes.indices())

    assert np.asarray(vertices_buffer).shape == (3, 3)
    assert positions.shape[1] == 3
    assert normals.shape[1] == 3
    assert colors.shape[1] == 4
    assert indices.shape[1] == 3

    vertices_buffer.release()
    with pytest.raises(_native.NativeError, match="released"):
        np.asarray(vertices_buffer)

    body.release()
    doc.release()
    opened.release()


def test_aim3d_cam_async_toolpath_post_and_release():
    async def run():
        operation = aim_cam.Operation("ContractPocket")
        assert await operation.generate_toolpath_async() is True
        toolpath = np.asarray(operation.get_toolpath_tensor())
        post = await aim_cam.Setup("ContractSetup").post_process_async()
        operation.release()
        return toolpath, post

    toolpath, post = asyncio.run(run())

    assert toolpath.shape == (4, 5)
    assert toolpath.dtype == np.float64
    assert "G1" in post


def test_native_errors_for_missing_handles(monkeypatch):
    monkeypatch.setattr(aim_core.Document, "__del__", lambda self: None)
    monkeypatch.setattr(aim_core.BRepBody, "__del__", lambda self: None)
    monkeypatch.setattr(_native.NativeBuffer, "__del__", lambda self: None)
    monkeypatch.setattr(_native.NativeTask, "__del__", lambda self: None)

    with pytest.raises(_native.NativeError, match="Missing native document handle"):
        aim_core.Document(None)
    with pytest.raises(_native.NativeError, match="Missing native body handle"):
        aim_core.BRepBody(None)
    with pytest.raises(_native.NativeError, match="Native buffer allocation failed"):
        _native.NativeBuffer(None)
    with pytest.raises(_native.NativeError, match="Native task allocation failed"):
        _native.NativeTask(None)
