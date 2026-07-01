import ctypes
import sys
from pathlib import Path

import numpy as np


FLOAT32 = 1
FLOAT64 = 2
UINT32 = 3


def _library_names():
    if sys.platform == "darwin":
        return ["libaim3d_core.dylib", "libaim3d_core.0.1.0.dylib"]
    if sys.platform.startswith("win"):
        return ["aim3d_core.dll"]
    return ["libaim3d_core.so", "libaim3d_core.so.1"]


def _candidate_library_paths():
    here = Path(__file__).resolve()
    roots = [here.parents[2], here.parents[3]]
    for root in roots:
        for name in _library_names():
            yield root / "build" / "lib" / name
            yield root / "build" / "core" / name


def _load_library():
    errors = []
    for path in _candidate_library_paths():
        if not path.exists():
            continue
        try:
            return ctypes.CDLL(str(path))
        except OSError as exc:
            errors.append(f"{path}: {exc}")
    searched = "\n".join(str(path) for path in _candidate_library_paths())
    details = "\n".join(errors)
    raise RuntimeError(
        "Unable to load aim3d native core library. Run `cd aim3d && make build-core` first.\n"
        f"Searched:\n{searched}\n{details}"
    )


lib = _load_library()


def _bind(name, restype, argtypes):
    fn = getattr(lib, name)
    fn.restype = restype
    fn.argtypes = argtypes
    return fn


c_void_p = ctypes.c_void_p
c_char_p = ctypes.c_char_p
c_size_t = ctypes.c_size_t
c_int = ctypes.c_int
c_uint64 = ctypes.c_uint64
c_double = ctypes.c_double

document_create = _bind("aim3d_document_create", c_void_p, [])
document_open = _bind("aim3d_document_open", c_void_p, [c_char_p])
document_release = _bind("aim3d_document_release", None, [c_void_p])
document_save = _bind("aim3d_document_save", c_int, [c_void_p, c_char_p])
document_import_geometry = _bind("aim3d_document_import_geometry", c_int, [c_void_p, c_char_p])
document_recompute = _bind("aim3d_document_recompute", c_int, [c_void_p])
document_add_sketch = _bind("aim3d_document_add_sketch", c_void_p, [c_void_p, c_char_p])
document_add_sketch_on_plane = _bind(
    "aim3d_document_add_sketch_on_plane",
    c_void_p,
    [c_void_p, c_char_p, c_char_p, c_char_p],
)
document_add_rectangle = _bind(
    "aim3d_document_add_rectangle",
    c_int,
    [c_void_p, c_char_p, c_double, c_double, c_double, c_double],
)
document_add_sketch_entity = _bind(
    "aim3d_document_add_sketch_entity",
    c_void_p,
    [c_void_p, c_char_p, c_char_p, ctypes.POINTER(c_double), c_size_t, c_double, c_double, c_int],
)
document_add_extrude = _bind("aim3d_document_add_extrude", c_void_p, [c_void_p, c_char_p, c_double])
document_add_solid_feature = _bind(
    "aim3d_document_add_solid_feature",
    c_void_p,
    [c_void_p, c_char_p, c_char_p, c_double, c_char_p],
)
document_add_construction = _bind(
    "aim3d_document_add_construction",
    c_void_p,
    [c_void_p, c_char_p, c_char_p, c_double],
)
document_core_state_snapshot = _bind("aim3d_document_core_state_snapshot", c_void_p, [c_void_p])
document_body_count = _bind("aim3d_document_body_count", c_size_t, [c_void_p])
document_body_at = _bind("aim3d_document_body_at", c_void_p, [c_void_p, c_size_t])
document_preview_body = _bind("aim3d_document_preview_body", c_void_p, [c_void_p])
document_import_geometry_task = _bind("aim3d_document_import_geometry_task", c_void_p, [c_void_p, c_char_p])
document_inspect_bodies_task = _bind("aim3d_document_inspect_bodies_task", c_void_p, [c_void_p])

task_wait = _bind("aim3d_task_wait", None, [c_void_p])
task_state = _bind("aim3d_task_state", c_int, [c_void_p])
task_message = _bind("aim3d_task_message", c_char_p, [c_void_p])
task_release = _bind("aim3d_task_release", None, [c_void_p])

body_name = _bind("aim3d_body_name", c_char_p, [c_void_p])
body_vertices = _bind("aim3d_body_vertices", c_void_p, [c_void_p])
body_release = _bind("aim3d_body_release", None, [c_void_p])

document_mesh_positions = _bind("aim3d_document_mesh_positions", c_void_p, [c_void_p])
document_mesh_normals = _bind("aim3d_document_mesh_normals", c_void_p, [c_void_p])
document_mesh_colors = _bind("aim3d_document_mesh_colors", c_void_p, [c_void_p])
document_mesh_indices = _bind("aim3d_document_mesh_indices", c_void_p, [c_void_p])

operation_create_default = _bind("aim3d_operation_create_default", c_void_p, [])
operation_release = _bind("aim3d_operation_release", None, [c_void_p])
operation_generate_toolpath = _bind("aim3d_operation_generate_toolpath", c_int, [c_void_p])
operation_toolpath = _bind("aim3d_operation_toolpath", c_void_p, [c_void_p])
operation_post_process = _bind("aim3d_operation_post_process", c_void_p, [c_void_p])
string_release = _bind("aim3d_string_release", None, [c_void_p])

buffer_data = _bind("aim3d_buffer_data", c_void_p, [c_void_p])
buffer_count = _bind("aim3d_buffer_count", c_size_t, [c_void_p])
buffer_components = _bind("aim3d_buffer_components", c_int, [c_void_p])
buffer_dtype = _bind("aim3d_buffer_dtype", c_int, [c_void_p])
buffer_pointer = _bind("aim3d_buffer_pointer", c_uint64, [c_void_p])
buffer_release = _bind("aim3d_buffer_release", None, [c_void_p])


class SketchPointC(ctypes.Structure):
    _fields_ = [
        ("id", c_int),
        ("x", c_double),
        ("y", c_double),
        ("fixed", c_int),
    ]


class SketchEntityC(ctypes.Structure):
    _fields_ = [
        ("id", c_int),
        ("type", c_int),
        ("point_a_id", c_int),
        ("point_b_id", c_int),
        ("center_point_id", c_int),
        ("radius", c_double),
    ]


class SketchConstraintC(ctypes.Structure):
    _fields_ = [
        ("type", c_int),
        ("entity_a_id", c_int),
        ("entity_b_id", c_int),
        ("value", c_double),
    ]


class SketchSolveOptionsC(ctypes.Structure):
    _fields_ = [
        ("max_iterations", c_int),
        ("tolerance", c_double),
        ("finite_difference_step", c_double),
        ("damping", c_double),
    ]


class SketchSolveResultC(ctypes.Structure):
    _fields_ = [
        ("status", c_int),
        ("is_fully_constrained", c_int),
        ("degrees_of_freedom", c_int),
        ("iterations", c_int),
        ("residual_error", c_double),
        ("warning_count", c_int),
        ("message", ctypes.c_char * 256),
    ]


solve_sketch_2d_raw = _bind(
    "aim3d_solve_sketch_2d",
    c_int,
    [
        ctypes.POINTER(SketchPointC),
        c_int,
        ctypes.POINTER(SketchEntityC),
        c_int,
        ctypes.POINTER(SketchConstraintC),
        c_int,
        ctypes.POINTER(SketchSolveOptionsC),
        ctypes.POINTER(SketchSolveResultC),
    ],
)


def _encode_path(path):
    return str(path).encode("utf-8")


def consume_string(pointer):
    """Decode a native-owned ``char*`` and release it. Returns None for null."""
    if not pointer:
        return None
    try:
        raw = ctypes.cast(pointer, c_char_p).value
        return raw.decode("utf-8") if raw is not None else None
    finally:
        string_release(pointer)


class NativeError(RuntimeError):
    pass


class NativeBuffer:
    def __init__(self, handle):
        if not handle:
            raise NativeError("Native buffer allocation failed")
        self._handle = handle
        self._released = False
        self.dtype_code = buffer_dtype(handle)
        self.components = buffer_components(handle)
        self.count = buffer_count(handle)
        self.pointer = int(buffer_pointer(handle))
        self._array = self._make_array()

    @property
    def shape(self):
        return self._array.shape

    @property
    def dtype(self):
        return self._array.dtype

    @property
    def __array_interface__(self):
        self._ensure_live()
        return self._array.__array_interface__

    def __array__(self, dtype=None, copy=None):
        self._ensure_live()
        if dtype is None:
            return self._array
        return np.asarray(self._array, dtype=dtype)

    def release(self):
        if self._handle and not self._released:
            buffer_release(self._handle)
            self._handle = None
            self._released = True

    def _ensure_live(self):
        if self._released:
            raise NativeError("Native buffer has been released")

    def _make_array(self):
        if self.dtype_code == FLOAT64:
            c_type = ctypes.c_double
            dtype = np.float64
        elif self.dtype_code == UINT32:
            c_type = ctypes.c_uint32
            dtype = np.uint32
        else:
            c_type = ctypes.c_float
            dtype = np.float32

        if self.count == 0 or self.pointer == 0:
            return np.empty((0, self.components), dtype=dtype)

        array_type = c_type * self.count
        ctypes_array = array_type.from_address(self.pointer)
        array = np.ctypeslib.as_array(ctypes_array)
        if self.components > 1 and self.count % self.components == 0:
            array = array.reshape((self.count // self.components, self.components))
        self._ctypes_array = ctypes_array
        return array

    def __del__(self):
        self.release()


class NativeTask:
    def __init__(self, handle):
        if not handle:
            raise NativeError("Native task allocation failed")
        self._handle = handle

    @property
    def state(self):
        return task_state(self._handle)

    @property
    def message(self):
        raw = task_message(self._handle)
        return raw.decode("utf-8") if raw else ""

    def wait(self):
        task_wait(self._handle)
        if self.state != 2:
            raise NativeError(self.message)
        return True

    def release(self):
        if self._handle:
            task_release(self._handle)
            self._handle = None

    def __del__(self):
        self.release()
