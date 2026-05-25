import asyncio
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

    with pytest.raises(adsk.Aim3dUnsupportedFeatureError):
        root.sketches.add(sketch_input)
    with pytest.raises(adsk.Aim3dUnsupportedFeatureError):
        root.features.extrudeFeatures.add(extrude_input)
    with pytest.raises(adsk.Aim3dUnsupportedFeatureError):
        root.occurrences.addNewComponent(adsk.core.Matrix3D.create())


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

    with pytest.raises(adsk.Aim3dUnsupportedFeatureError):
        cam.setups.add(cam.setups.createInput())
    with pytest.raises(adsk.Aim3dUnsupportedFeatureError):
        setup.operations.add(setup.createOperationInput("milling"))


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
