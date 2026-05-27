from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aim3d.cam as aim_cam


def name_from_path(path: str) -> str:
    stem = Path(str(path)).stem
    return stem or "Untitled"


class IdSource:
    def __init__(self):
        self._next = 1

    def next(self, prefix: str) -> str:
        value = f"{prefix}_{self._next}"
        self._next += 1
        return value


@dataclass
class TimelineObjectState:
    name: str
    entity: Any = None
    health_state: int = 0
    message: str = ""
    rolled: bool = False


@dataclass
class ParameterValueState:
    value: Any = None
    expression: str = ""

    def getCurveSelections(self):
        return []

    def setCurveSelections(self, selections):
        self.value = list(selections or [])
        return True


@dataclass
class ParameterState:
    name: str
    value: ParameterValueState = field(default_factory=ParameterValueState)
    expression: str = ""


@dataclass
class PointState:
    point: Any
    name: str = ""


@dataclass
class SketchCurveState:
    kind: str
    start: Any = None
    end: Any = None
    center: Any = None
    radius: float = 0.0
    name: str = ""


@dataclass
class ProfileState:
    sketch: "SketchState"
    index: int
    entities: list[Any] = field(default_factory=list)
    name: str = ""


@dataclass
class SketchState:
    name: str
    plane: Any
    curves: list[SketchCurveState] = field(default_factory=list)
    points: list[PointState] = field(default_factory=list)
    constraints: list[tuple[str, Any]] = field(default_factory=list)
    dimensions: list[Any] = field(default_factory=list)
    profiles: list[ProfileState] = field(default_factory=list)


@dataclass
class BodyState:
    name: str
    source_feature: Any = None
    faces: list[Any] = field(default_factory=list)
    edges: list[Any] = field(default_factory=list)
    vertices: list[Any] = field(default_factory=list)


@dataclass
class FaceState:
    name: str
    body: BodyState
    index: int


@dataclass
class EdgeState:
    name: str
    body: BodyState
    index: int
    geometry: Any = None


@dataclass
class VertexState:
    name: str
    body: BodyState
    index: int
    geometry: Any = None


@dataclass
class FeatureState:
    name: str
    kind: str
    bodies: list[BodyState] = field(default_factory=list)
    profile: Any = None
    operation: int = 0
    extent_one: Any = None
    extent_two: Any = None
    start_extent: Any = None
    taper_angle_one: Any = None
    taper_angle_two: Any = None
    symmetric_extent: Any = None
    timeline: TimelineObjectState | None = None
    health_state: int = 0
    message: str = ""


@dataclass
class OccurrenceState:
    name: str
    component: "ComponentState"


@dataclass
class ComponentState:
    name: str = "RootComponent"
    bodies: list[BodyState] = field(default_factory=list)
    sketches: list[SketchState] = field(default_factory=list)
    occurrences: list[OccurrenceState] = field(default_factory=list)
    features: list[FeatureState] = field(default_factory=list)


@dataclass
class DesignState:
    document: "DocumentState"
    root_component: ComponentState = field(default_factory=ComponentState)
    timeline: list[TimelineObjectState] = field(default_factory=list)
    design_intent: int = 0


@dataclass
class OperationState:
    name: str
    operation_type: str = "milling"
    native_operation: Any = None
    parameters: dict[str, ParameterState] = field(default_factory=dict)
    tool: Any = None
    is_light_bulb_on: bool = True

    def __post_init__(self):
        if self.native_operation is None:
            self.native_operation = aim_cam.Operation(self.name)


@dataclass
class SetupState:
    name: str
    operation_type: str = "milling"
    operations: list[OperationState] = field(default_factory=list)
    parameters: dict[str, ParameterState] = field(default_factory=dict)
    models: list[Any] = field(default_factory=list)
    stock_mode: Any = None


@dataclass
class CamState:
    document: "DocumentState"
    setups: list[SetupState] = field(default_factory=list)
    temporary_folder: str = "/tmp"
    nc_programs: list[Any] = field(default_factory=list)


@dataclass
class DocumentState:
    native_doc: Any
    file_path: str = "Untitled.a3d"
    ids: IdSource = field(default_factory=IdSource)
    design: DesignState | None = None
    cam: CamState | None = None
    data_file: Any = None
    wrappers: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if self.design is None:
            self.design = DesignState(self)
        if self.cam is None:
            setup = SetupState("Setup1")
            setup.operations.append(OperationState("Pocket1", "pocket"))
            self.cam = CamState(self, [setup])


def ensure_body_topology(body: BodyState) -> BodyState:
    if body.faces and body.edges and body.vertices:
        return body
    body.faces = [FaceState(f"Face{i + 1}", body, i) for i in range(6)]
    body.edges = [EdgeState(f"Edge{i + 1}", body, i) for i in range(12)]
    body.vertices = [VertexState(f"Vertex{i + 1}", body, i) for i in range(8)]
    return body


def parameter(parameters: dict[str, ParameterState], name: str, default: Any = None) -> ParameterState:
    if name not in parameters:
        expression = "" if default is None else str(default)
        parameters[name] = ParameterState(name, ParameterValueState(default, expression), expression)
    return parameters[name]
