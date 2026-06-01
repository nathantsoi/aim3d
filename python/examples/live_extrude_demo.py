"""Live GUI demo: drive the model from Python and watch the desktop app update.

Prerequisites (two terminals):
  1. Build the native core so `aim3d.core` can load:
         cd aim3d && make build-core            # (or the OCCT-off cmake build)
  2. Launch the desktop app:
         cd aim3d && make run

Then run this script:
         cd aim3d/python && python3 examples/live_extrude_demo.py

This process hosts a WebSocket server that the GUI connects to directly (no
broker). It creates a document, adds a sketch, draws a rectangle, and extrudes
it, pushing the core-state snapshot after each step; the GUI projects each one,
so the timeline and viewport populate step by step. The core is the single
source of truth; the UI only projects what the core reports. The server stays
up at the end so the model stays live in the GUI -- press Ctrl+C to stop.
"""

import time

import adsk.core
import adsk.fusion
from aim3d import ui_bridge


def main(pause_seconds: float = 1.5) -> None:
    app = adsk.core.Application.get()
    doc = app.documents.add(0)
    design = adsk.fusion.Design.cast(doc)
    root = design.rootComponent
    native_doc = doc._state.native_doc

    server = ui_bridge.serve()
    print(f"[demo] GUI WebSocket server on ws://{server.host}:{server.port}")

    server.push(native_doc)
    print("[demo] new document -> empty timeline/viewport")
    time.sleep(pause_seconds)

    sketch = root.sketches.add(root.xYConstructionPlane)
    server.push(native_doc)
    print("[demo] added sketch")
    time.sleep(pause_seconds)

    sketch.sketchCurves.sketchLines.addTwoPointRectangle(
        adsk.core.Point3D.create(0, 0, 0),
        adsk.core.Point3D.create(2, 1, 0),
    )
    server.push(native_doc)
    print("[demo] drew rectangle profile")
    time.sleep(pause_seconds)

    root.features.extrudeFeatures.addSimple(
        sketch.profiles.item(0),
        adsk.core.ValueInput.createByString("10 mm"),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation,
    )
    server.push(native_doc)
    print("[demo] extruded solid -> Extrude feature + body now in the GUI")

    print("[demo] model is live; press Ctrl+C to stop the server.")
    server.wait_forever()


if __name__ == "__main__":
    main()
