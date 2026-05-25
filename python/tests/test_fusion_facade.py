import pytest

import adsk
import adsk.cam
import adsk.core
import adsk.fusion


@pytest.fixture(autouse=True)
def reset_application_singleton():
    adsk.core.Application._instance = None
    yield
    adsk.core.Application._instance = None


def test_application_zero_document_and_headless_ui():
    app = adsk.core.Application.get()

    assert app is adsk.core.Application.get()
    assert app.userInterface is None
    assert app.activeDocument is None
    assert app.activeProduct is None
    assert app.documents.count == 0


def test_document_lifecycle_products_and_save(tmp_path):
    app = adsk.core.Application.get()
    doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    output_path = tmp_path / "macro-compatible.a3d"

    assert doc.saveAs(output_path, "compatibility test", "c2")
    assert doc.name == "macro-compatible"
    assert doc.dataFile.name == "macro-compatible"
    assert doc.dataFile.filePath == str(output_path)
    assert app.activeDocument is doc
    assert app.activeProduct is adsk.fusion.Design.cast(doc)

    products = doc.products
    assert products.count == 2
    assert products.itemByName("Design") is adsk.fusion.Design.cast(doc)
    assert products.itemByProductType("CAMProductType") is adsk.cam.CAM.cast(doc)


def test_collection_semantics_are_stable():
    collection = adsk.core.ObjectCollection.create()
    first = adsk.core.Point3D.create(1, 2, 3)
    second = adsk.core.Vector3D.create(4, 5, 6)
    first.name = "first"

    assert collection.add(first)
    assert collection.add(second)
    assert collection.count == 2
    assert collection.item(0) is first
    assert collection.item(99) is None
    assert collection.itemByName("first") is first
    assert collection.itemByName("missing") is None
    assert list(collection) == [first, second]
    assert collection[1] is second


def test_design_hierarchy_binds_to_active_document():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    design = adsk.fusion.Design.cast(doc)

    assert design is not None
    assert design.productType == "DesignProductType"
    assert design.rootComponent.name == "RootComponent"
    assert design.rootComponent.bRepBodies.count >= 1
    assert design.rootComponent.bRepBodies.item(0).isValid
    assert design.rootComponent.occurrences.count == 0
    assert design.rootComponent.sketches.count == 0


def test_cam_facade_wraps_current_native_setup():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    cam = adsk.cam.CAM.cast(doc)
    setup = cam.setups.itemByName("Setup1")
    operation = setup.operations.itemByName("Pocket1")

    assert cam.name == "CAM"
    assert setup is not None
    assert operation is not None
    assert operation.generateToolpath() is True
    assert "G1" in setup.postProcess()


def test_fusion_style_macro_fixture_runs_headlessly():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    body_names = [body.name for body in root.bRepBodies]

    assert app.userInterface is None
    assert doc.products.itemByName("Design") is design
    assert body_names


def test_unsupported_feature_errors_are_structured():
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    root = adsk.fusion.Design.cast(doc).rootComponent
    sketch_input = root.sketches.createInput("XYConstructionPlane")
    setup_input = adsk.cam.CAM.cast(doc).setups.createInput()

    assert sketch_input.plane == "XYConstructionPlane"
    assert setup_input.operationType == "milling"

    with pytest.raises(adsk.Aim3dUnsupportedFeatureError) as macro_error:
        app.execute_macro("run_monolithic_gui_loop()")
    assert macro_error.value.feature_name == "Imperative Macro Executions"
    assert macro_error.value.alternative == "aim3d.core JSON-Schema Commands"

    with pytest.raises(adsk.Aim3dUnsupportedFeatureError) as sketch_error:
        root.sketches.add(sketch_input)
    assert sketch_error.value.feature_name == "Sketches.add"
    assert sketch_error.value.alternative == "aim3d.core sketch solver APIs"

    with pytest.raises(adsk.Aim3dUnsupportedFeatureError) as setup_error:
        adsk.cam.CAM.cast(doc).setups.add(setup_input)
    assert setup_error.value.feature_name == "Setups.add"
    assert setup_error.value.alternative == "aim3d.cam setup construction APIs"
