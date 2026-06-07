from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple


VISUAL_IR_SCHEMA: Dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://aim3d.local/schema/controller-visual-ir-v1.json",
    "title": "aim3d Controller Visual IR v1",
    "type": "object",
    "required": ["machine", "setup", "stock", "toolLibrary", "operations", "safety"],
    "properties": {
        "machine": {"type": "object"},
        "setup": {"type": "object"},
        "stock": {"type": "object"},
        "toolLibrary": {"type": "object"},
        "operations": {"type": "array"},
        "safety": {"type": "object"},
    },
}


class VisualIRValidationError(ValueError):
    """Raised when a visual-programming IR document is unsafe or incomplete."""


@dataclass(frozen=True)
class AxisLimit:
    minimum: float
    maximum: float
    steps_per_mm: float

    def validate(self, axis: str) -> List[str]:
        errors = []
        if self.minimum >= self.maximum:
            errors.append(f"{axis} minimum must be below maximum")
        if self.steps_per_mm <= 0:
            errors.append(f"{axis} steps_per_mm must be positive")
        return errors


@dataclass(frozen=True)
class Machine:
    id: str = "jetson-orin-nano-spe-mill"
    axes: Mapping[str, AxisLimit] = field(
        default_factory=lambda: {
            "x": AxisLimit(-1.0, 300.0, 80.0),
            "y": AxisLimit(-1.0, 300.0, 80.0),
            "z": AxisLimit(-100.0, 50.0, 400.0),
        }
    )
    platform: str = "jetpack-7.2-spe"
    controller: str = "spe-step-dir"


@dataclass(frozen=True)
class Setup:
    id: str
    work_offset: str = "G54"
    origin_mm: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    units: str = "mm"


@dataclass(frozen=True)
class Stock:
    id: str
    size_mm: Tuple[float, float, float]
    origin_mm: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    material: str = "unknown"


@dataclass(frozen=True)
class Tool:
    id: int
    kind: str
    diameter_mm: float
    flute_count: int = 2
    length_mm: float = 25.0
    material: str = "carbide"

    def validate(self) -> List[str]:
        errors = []
        if self.id <= 0:
            errors.append("tool id must be positive")
        if self.diameter_mm <= 0:
            errors.append(f"tool {self.id} diameter_mm must be positive")
        if self.length_mm <= 0:
            errors.append(f"tool {self.id} length_mm must be positive")
        if self.flute_count <= 0:
            errors.append(f"tool {self.id} flute_count must be positive")
        return errors


@dataclass(frozen=True)
class ToolLibrary:
    tools: Sequence[Tool]


@dataclass(frozen=True)
class Operation:
    id: str
    kind: str
    tool_id: int
    target_depth_mm: float
    feed_rate_mm_min: float
    spindle_rpm: float
    path: Sequence[Tuple[float, float]]
    safe_z_mm: float = 5.0
    stepdown_mm: Optional[float] = None
    stepover_pct: Optional[float] = None

    def validate(self) -> List[str]:
        errors = []
        if not self.id:
            errors.append("operation id is required")
        if self.kind not in {"pocket_milling", "contour_following", "adaptive_clearing", "drill_array"}:
            errors.append(f"unsupported operation kind: {self.kind}")
        if self.tool_id <= 0:
            errors.append(f"{self.id} tool_id must be positive")
        if self.feed_rate_mm_min <= 0:
            errors.append(f"{self.id} feed_rate_mm_min must be positive")
        if self.spindle_rpm <= 0:
            errors.append(f"{self.id} spindle_rpm must be positive")
        if self.safe_z_mm <= self.target_depth_mm:
            errors.append(f"{self.id} safe_z_mm must be above target depth")
        if not self.path:
            errors.append(f"{self.id} path is required")
        return errors


@dataclass(frozen=True)
class SafetyEnvelope:
    require_homing: bool = True
    require_estop: bool = True
    require_limits: bool = True
    max_program_depth_mm: float = -100.0


@dataclass(frozen=True)
class VisualProgram:
    machine: Machine
    setup: Setup
    stock: Stock
    tool_library: ToolLibrary
    operations: Sequence[Operation]
    safety: SafetyEnvelope = field(default_factory=SafetyEnvelope)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["toolLibrary"] = data.pop("tool_library")
        return data


def default_machine() -> Machine:
    return Machine()


def validate_visual_ir(document: Mapping[str, Any]) -> List[str]:
    errors: List[str] = []
    for key in VISUAL_IR_SCHEMA["required"]:
        if key not in document:
            errors.append(f"missing required field: {key}")

    machine = document.get("machine", {})
    axes = machine.get("axes", {}) if isinstance(machine, Mapping) else {}
    for axis in ("x", "y", "z"):
        axis_data = axes.get(axis)
        if not isinstance(axis_data, Mapping):
            errors.append(f"machine.axes.{axis} is required")
            continue
        try:
            limit = AxisLimit(
                float(axis_data["minimum"]),
                float(axis_data["maximum"]),
                float(axis_data["steps_per_mm"]),
            )
            errors.extend(limit.validate(axis))
        except (KeyError, TypeError, ValueError):
            errors.append(f"machine.axes.{axis} must include numeric minimum, maximum, and steps_per_mm")

    tools_by_id = {}
    tool_library = document.get("toolLibrary", {})
    for raw_tool in tool_library.get("tools", []) if isinstance(tool_library, Mapping) else []:
        try:
            tool = Tool(
                id=int(raw_tool["id"]),
                kind=str(raw_tool["kind"]),
                diameter_mm=float(raw_tool["diameter_mm"]),
                flute_count=int(raw_tool.get("flute_count", 2)),
                length_mm=float(raw_tool.get("length_mm", 25.0)),
                material=str(raw_tool.get("material", "carbide")),
            )
            errors.extend(tool.validate())
            tools_by_id[tool.id] = tool
        except (KeyError, TypeError, ValueError):
            errors.append("each tool must include id, kind, and diameter_mm")

    operations = document.get("operations", [])
    if not isinstance(operations, list) or not operations:
        errors.append("operations must contain at least one operation")
    else:
        for raw_operation in operations:
            try:
                path = [tuple(point) for point in raw_operation.get("path", [])]
                operation = Operation(
                    id=str(raw_operation["id"]),
                    kind=str(raw_operation["kind"]),
                    tool_id=int(raw_operation["tool_id"]),
                    target_depth_mm=float(raw_operation["target_depth_mm"]),
                    feed_rate_mm_min=float(raw_operation["feed_rate_mm_min"]),
                    spindle_rpm=float(raw_operation["spindle_rpm"]),
                    path=[(float(point[0]), float(point[1])) for point in path],
                    safe_z_mm=float(raw_operation.get("safe_z_mm", 5.0)),
                    stepdown_mm=(
                        float(raw_operation["stepdown_mm"])
                        if raw_operation.get("stepdown_mm") is not None
                        else None
                    ),
                    stepover_pct=(
                        float(raw_operation["stepover_pct"])
                        if raw_operation.get("stepover_pct") is not None
                        else None
                    ),
                )
                errors.extend(operation.validate())
                if operation.tool_id not in tools_by_id:
                    errors.append(f"{operation.id} references missing tool {operation.tool_id}")
            except (KeyError, TypeError, ValueError, IndexError):
                errors.append("operation must include id, kind, tool_id, target_depth_mm, feed_rate_mm_min, spindle_rpm, and path")

    safety = document.get("safety", {})
    if isinstance(safety, Mapping):
        max_depth = float(safety.get("max_program_depth_mm", -100.0))
        for raw_operation in operations if isinstance(operations, list) else []:
            if isinstance(raw_operation, Mapping) and float(raw_operation.get("target_depth_mm", 0.0)) < max_depth:
                errors.append(f"{raw_operation.get('id', 'operation')} exceeds max_program_depth_mm")
    return errors


def assert_valid_visual_ir(document: Mapping[str, Any]) -> None:
    errors = validate_visual_ir(document)
    if errors:
        raise VisualIRValidationError("; ".join(errors))


def compile_visual_ir_to_gcode(document: Mapping[str, Any]) -> str:
    assert_valid_visual_ir(document)
    setup = document["setup"]
    lines = [
        "; aim3d visual IR compiled for Jetson SPE controller",
        "G21" if setup.get("units", "mm") == "mm" else "G20",
        "G90",
        str(setup.get("work_offset", "G54")),
    ]
    for operation in document["operations"]:
        tool_id = int(operation["tool_id"])
        safe_z = float(operation.get("safe_z_mm", 5.0))
        depth = float(operation["target_depth_mm"])
        feed = float(operation["feed_rate_mm_min"])
        spindle = float(operation["spindle_rpm"])
        path = operation["path"]
        first = path[0]
        lines.extend(
            [
                f"; operation {operation['id']} {operation['kind']}",
                f"T{tool_id} M6",
                f"S{spindle:g} M3",
                f"G0 X{float(first[0]):g} Y{float(first[1]):g} Z{safe_z:g}",
                f"G1 Z{depth:g} F{feed:g}",
            ]
        )
        for point in path[1:]:
            lines.append(f"G1 X{float(point[0]):g} Y{float(point[1]):g} Z{depth:g}")
        lines.append(f"G0 Z{safe_z:g}")
    lines.append("M30")
    return "\n".join(lines) + "\n"


class VisualProgramBuilder:
    def __init__(self, setup_id: str = "setup-1"):
        self.machine = default_machine()
        self.setup = Setup(id=setup_id)
        self.stock = Stock(id="stock-1", size_mm=(100.0, 100.0, 25.0), material="aluminum")
        self.tools: List[Tool] = []
        self.operations: List[Operation] = []
        self.safety = SafetyEnvelope()

    def tool(self, tool: Tool) -> "VisualProgramBuilder":
        self.tools.append(tool)
        return self

    def pocket(
        self,
        operation_id: str,
        tool_id: int,
        boundary: Iterable[Tuple[float, float]],
        target_depth_mm: float,
        feed_rate_mm_min: float,
        spindle_rpm: float,
        safe_z_mm: float = 5.0,
    ) -> "VisualProgramBuilder":
        self.operations.append(
            Operation(
                id=operation_id,
                kind="pocket_milling",
                tool_id=tool_id,
                target_depth_mm=target_depth_mm,
                feed_rate_mm_min=feed_rate_mm_min,
                spindle_rpm=spindle_rpm,
                path=list(boundary),
                safe_z_mm=safe_z_mm,
            )
        )
        return self

    def build(self) -> VisualProgram:
        return VisualProgram(
            machine=self.machine,
            setup=self.setup,
            stock=self.stock,
            tool_library=ToolLibrary(self.tools),
            operations=self.operations,
            safety=self.safety,
        )


def simulate_program_mesh(
    gcode: str,
    stock_size: Tuple[float, float, float],
    tools: List[Dict[str, Any]],
    resolution: int = 256
) -> Dict[str, Any]:
    from . import _native
    import ctypes

    tool_ids = []
    tool_radii = []
    tool_is_ball = []
    for tool in tools:
        t_id = int(tool.get("id", 0))
        t_dia = float(tool.get("diameter_mm", 6.0))
        t_kind = str(tool.get("kind", ""))
        is_ball = 1 if "ball" in t_kind.lower() else 0
        tool_ids.append(t_id)
        tool_radii.append(t_dia / 2.0)
        tool_is_ball.append(is_ball)

    # Convert lists to ctypes arrays
    c_tool_ids = (ctypes.c_int * len(tool_ids))(*tool_ids) if tool_ids else None
    c_tool_radii = (ctypes.c_double * len(tool_radii))(*tool_radii) if tool_radii else None
    c_tool_is_ball = (ctypes.c_int * len(tool_is_ball))(*tool_is_ball) if tool_is_ball else None
    tool_count = len(tool_ids)

    sim_handle = _native.simulator_create()
    try:
        ok = _native.simulator_run(
            sim_handle,
            gcode.encode("utf-8"),
            float(stock_size[0]),
            float(stock_size[1]),
            float(stock_size[2]),
            resolution,
            resolution,
            c_tool_ids,
            c_tool_radii,
            c_tool_is_ball,
            tool_count
        )
        if not ok:
            raise ValueError("C++ lightweight simulator run failed or G-code parsing failed")

        v_count = _native.simulator_vertex_count(sim_handle)
        i_count = _native.simulator_index_count(sim_handle)

        pos_buffer = (ctypes.c_float * (v_count * 3))()
        norm_buffer = (ctypes.c_float * (v_count * 3))()
        ind_buffer = (ctypes.c_uint32 * i_count)()

        _native.simulator_copy_mesh(sim_handle, pos_buffer, norm_buffer, ind_buffer)

        positions = list(pos_buffer)
        normals = list(norm_buffer)
        indices = list(ind_buffer)

        return {
            "positions": positions,
            "normals": normals,
            "indices": indices
        }
    finally:
        _native.simulator_release(sim_handle)

