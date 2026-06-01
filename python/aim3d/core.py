import asyncio
import json
from types import SimpleNamespace

from . import _native


class BRepBody:
    def __init__(self, handle, owner=None):
        if not handle:
            raise _native.NativeError("Missing native body handle")
        self._handle = handle
        self._owner = owner

    @property
    def name(self):
        raw = _native.body_name(self._handle)
        return raw.decode("utf-8") if raw else ""

    def get_vertices_tensor(self):
        """
        Return a native-owned zero-copy-compatible vertex buffer as float32 Nx3.
        The returned object implements NumPy's array protocol and owns the
        native buffer until release or garbage collection.
        """
        return _native.NativeBuffer(_native.body_vertices(self._handle))

    def release(self):
        if self._handle:
            _native.body_release(self._handle)
            self._handle = None

    def __del__(self):
        self.release()


class MeshBuffers:
    def __init__(self, document):
        self._document = document

    def positions(self):
        return _native.NativeBuffer(_native.document_mesh_positions(self._document._handle))

    def normals(self):
        return _native.NativeBuffer(_native.document_mesh_normals(self._document._handle))

    def colors(self):
        return _native.NativeBuffer(_native.document_mesh_colors(self._document._handle))

    def indices(self):
        return _native.NativeBuffer(_native.document_mesh_indices(self._document._handle))


class Component:
    def __init__(self, document, name="RootComponent"):
        self._document = document
        self._name = name

    @property
    def name(self):
        return self._name

    @property
    def b_rep_bodies(self):
        count = _native.document_body_count(self._document._handle)
        handles = [_native.document_body_at(self._document._handle, index) for index in range(count)]
        if not handles:
            handles = [_native.document_preview_body(self._document._handle)]
        return [BRepBody(handle, owner=self._document) for handle in handles if handle]


class DesignProduct:
    def __init__(self, document):
        self._root_component = Component(document)

    @property
    def root_component(self):
        return self._root_component


class Document:
    def __init__(self, handle, path="Untitled.a3d"):
        if not handle:
            raise _native.NativeError("Missing native document handle")
        self._handle = handle
        self._file_path = path
        self._design = DesignProduct(self)
        self.meshes = MeshBuffers(self)

    @property
    def file_path(self):
        return self._file_path

    @property
    def design(self):
        return self._design

    async def save_async(self, path):
        def save():
            if _native.document_save(self._handle, _native._encode_path(path)) != 1:
                raise _native.NativeError(f"Failed to save document: {path}")
            return True

        result = await asyncio.to_thread(save)
        self._file_path = str(path)
        return result

    async def import_geometry_async(self, path):
        task = _native.NativeTask(_native.document_import_geometry_task(self._handle, _native._encode_path(path)))
        try:
            await asyncio.to_thread(task.wait)
            return True
        finally:
            task.release()

    async def inspect_bodies_async(self):
        task = _native.NativeTask(_native.document_inspect_bodies_task(self._handle))
        try:
            await asyncio.to_thread(task.wait)
            return True
        finally:
            task.release()

    async def recompute_async(self):
        def recompute():
            if _native.document_recompute(self._handle) != 1:
                raise _native.NativeError("Failed to recompute document")
            return True

        return await asyncio.to_thread(recompute)

    def add_sketch(self, plane="XY"):
        """
        Create a sketch and return its stable feature token.

        ``plane`` is either a string origin plane ("XY"/"XZ"/"YZ") or a dict
        plane reference, e.g. ``{"kind": "ConstructionPlane", "token": "con_Plane_1"}``
        or ``{"kind": "PlanarFace", "token": "body_1_face_3"}``.
        """
        if isinstance(plane, dict):
            kind = plane.get("kind", "Origin")
            origin = plane.get("originPlane", plane.get("origin_plane", "XY"))
            ref_token = plane.get("token", plane.get("ref", ""))
        else:
            kind = "Origin"
            origin = plane or "XY"
            ref_token = ""
        token = _native.consume_string(
            _native.document_add_sketch_on_plane(
                self._handle,
                _native._encode_path(kind),
                _native._encode_path(origin),
                _native._encode_path(ref_token),
            )
        )
        if token is None:
            raise _native.NativeError("Failed to add sketch to document")
        return token

    def add_rectangle(self, sketch_token, x0, y0, x1, y1):
        """Add an axis-aligned rectangle profile to the identified sketch."""
        result = _native.document_add_rectangle(
            self._handle,
            _native._encode_path(sketch_token),
            float(x0),
            float(y0),
            float(x1),
            float(y1),
        )
        return result == 1

    def add_sketch_entity(self, sketch_token, entity):
        """
        Add a generic sketch element and return its token.

        ``entity`` is a dict like ``{"kind": "Line", "points": [[0, 0], [3, 0]],
        "radius": 0.0, "value": 0.0, "construction": False}``.
        """
        points = entity.get("points", []) or []
        flat = [float(coord) for point in points for coord in (point[0], point[1])]
        point_count = len(flat) // 2
        array_type = _native.c_double * len(flat)
        buffer = array_type(*flat) if flat else None
        token = _native.consume_string(
            _native.document_add_sketch_entity(
                self._handle,
                _native._encode_path(sketch_token),
                _native._encode_path(entity.get("kind", "Line")),
                buffer,
                point_count,
                float(entity.get("radius", 0.0)),
                float(entity.get("value", 0.0)),
                1 if entity.get("construction", False) else 0,
            )
        )
        if token is None:
            raise _native.NativeError("Failed to add sketch entity")
        return token

    def add_solid_feature(self, kind, sketch_token, value=0.0, operation="NewBody"):
        """
        Add a solid feature of any kind referencing a sketch profile.

        Only ``Extrude`` over a rectangle profile evaluates to geometry today;
        other kinds (Revolve/Sweep/Loft/...) are recorded as timeline stubs.
        """
        token = _native.consume_string(
            _native.document_add_solid_feature(
                self._handle,
                _native._encode_path(kind),
                _native._encode_path(sketch_token),
                float(value),
                _native._encode_path(operation),
            )
        )
        if token is None:
            raise _native.NativeError(f"Failed to add solid feature: {kind}")
        return token

    def add_extrude(self, sketch_token, distance, operation="NewBody"):
        """Extrude the sketch's rectangle into a solid; return the feature token."""
        return self.add_solid_feature("Extrude", sketch_token, distance, operation)

    def add_revolve(self, sketch_token, angle=360.0, operation="NewBody"):
        """Record a revolve feature (stub evaluator); return the feature token."""
        return self.add_solid_feature("Revolve", sketch_token, angle, operation)

    def add_sweep(self, sketch_token, value=0.0, operation="NewBody"):
        """Record a sweep feature (stub evaluator); return the feature token."""
        return self.add_solid_feature("Sweep", sketch_token, value, operation)

    def add_loft(self, sketch_token, value=0.0, operation="NewBody"):
        """Record a loft feature (stub evaluator); return the feature token."""
        return self.add_solid_feature("Loft", sketch_token, value, operation)

    def add_construction_plane(self, kind="OffsetPlane", inputs=(), value=0.0):
        """Register a construction plane/axis/point; return its token."""
        inputs_csv = ",".join(str(token) for token in (inputs or []))
        token = _native.consume_string(
            _native.document_add_construction(
                self._handle,
                _native._encode_path(kind),
                _native._encode_path(inputs_csv),
                float(value),
            )
        )
        if token is None:
            raise _native.NativeError(f"Failed to add construction object: {kind}")
        return token

    add_construction = add_construction_plane

    def add_construction_axis(self, kind="AxisThroughTwoPoints", inputs=(), value=0.0):
        """Register a construction axis; return its token."""
        return self.add_construction(kind, inputs, value)

    def add_construction_point(self, kind="PointAtVertex", inputs=(), value=0.0):
        """Register a construction point; return its token."""
        return self.add_construction(kind, inputs, value)

    def core_state_snapshot(self):
        """Return the document's flat core-state snapshot (the UI projection)."""
        raw = _native.consume_string(_native.document_core_state_snapshot(self._handle))
        if raw is None:
            raise _native.NativeError("Failed to read core-state snapshot")
        return json.loads(raw)

    def release(self):
        if self._handle:
            _native.document_release(self._handle)
            self._handle = None

    def __del__(self):
        self.release()


class DocumentsCollection:
    def __init__(self):
        self._docs = []

    def open(self, path):
        handle = _native.document_open(_native._encode_path(path))
        doc = Document(handle, str(path))
        self._docs.append(doc)
        return doc

    async def open_async(self, path):
        return await asyncio.to_thread(self.open, path)

    def create(self):
        doc = Document(_native.document_create())
        self._docs.append(doc)
        return doc


documents = DocumentsCollection()


def _field(value, name, default=None):
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def solve_sketch_2d(points, entities=(), constraints=(), options=None):
    """
    Solve a small 2D sketch system through the native stateless sketch solver.

    Points are dict-like objects with id/x/y/fixed fields. Entities use
    type 0=point, 1=line, 2=circle. Constraints use type 0=coincident,
    1=distance, 2=tangent, 3=fixed.
    """
    point_array = (_native.SketchPointC * len(points))()
    for index, point in enumerate(points):
        point_array[index] = _native.SketchPointC(
            int(_field(point, "id")),
            float(_field(point, "x")),
            float(_field(point, "y")),
            int(bool(_field(point, "fixed", False))),
        )

    entity_array = (_native.SketchEntityC * len(entities))()
    for index, entity in enumerate(entities):
        entity_array[index] = _native.SketchEntityC(
            int(_field(entity, "id")),
            int(_field(entity, "type", 0)),
            int(_field(entity, "point_a_id", -1)),
            int(_field(entity, "point_b_id", -1)),
            int(_field(entity, "center_point_id", -1)),
            float(_field(entity, "radius", 0.0)),
        )

    constraint_array = (_native.SketchConstraintC * len(constraints))()
    for index, constraint in enumerate(constraints):
        constraint_array[index] = _native.SketchConstraintC(
            int(_field(constraint, "type", 0)),
            int(_field(constraint, "entity_a_id")),
            int(_field(constraint, "entity_b_id", -1)),
            float(_field(constraint, "value", 0.0)),
        )

    options = options or {}
    option_struct = _native.SketchSolveOptionsC(
        int(_field(options, "max_iterations", 80)),
        float(_field(options, "tolerance", 1.0e-8)),
        float(_field(options, "finite_difference_step", 1.0e-6)),
        float(_field(options, "damping", 1.0e-8)),
    )
    result = _native.SketchSolveResultC()
    status = _native.solve_sketch_2d_raw(
        point_array,
        len(points),
        entity_array,
        len(entities),
        constraint_array,
        len(constraints),
        option_struct,
        result,
    )
    if status == 2:
        raise _native.NativeError("Native sketch solve failed")
    solved = [
        SimpleNamespace(id=point_array[index].id, x=point_array[index].x, y=point_array[index].y, fixed=bool(point_array[index].fixed))
        for index in range(len(points))
    ]
    return SimpleNamespace(
        status=result.status,
        points=solved,
        is_fully_constrained=bool(result.is_fully_constrained),
        degrees_of_freedom=result.degrees_of_freedom,
        iterations=result.iterations,
        residual_error=result.residual_error,
        warning_count=result.warning_count,
        message=bytes(result.message).split(b"\0", 1)[0].decode("utf-8"),
    )
