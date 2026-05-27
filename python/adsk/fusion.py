from types import SimpleNamespace

from adsk import Aim3dUnsupportedFeatureError
from adsk._state import (
    BodyState,
    ComponentState,
    EdgeState,
    FaceState,
    FeatureState,
    OccurrenceState,
    ParameterState,
    ParameterValueState,
    PointState,
    ProfileState,
    SketchCurveState,
    SketchState,
    TimelineObjectState,
    VertexState,
    ensure_body_topology,
)
from adsk.core import Base, BaseCollection, ObjectCollection, Point3D, UniversalStub, ValueInput, Vector3D


def _unsupported(feature_name, alternative="aim3d.core"):
    raise Aim3dUnsupportedFeatureError(feature_name, alternative)


def _value_number(value, default=1.0):
    if isinstance(value, ModelParameter):
        return _value_number(value._state.value.value, default)
    if isinstance(value, ValueInput):
        if value.value is not None:
            return float(value.value)
        return _expression_number(value.expression, default)
    return _expression_number(value, default)


def _expression_number(expression, default=1.0):
    try:
        text = str(expression).strip().split()[0].replace("cm", "").replace("mm", "")
        return float(text)
    except Exception:
        return float(default)


def _model_parameter(name, value=None):
    if isinstance(value, ModelParameter):
        return value
    if isinstance(value, ValueInput):
        raw = value.value if value.value is not None else _expression_number(value.expression)
        expression = value.expression or str(raw)
    else:
        raw = value
        expression = "" if value is None else str(value)
    return ModelParameter(ParameterState(name, ParameterValueState(raw, expression), expression))


class PhysicalProperties(Base):
    def __init__(self):
        self.area = 1.0
        self.density = 1.0
        self.mass = 1.0
        self.volume = 1.0
        self.accuracy = 0
        self.centerOfMass = Point3D.create(0, 0, 0)

    def getPrincipalAxes(self):
        return True, Vector3D.create(1, 0, 0), Vector3D.create(0, 1, 0), Vector3D.create(0, 0, 1)

    def getPrincipalMomentsOfInertia(self):
        return True, 1.0, 1.0, 1.0

    def getRadiusOfGyration(self):
        return True, 1.0, 1.0, 1.0

    def getRotationToPrincipal(self):
        return True, 0.0, 0.0, 0.0

    def getXYZMomentsOfInertia(self):
        return True, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0


class AreaProperties(Base):
    def __init__(self):
        self.area = 1.0
        self.centroid = Point3D.create(0, 0, 0)
        self.perimeter = 1.0
        self.rotationToPrincipal = 0.0
        self.accuracy = 0

    def getPrincipalAxes(self):
        return True, Vector3D.create(1, 0, 0), Vector3D.create(0, 1, 0)

    def getCentroidMomentsOfInertia(self):
        return True, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0

    def getPrincipalMomentsOfInertia(self):
        return True, 1.0, 1.0, 1.0

    def getRadiusOfGyration(self):
        return True, 1.0, 1.0, 1.0

    def getMomentsOfInertia(self):
        return True, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0


class _StateWrapper(Base):
    state_type = object

    @staticmethod
    def cast(value):
        return value


class _EnumContainer:
    def __getattr__(self, name):
        value = len(self.__dict__)
        setattr(self, name, value)
        return value


class TimelineObject(Base):
    def __init__(self, state):
        self._state = state

    @property
    def name(self):
        return self._state.name

    @property
    def healthState(self):
        return self._state.health_state

    @property
    def errorOrWarningMessage(self):
        return self._state.message

    def rollTo(self, before=True):
        self._state.rolled = True
        return True


class Timeline(BaseCollection):
    def __init__(self, design_state):
        self._design_state = design_state
        super().__init__([TimelineObject(item) for item in design_state.timeline])

    @property
    def count(self):
        return len(self._design_state.timeline)

    def item(self, index):
        if 0 <= index < len(self._design_state.timeline):
            return TimelineObject(self._design_state.timeline[index])
        return None

    def moveToEnd(self):
        return True


class ModelParameter(Base):
    def __init__(self, state):
        self._state = state

    @staticmethod
    def cast(value):
        if isinstance(value, ModelParameter):
            return value
        if isinstance(value, ValueInput):
            return _model_parameter("value", value)
        if isinstance(value, ParameterState):
            return ModelParameter(value)
        return None

    @property
    def name(self):
        return self._state.name

    @property
    def value(self):
        return self._state.value.value

    @value.setter
    def value(self, next_value):
        self._state.value.value = next_value
        self._state.value.expression = str(next_value)
        self._state.expression = str(next_value)

    @property
    def expression(self):
        return self._state.expression or self._state.value.expression

    @expression.setter
    def expression(self, next_expression):
        self._state.expression = str(next_expression)
        self._state.value.expression = str(next_expression)
        self._state.value.value = _expression_number(next_expression, self._state.value.value or 0.0)


class ConstructionPlane(Base):
    def __init__(self, name):
        self.name = name
        self.healthState = FeatureHealthStates.HealthyFeatureHealthState
        self.errorOrWarningMessage = ""

    def createForAssemblyContext(self, occurrence):
        return self


class ConstructionPlaneInput(Base):
    def __init__(self):
        self.definition = None

    def setByOffset(self, plane, offset):
        self.definition = ("offset", plane, offset)
        return True

    def __getattr__(self, name):
        if name.startswith("setBy"):
            def setter(*args, **kwargs):
                self.definition = (name, args, kwargs)
                return True
            return setter
        raise AttributeError(name)


class ConstructionPlanes(BaseCollection):
    def __init__(self, component):
        self._component = component
        super().__init__([])

    def createInput(self):
        return ConstructionPlaneInput()

    def add(self, input_object):
        plane = ConstructionPlane(f"ConstructionPlane{self.count + 1}")
        self._items.append(plane)
        return plane


class ConstructionAxisInput(Base):
    def setByPerpendicularAtPoint(self, face, point):
        self.definition = ("perpendicular", face, point)
        return True

    def __getattr__(self, name):
        if name.startswith("setBy"):
            def setter(*args, **kwargs):
                self.definition = (name, args, kwargs)
                return True
            return setter
        raise AttributeError(name)


class ConstructionAxes(BaseCollection):
    def createInput(self):
        return ConstructionAxisInput()

    def add(self, input_object):
        axis = SimpleNamespace(name=f"ConstructionAxis{self.count + 1}", input=input_object)
        self._items.append(axis)
        return axis


class BRepVertex(Base):
    def __init__(self, state):
        self._state = state

    @staticmethod
    def cast(value):
        return value if isinstance(value, BRepVertex) else None

    @property
    def name(self):
        return self._state.name

    @property
    def geometry(self):
        return self._state.geometry or Point3D.create(0, 0, 0)

    @property
    def faces(self):
        return BaseCollection()


class BRepEdge(Base):
    def __init__(self, state):
        self._state = state

    @staticmethod
    def cast(value):
        return value if isinstance(value, BRepEdge) else None

    @property
    def name(self):
        return self._state.name

    @property
    def geometry(self):
        return self._state.geometry

    @property
    def faces(self):
        return BaseCollection([BRepFace(face) for face in self._state.body.faces[:2]])


class BRepFace(Base):
    def __init__(self, state):
        self._state = state

    @staticmethod
    def cast(value):
        return value if isinstance(value, BRepFace) else None

    @property
    def name(self):
        return self._state.name

    @property
    def edges(self):
        return BaseCollection([BRepEdge(edge) for edge in self._state.body.edges[:4]])

    @property
    def vertices(self):
        return BaseCollection([BRepVertex(vertex) for vertex in self._state.body.vertices[:4]])

    @property
    def loops(self):
        return BaseCollection([UniversalStub("BRepLoop")])

    @property
    def geometry(self):
        return getattr(self._state, "geometry", UniversalStub("Surface"))

    @property
    def entityToken(self):
        return f"token_{self.name}"


class BRepBody(Base):
    def __init__(self, body_state):
        if isinstance(body_state, BodyState):
            self._state = ensure_body_topology(body_state)
        else:
            name = getattr(body_state, "name", "Body")
            self._state = ensure_body_topology(BodyState(name))
        self._native_body = body_state

    @staticmethod
    def cast(value):
        return value if isinstance(value, BRepBody) else None

    @property
    def name(self):
        return self._state.name

    @name.setter
    def name(self, value):
        self._state.name = str(value)

    @property
    def faces(self):
        return BaseCollection([BRepFace(face) for face in self._state.faces])

    @property
    def edges(self):
        return BaseCollection([BRepEdge(edge) for edge in self._state.edges])

    @property
    def vertices(self):
        return BaseCollection([BRepVertex(vertex) for vertex in self._state.vertices])

    @property
    def wires(self):
        return BaseCollection([UniversalStub("BRepWire", edges=self.edges)])

    @property
    def isValid(self):
        return self._state is not None

    @property
    def revisionId(self):
        return f"rev_{self.name}"

    @property
    def physicalProperties(self):
        return PhysicalProperties()

    def getPhysicalProperties(self, accuracy=None):
        return self.physicalProperties

    @property
    def volume(self):
        return 1.0

    @property
    def isTemporary(self):
        return True

    @property
    def isVisible(self):
        return getattr(self, "_is_visible", True)

    @isVisible.setter
    def isVisible(self, value):
        self._is_visible = bool(value)

    @property
    def parentComponent(self):
        return Component(ComponentState("ParentComponent"))

    def createForAssemblyContext(self, occurrence):
        return self

    def copyToComponent(self, component):
        target = getattr(component, "component", component)
        bodies = getattr(target, "bRepBodies", None)
        if bodies is not None:
            return bodies.add(self)
        return BRepBody(BodyState(self.name + "_copy"))

    def moveToComponent(self, component):
        return self.copyToComponent(component)


class BRepBodies(BaseCollection):
    def __init__(self, component_or_bodies=None):
        if isinstance(component_or_bodies, ComponentState):
            self._component_state = component_or_bodies
            items = [BRepBody(body) for body in component_or_bodies.bodies]
        else:
            self._component_state = None
            items = [BRepBody(body) for body in component_or_bodies or []]
        super().__init__(items)

    @property
    def count(self):
        if self._component_state is not None:
            return len(self._component_state.bodies)
        return super().count

    def item(self, index):
        if self._component_state is not None:
            if 0 <= index < len(self._component_state.bodies):
                return BRepBody(self._component_state.bodies[index])
            return None
        return super().item(index)

    def add(self, body):
        state = body._state if isinstance(body, BRepBody) else BodyState(getattr(body, "name", "Body"))
        ensure_body_topology(state)
        if self._component_state is not None:
            self._component_state.bodies.append(state)
        self._items.append(BRepBody(state))
        return BRepBody(state)


class SketchPoint(Base):
    def __init__(self, point):
        self.geometry = point
        self.name = "SketchPoint"

    def merge(self, other):
        return True

    def move(self, vector):
        self.geometry.x += getattr(vector, "x", 0.0)
        self.geometry.y += getattr(vector, "y", 0.0)
        self.geometry.z += getattr(vector, "z", 0.0)
        return True


class SketchPoints(BaseCollection):
    def __init__(self, sketch_state):
        self._sketch_state = sketch_state
        super().__init__([SketchPoint(point.point) for point in sketch_state.points])

    def add(self, point):
        state = PointState(point)
        self._sketch_state.points.append(state)
        return SketchPoint(point)


class SketchCurve(Base):
    def __init__(self, state):
        self._state = state
        self.name = state.name or state.kind

    @staticmethod
    def cast(value):
        return value if isinstance(value, SketchCurve) else None


class SketchEntity(Base):
    @staticmethod
    def cast(value):
        return value if isinstance(value, (SketchCurve, SketchPoint, Profile)) else None


class SketchLine(SketchCurve):
    @property
    def startSketchPoint(self):
        return SketchPoint(self._state.start)

    @property
    def endSketchPoint(self):
        return SketchPoint(self._state.end)

    @property
    def geometry(self):
        from adsk.core import Line3D

        return Line3D.create(self._state.start, self._state.end)


class SketchLines(BaseCollection):
    def __init__(self, sketch_state):
        self._sketch_state = sketch_state
        super().__init__([SketchLine(curve) for curve in sketch_state.curves if curve.kind == "line"])

    def addByTwoPoints(self, start_point, end_point):
        if isinstance(start_point, SketchPoint):
            start_point = start_point.geometry
        if isinstance(end_point, SketchPoint):
            end_point = end_point.geometry
        state = SketchCurveState("line", start=start_point, end=end_point, name=f"Line{len(self._sketch_state.curves) + 1}")
        self._sketch_state.curves.append(state)
        return SketchLine(state)

    def addTwoPointRectangle(self, first, second):
        p1 = first
        p3 = second
        p2 = Point3D.create(p3.x, p1.y, p1.z)
        p4 = Point3D.create(p1.x, p3.y, p1.z)
        lines = ObjectCollection.create()
        for a, b in ((p1, p2), (p2, p3), (p3, p4), (p4, p1)):
            lines.add(self.addByTwoPoints(a, b))
        _ensure_profiles(self._sketch_state)
        return lines

    def addThreePointRectangle(self, first, second, third):
        return self.addTwoPointRectangle(first, third)

    def addCenterPointRectangle(self, center, corner):
        dx = abs(corner.x - center.x)
        dy = abs(corner.y - center.y)
        return self.addTwoPointRectangle(
            Point3D.create(center.x - dx, center.y - dy, center.z),
            Point3D.create(center.x + dx, center.y + dy, center.z),
        )

    def addDistanceChamfer(self, *args, **kwargs):
        return self.addByTwoPoints(Point3D.create(0, 0, 0), Point3D.create(1, 0, 0))

    def addAngleChamfer(self, *args, **kwargs):
        return self.addDistanceChamfer(*args, **kwargs)


class SketchCircle(SketchCurve):
    @property
    def centerSketchPoint(self):
        return SketchPoint(self._state.center)

    @property
    def radius(self):
        return self._state.radius


class SketchCircles(BaseCollection):
    def __init__(self, sketch_state):
        self._sketch_state = sketch_state
        super().__init__([SketchCircle(curve) for curve in sketch_state.curves if curve.kind == "circle"])

    def addByCenterRadius(self, center, radius):
        state = SketchCurveState("circle", center=center, radius=float(radius), name=f"Circle{len(self._sketch_state.curves) + 1}")
        self._sketch_state.curves.append(state)
        _ensure_profiles(self._sketch_state)
        return SketchCircle(state)

    def addByThreeTangents(self, *args, **kwargs):
        return self.addByCenterRadius(Point3D.create(0, 0, 0), 1.0)


class SketchArcs(BaseCollection):
    def addByCenterStartSweep(self, center, start, sweep):
        arc = UniversalStub("SketchArc", center=center, start=start, sweep=sweep)
        self._items.append(arc)
        return arc

    def addFillet(self, *args, **kwargs):
        return self.addByCenterStartSweep(Point3D.create(0, 0, 0), Point3D.create(1, 0, 0), 1.57)

    def addByThreePoints(self, start, through, end):
        arc = UniversalStub("SketchArc", startSketchPoint=SketchPoint(start), endSketchPoint=SketchPoint(end), throughPoint=through)
        self._items.append(arc)
        return arc


class SketchFittedSplines(BaseCollection):
    def add(self, points):
        spline = UniversalStub("SketchFittedSpline", points=points)
        self._items.append(spline)
        return spline


class SketchCurves(BaseCollection):
    def __init__(self, sketch_state):
        self._sketch_state = sketch_state
        super().__init__([SketchCurve(curve) for curve in sketch_state.curves])
        self.sketchLines = SketchLines(sketch_state)
        self.sketchCircles = SketchCircles(sketch_state)
        self.sketchArcs = SketchArcs()
        self.sketchFittedSplines = SketchFittedSplines()

    def item(self, index):
        if 0 <= index < len(self._sketch_state.curves):
            curve = self._sketch_state.curves[index]
            if curve.kind == "line":
                return SketchLine(curve)
            if curve.kind == "circle":
                return SketchCircle(curve)
            return SketchCurve(curve)
        return None


class Profiles(BaseCollection):
    def __init__(self, sketch_state):
        _ensure_profiles(sketch_state)
        self._sketch_state = sketch_state
        super().__init__([Profile(profile) for profile in sketch_state.profiles])

    @property
    def count(self):
        _ensure_profiles(self._sketch_state)
        return len(self._sketch_state.profiles)

    def item(self, index):
        _ensure_profiles(self._sketch_state)
        if 0 <= index < len(self._sketch_state.profiles):
            return Profile(self._sketch_state.profiles[index])
        return None


class Profile(Base):
    def __init__(self, state):
        self._state = state
        self.name = state.name or f"Profile{state.index + 1}"

    @staticmethod
    def cast(value):
        return value if isinstance(value, Profile) else None

    def areaProperties(self, *args, **kwargs):
        return AreaProperties()


def _ensure_profiles(sketch_state):
    desired = 0
    circle_count = sum(1 for curve in sketch_state.curves if curve.kind == "circle")
    line_count = sum(1 for curve in sketch_state.curves if curve.kind == "line")
    desired += circle_count
    desired += line_count // 4
    while len(sketch_state.profiles) < max(1 if sketch_state.curves else 0, desired):
        index = len(sketch_state.profiles)
        sketch_state.profiles.append(ProfileState(sketch_state, index, list(sketch_state.curves), f"Profile{index + 1}"))


class GeometricConstraints(Base):
    def __init__(self, sketch_state):
        self._sketch_state = sketch_state

    def addHorizontal(self, entity):
        self._sketch_state.constraints.append(("horizontal", entity))
        return True

    def addVertical(self, entity):
        self._sketch_state.constraints.append(("vertical", entity))
        return True

    def addCoincident(self, first, second):
        self._sketch_state.constraints.append(("coincident", first, second))
        return True

    def addTangent(self, first, second):
        self._sketch_state.constraints.append(("tangent", first, second))
        return True


class SketchDimensions(Base):
    def __init__(self, sketch_state):
        self._sketch_state = sketch_state

    def addDistanceDimension(self, first, second, orientation, text_point):
        parameter = _model_parameter("distance", 0.0)
        dimension = SimpleNamespace(parameter=parameter, name=f"Dimension{len(self._sketch_state.dimensions) + 1}")
        self._sketch_state.dimensions.append(dimension)
        return dimension


class Sketch(Base):
    def __init__(self, state):
        self._state = state

    @staticmethod
    def cast(value):
        return value if isinstance(value, Sketch) else None

    @property
    def name(self):
        return self._state.name

    @name.setter
    def name(self, value):
        self._state.name = str(value)

    @property
    def sketchCurves(self):
        return SketchCurves(self._state)

    @property
    def sketchPoints(self):
        return SketchPoints(self._state)

    @property
    def profiles(self):
        return Profiles(self._state)

    @property
    def geometricConstraints(self):
        return GeometricConstraints(self._state)

    @property
    def sketchDimensions(self):
        return SketchDimensions(self._state)

    @property
    def revisionId(self):
        return f"rev_{self.name}"

    @property
    def healthState(self):
        return FeatureHealthStates.HealthyFeatureHealthState

    @property
    def sketchTexts(self):
        return UniversalStub("SketchTexts")

    @property
    def originPoint(self):
        return SketchPoint(Point3D.create(0, 0, 0))

    def createAutoConstrainInput(self, curves=None):
        return UniversalStub("AutoConstrainInput", curves=curves)

    def autoConstrain(self, input_object):
        return UniversalStub("AutoConstrainResult", addedConstraints=BaseCollection(), addedDimensions=BaseCollection())

    def modelToSketchSpace(self, point):
        return point

    def sketchToModelSpace(self, point):
        return point

    def intersectWithSketchPlane(self, entity):
        return ObjectCollection.create()

    def project(self, entity):
        collection = ObjectCollection.create()
        collection.add(entity)
        return collection

    def projectToSurface(self, faces, curves, direction=None, surface_project_type=None):
        return self.project(curves)

    def findConnectedCurves(self, curve):
        collection = ObjectCollection.create()
        collection.add(curve)
        return collection

    def offset(self, curves, direction_point, distance):
        return self.project(curves)


class SketchInput(Base):
    def __init__(self, plane):
        self.plane = plane
        self.name = "Sketch"


class Sketches(BaseCollection):
    def __init__(self, component_state=None):
        self._component_state = component_state
        super().__init__([Sketch(state) for state in (component_state.sketches if component_state else [])])

    def createInput(self, plane):
        return SketchInput(plane)

    def add(self, plane_or_input, occurrence=None):
        plane = getattr(plane_or_input, "plane", plane_or_input)
        state = SketchState(f"Sketch{len(self._component_state.sketches) + 1 if self._component_state else self.count + 1}", plane)
        if self._component_state is not None:
            self._component_state.sketches.append(state)
        self._items.append(Sketch(state))
        return Sketch(state)

    def addToBaseOrFormFeature(self, plane, base_or_form_feature, *args):
        return self.add(plane)


class DistanceExtentDefinition(Base):
    def __init__(self, distance):
        self.distance = _model_parameter("distance", distance)

    @staticmethod
    def create(distance):
        return DistanceExtentDefinition(distance)

    @staticmethod
    def cast(value):
        return value if isinstance(value, DistanceExtentDefinition) else None


class ThroughAllExtentDefinition(Base):
    def __init__(self):
        self.isPositiveDirection = True

    @staticmethod
    def create():
        return ThroughAllExtentDefinition()

    @staticmethod
    def cast(value):
        return value if isinstance(value, ThroughAllExtentDefinition) else None


class ToEntityExtentDefinition(Base):
    def __init__(self, entity, is_chained=True):
        self.entity = entity
        self.isChained = bool(is_chained)
        self.isMinimumSolution = True
        self.directionHint = None

    @staticmethod
    def create(entity, is_chained=True):
        return ToEntityExtentDefinition(entity, is_chained)

    @staticmethod
    def cast(value):
        return value if isinstance(value, ToEntityExtentDefinition) else None


class OffsetStartDefinition(Base):
    def __init__(self, offset):
        self.offset = _model_parameter("offset", offset)

    @staticmethod
    def create(offset):
        return OffsetStartDefinition(offset)

    @staticmethod
    def cast(value):
        return value if isinstance(value, OffsetStartDefinition) else None


class FromEntityStartDefinition(Base):
    def __init__(self, entity, offset):
        self.entity = entity
        self.offset = _model_parameter("offset", offset)

    @staticmethod
    def create(entity, offset):
        return FromEntityStartDefinition(entity, offset)

    @staticmethod
    def cast(value):
        return value if isinstance(value, FromEntityStartDefinition) else None


class SymmetricExtentDefinition(Base):
    def __init__(self, distance, is_full_length=True, taper_angle=None):
        self.distance = _model_parameter("distance", distance)
        self.isFullLength = bool(is_full_length)
        self.taperAngle = _model_parameter("taperAngle", taper_angle or 0.0)

    @staticmethod
    def cast(value):
        return value if isinstance(value, SymmetricExtentDefinition) else None


class ExtrudeFeatureInput(Base):
    def __init__(self, profile, operation):
        self.profile = profile
        self.operation = operation
        self.distance = None
        self.isSymmetric = False
        self.extentOne = None
        self.extentTwo = None
        self.startExtent = None
        self.taperAngleOne = _model_parameter("taperAngleOne", 0.0)
        self.taperAngleTwo = _model_parameter("taperAngleTwo", 0.0)
        self.symmetricExtent = None

    def setDistanceExtent(self, is_symmetric, distance):
        self.distance = distance
        self.isSymmetric = bool(is_symmetric)
        self.extentOne = DistanceExtentDefinition(distance)
        return True

    def setOneSideExtent(self, extent, direction, taper_angle=None):
        self.extentOne = extent
        self.extentDirection = direction
        self.taperAngleOne = _model_parameter("taperAngleOne", taper_angle or 0.0)
        return True

    def setTwoSidesExtent(self, extent_one, extent_two, taper_angle_one=None, taper_angle_two=None):
        self.extentOne = extent_one
        self.extentTwo = extent_two
        self.taperAngleOne = _model_parameter("taperAngleOne", taper_angle_one or 0.0)
        self.taperAngleTwo = _model_parameter("taperAngleTwo", taper_angle_two or 0.0)
        return True

    def setSymmetricExtent(self, distance, is_full_length, taper_angle=None):
        self.isSymmetric = True
        self.symmetricExtent = SymmetricExtentDefinition(distance, is_full_length, taper_angle)
        self.extentOne = self.symmetricExtent
        return True


class ExtrudeFeature(Base):
    def __init__(self, state):
        self._state = state

    @property
    def name(self):
        return self._state.name

    @property
    def bodies(self):
        return BaseCollection([BRepBody(body) for body in self._state.bodies])

    @property
    def endFaces(self):
        faces = []
        for body in self._state.bodies:
            ensure_body_topology(body)
            faces.extend(body.faces[:2])
        return BaseCollection([BRepFace(face) for face in faces])

    @property
    def faces(self):
        faces = []
        for body in self._state.bodies:
            ensure_body_topology(body)
            faces.extend(body.faces)
        return BaseCollection([BRepFace(face) for face in faces])

    @property
    def healthState(self):
        return self._state.health_state

    @property
    def errorOrWarningMessage(self):
        return self._state.message

    @property
    def timelineObject(self):
        return TimelineObject(self._state.timeline)

    @property
    def extentOne(self):
        return self._state.extent_one

    @property
    def extentTwo(self):
        return self._state.extent_two

    @property
    def startExtent(self):
        return self._state.start_extent

    @property
    def startFaces(self):
        return self.endFaces

    @property
    def sideFaces(self):
        return self.faces

    @property
    def taperAngleOne(self):
        return self._state.taper_angle_one

    @property
    def taperAngleTwo(self):
        return self._state.taper_angle_two

    @property
    def extentType(self):
        if isinstance(self._state.extent_one, SymmetricExtentDefinition):
            return FeatureExtentTypes.SymmetricFeatureExtentType
        return FeatureExtentTypes.DistanceFeatureExtentType

    @property
    def symmetricExtent(self):
        return self._state.symmetric_extent or self._state.extent_one

    @property
    def parentComponent(self):
        return Component(ComponentState("ParentComponent"))


class ExtrudeFeatures(BaseCollection):
    def __init__(self, component_state=None, design_state=None):
        self._component_state = component_state
        self._design_state = design_state
        items = [ExtrudeFeature(feature) for feature in (component_state.features if component_state else []) if feature.kind == "Extrude"]
        super().__init__(items)

    def createInput(self, profile, operation):
        return ExtrudeFeatureInput(profile, operation)

    def addSimple(self, profile, distance, operation):
        input_object = self.createInput(profile, operation)
        input_object.setDistanceExtent(False, distance)
        return self.add(input_object)

    def add(self, input_object):
        body_name = f"Body{len(self._component_state.bodies) + 1 if self._component_state else self.count + 1}"
        body = ensure_body_topology(BodyState(body_name))
        timeline_state = TimelineObjectState(f"Extrude{len(self._component_state.features) + 1 if self._component_state else self.count + 1}")
        feature_state = FeatureState(
            timeline_state.name,
            "Extrude",
            [body],
            input_object.profile,
            input_object.operation,
            input_object.extentOne,
            input_object.extentTwo,
            input_object.startExtent,
            input_object.taperAngleOne,
            input_object.taperAngleTwo,
            input_object.symmetricExtent,
            timeline_state,
        )
        timeline_state.entity = feature_state
        if self._component_state is not None:
            self._component_state.bodies.append(body)
            self._component_state.features.append(feature_state)
        if self._design_state is not None:
            self._design_state.timeline.append(timeline_state)
        self._items.append(ExtrudeFeature(feature_state))
        return ExtrudeFeature(feature_state)


class Features(Base):
    def __init__(self, component_state=None, design_state=None):
        self._component_state = component_state
        self._design_state = design_state

    @property
    def extrudeFeatures(self):
        return ExtrudeFeatures(self._component_state, self._design_state)

    def createPath(self, curves, is_chain=False):
        return UniversalStub("Path", curves=curves, isChain=is_chain)

    def __getattr__(self, name):
        if name.endswith("Features"):
            value = GenericFeatures(name, self._component_state, self._design_state)
            setattr(self, name, value)
            return value
        raise AttributeError(name)


class GenericFeatureInput(UniversalStub):
    pass


class GenericFeature(Base):
    def __init__(self, name, body=None):
        self.name = name
        self._body = body or ensure_body_topology(BodyState(f"{name}Body"))
        self.timelineObject = TimelineObject(TimelineObjectState(name))
        self.healthState = FeatureHealthStates.HealthyFeatureHealthState
        self.errorOrWarningMessage = ""
        self.edgeSets = BaseCollection([
            FilletEdgeSet(ConstantRadiusFilletEdgeSet.classType(), self._body),
            FilletEdgeSet(VariableRadiusFilletEdgeSet.classType(), self._body),
            FilletEdgeSet(ChordLengthFilletEdgeSet.classType(), self._body),
        ])
        self.taperAngle = _model_parameter("taperAngle", 0.0)

    @property
    def bodies(self):
        return BaseCollection([BRepBody(self._body)])

    @property
    def faces(self):
        return BRepBody(self._body).faces

    @property
    def endFaces(self):
        return BaseCollection([BRepBody(self._body).faces.item(0)])

    def deleteMe(self):
        return True

    def __getattr__(self, name):
        value = UniversalStub(name)
        setattr(self, name, value)
        return value


class GenericFeatures(BaseCollection):
    def __init__(self, name, component_state=None, design_state=None):
        self.name = name
        self._component_state = component_state
        self._design_state = design_state
        super().__init__([])

    def createInput(self, *args, **kwargs):
        return GenericFeatureInput(f"{self.name}Input", args=args, kwargs=kwargs)

    def item(self, index):
        if 0 <= index < len(self._items):
            return self._items[index]
        while len(self._items) <= index:
            self.add()
        return self._items[index]

    def add(self, input_object=None, *args, **kwargs):
        body = ensure_body_topology(BodyState(f"{self.name}Body{self.count + 1}"))
        if self._component_state is not None:
            self._component_state.bodies.append(body)
        feature = GenericFeature(f"{self.name}{self.count + 1}", body)
        self._items.append(feature)
        return feature

    def __getattr__(self, name):
        if name.startswith("create") or name.startswith("add"):
            def create_input(*args, **kwargs):
                return GenericFeatureInput(f"{self.name}{name}", args=args, kwargs=kwargs)
            return create_input
        value = UniversalStub(name)
        setattr(self, name, value)
        return value


class Component(Base):
    def __init__(self, native_comp=None, design_state=None):
        if isinstance(native_comp, ComponentState):
            self._state = native_comp
        else:
            self._state = ComponentState(getattr(native_comp, "name", "RootComponent"))
            for native_body in getattr(native_comp, "b_rep_bodies", []) or []:
                self._state.bodies.append(ensure_body_topology(BodyState(getattr(native_body, "name", "Body"))))
        self._design_state = design_state
        self._occurrences = Occurrences(self._state)
        self._construction_planes = ConstructionPlanes(self)
        self._construction_axes = ConstructionAxes()
        self.xYConstructionPlane = ConstructionPlane("xYConstructionPlane")
        self.xZConstructionPlane = ConstructionPlane("xZConstructionPlane")
        self.yZConstructionPlane = ConstructionPlane("yZConstructionPlane")
        self.xConstructionAxis = UniversalStub("xConstructionAxis")
        self.yConstructionAxis = UniversalStub("yConstructionAxis")
        self.zConstructionAxis = UniversalStub("zConstructionAxis")
        self.originConstructionPoint = UniversalStub("originConstructionPoint")
        self.constructionPoints = GenericFeatures("constructionPoints", self._state, self._design_state)
        self.joints = GenericFeatures("joints", self._state, self._design_state)
        self.asBuiltJoints = GenericFeatures("asBuiltJoints", self._state, self._design_state)
        self.jointOrigins = GenericFeatures("jointOrigins", self._state, self._design_state)
        self.customGraphicsGroups = UniversalStub("customGraphicsGroups")
        self.modelParameters = UniversalStub("modelParameters")

    @property
    def name(self):
        return self._state.name

    @property
    def bRepBodies(self):
        return BRepBodies(self._state)

    @property
    def occurrences(self):
        return self._occurrences

    @property
    def allOccurrences(self):
        return self._occurrences

    @property
    def sketches(self):
        return Sketches(self._state)

    @property
    def features(self):
        return Features(self._state, self._design_state)

    @property
    def constructionPlanes(self):
        return self._construction_planes

    @property
    def constructionAxes(self):
        return self._construction_axes

    @property
    def revisionId(self):
        return f"rev_{self.name}"

    @property
    def meshBodies(self):
        return BaseCollection()

    @property
    def rigidGroups(self):
        return GenericFeatures("rigidGroups", self._state, self._design_state)

    @property
    def physicalProperties(self):
        return PhysicalProperties()

    def getPhysicalProperties(self, accuracy=None):
        return self.physicalProperties

    @property
    def boundingBox(self):
        return SimpleNamespace(
            minPoint=Point3D.create(-1, -1, -1),
            maxPoint=Point3D.create(1, 1, 1),
        )

    def __getattr__(self, name):
        value = UniversalStub(name)
        setattr(self, name, value)
        return value

    def createOpenProfile(self, curves, is_chain=False):
        if curves is None:
            curve_list = []
        elif isinstance(curves, BaseCollection):
            curve_list = list(curves)
        elif isinstance(curves, (list, tuple)):
            curve_list = list(curves)
        else:
            curve_list = [curves]
        state = ProfileState(SketchState("OpenProfileSketch", self.xYConstructionPlane), 0, curve_list, "OpenProfile")
        return Profile(state)


class UnitsManager(Base):
    def __init__(self):
        self.defaultLengthUnits = "cm"

    def formatValue(self, value, units=""):
        return f"{float(value):g} {units}".strip()

    def evaluateExpression(self, expression, units=""):
        return _expression_number(expression, 0.0)


class Occurrence(Base):
    def __init__(self, state_or_name, comp=None):
        if isinstance(state_or_name, OccurrenceState):
            self._state = state_or_name
        else:
            comp_state = comp._state if isinstance(comp, Component) else ComponentState(getattr(comp, "name", "Component"))
            self._state = OccurrenceState(str(state_or_name), comp_state)

    @property
    def name(self):
        return self._state.name

    @property
    def component(self):
        return Component(self._state.component)

    @property
    def bRepBodies(self):
        return self.component.bRepBodies

    @property
    def transform(self):
        from adsk.core import Matrix3D
        return Matrix3D.create()

    @transform.setter
    def transform(self, value):
        self._transform = value

    @property
    def physicalProperties(self):
        return PhysicalProperties()

    def getPhysicalProperties(self, accuracy=None):
        return self.physicalProperties

    def activate(self):
        return True

    def createForAssemblyContext(self, occurrence):
        return self

    @property
    def childOccurrences(self):
        return self.component.occurrences


class Occurrences(BaseCollection):
    def __init__(self, component_state=None):
        self._component_state = component_state
        super().__init__([Occurrence(state) for state in (component_state.occurrences if component_state else [])])

    def addNewComponent(self, transform):
        comp = ComponentState(f"Component{len(self._component_state.occurrences) + 1 if self._component_state else self.count + 1}")
        occ_state = OccurrenceState(f"Occurrence{len(self._component_state.occurrences) + 1 if self._component_state else self.count + 1}", comp)
        if self._component_state is not None:
            self._component_state.occurrences.append(occ_state)
        self._items.append(Occurrence(occ_state))
        return Occurrence(occ_state)

    def addExistingComponent(self, component, transform):
        comp_state = component._state if isinstance(component, Component) else ComponentState(getattr(component, "name", "Component"))
        occ_state = OccurrenceState(f"Occurrence{len(self._component_state.occurrences) + 1 if self._component_state else self.count + 1}", comp_state)
        if self._component_state is not None:
            self._component_state.occurrences.append(occ_state)
        self._items.append(Occurrence(occ_state))
        return Occurrence(occ_state)

    @property
    def asList(self):
        return self

    def __call__(self):
        return list(self)

    def __getitem__(self, index):
        while self.count <= index:
            self.addNewComponent(None)
        return self.item(index)


class Design(Base):
    productType = "DesignProductType"

    def __init__(self, document):
        self._document = document
        state = document._state.design
        native_design = getattr(document._state.native_doc, "design", None)
        native_root = getattr(native_design, "root_component", None)
        if native_root is not None and not state.root_component.bodies and not state.root_component.occurrences:
            state.root_component = Component(native_root)._state
        self._state = state
        self._root_component = Component(self._state.root_component, self._state)
        self._document._state.wrappers["design"] = self

    @staticmethod
    def cast(value):
        if isinstance(value, Design):
            return value
        products = getattr(value, "products", None)
        if products is not None:
            return products.itemByProductType(Design.productType)
        return None

    @property
    def name(self):
        return "Design"

    @property
    def designType(self):
        return DesignTypes.DirectDesignType

    @designType.setter
    def designType(self, value):
        self._state.design_type = value

    @property
    def rootComponent(self):
        return self._root_component

    @property
    def parentDocument(self):
        return self._document

    @property
    def allComponents(self):
        return BaseCollection([self._root_component])

    @property
    def allParameters(self):
        return UniversalStub("allParameters")

    @property
    def exportManager(self):
        return self._document.exportManager

    @property
    def appearances(self):
        from adsk.core import Appearance
        return BaseCollection([Appearance("Aluminum - Polished"), Appearance("Paint - Glossy Red")])

    @property
    def selectionSets(self):
        return BaseCollection()

    @property
    def unitsManager(self):
        return UnitsManager()

    @property
    def renderManager(self):
        return UniversalStub("renderManager")

    @property
    def occurrences(self):
        return self._root_component.occurrences

    @property
    def timeline(self):
        return Timeline(self._state)

    @property
    def designIntent(self):
        return self._state.design_intent

    @designIntent.setter
    def designIntent(self, value):
        self._state.design_intent = value

    def analyzeInterference(self, bodies):
        return BaseCollection()

    def areaProperties(self, profiles):
        return AreaProperties()

    def createInterferenceInput(self, entities):
        return UniversalStub("InterferenceInput", entities=entities)

    def __getattr__(self, name):
        value = UniversalStub(name)
        setattr(self, name, value)
        return value


class FeatureOperations:
    NewBodyFeatureOperation = 0
    NewComponentFeatureOperation = 4
    JoinFeatureOperation = 1
    CutFeatureOperation = 2
    IntersectFeatureOperation = 3


class FeatureHealthStates:
    HealthyFeatureHealthState = 0
    WarningFeatureHealthState = 1
    ErrorFeatureHealthState = 2


class FeatureExtentTypes:
    DistanceFeatureExtentType = 0
    ToEntityFeatureExtentType = 1
    AllFeatureExtentType = 2
    SymmetricFeatureExtentType = 3


class ExtentDirections:
    PositiveExtentDirection = 0
    NegativeExtentDirection = 1
    SymmetricExtentDirection = 2


class DimensionOrientations:
    HorizontalDimensionOrientation = 0
    VerticalDimensionOrientation = 1
    AlignedDimensionOrientation = 2


class DesignIntentTypes:
    HybridDesignIntentType = 0
    PartDesignIntentType = 1
    AssemblyDesignIntentType = 2


DesignTypes = _EnumContainer()
DesignTypes.ParametricDesignType = 0
DesignTypes.DirectDesignType = 1

JointKeyPointTypes = _EnumContainer()
JointKeyPointTypes.CenterKeyPoint = 0
SurfaceContinuityTypes = _EnumContainer()
SurfaceContinuityTypes.TangentSurfaceContinuityType = 0
SurfaceContinuityTypes.CurvatureSurfaceContinuityType = 1


class BRepBodyDefinition(Base):
    @staticmethod
    def create():
        return BRepBodyDefinition()

    def createVertexDefinition(self, point):
        return UniversalStub("BRepVertexDefinition", point=point)

    def createEdgeDefinitionByCurve(self, start_vertex, end_vertex, curve):
        return UniversalStub("BRepEdgeDefinition", startVertex=start_vertex, endVertex=end_vertex, curve=curve)

    def createFaceDefinition(self, loops):
        return UniversalStub("BRepFaceDefinition", loops=loops)

    def createLoopDefinition(self):
        return UniversalStub("BRepLoopDefinition")

    def createBody(self):
        return BRepBody(BodyState("BRepBodyDefinitionBody"))


class BRepEdgeDefinition(Base):
    @staticmethod
    def cast(value):
        return value


class BRepFaceDefinition(Base):
    @staticmethod
    def cast(value):
        return value


class ChordLengthFilletEdgeSet(Base):
    @staticmethod
    def classType():
        return "adsk.fusion.ChordLengthFilletEdgeSet"

    @staticmethod
    def cast(value):
        return value


class ConstantRadiusFilletEdgeSet(Base):
    @staticmethod
    def classType():
        return "adsk.fusion.ConstantRadiusFilletEdgeSet"


class VariableRadiusFilletEdgeSet(Base):
    @staticmethod
    def classType():
        return "adsk.fusion.VariableRadiusFilletEdgeSet"


class FilletEdgeSet(Base):
    def __init__(self, object_type, body):
        self._object_type = object_type
        edge = BRepBody(body).edges.item(0)
        self.edges = ObjectCollection.create()
        self.edges.add(edge)
        self.radius = _model_parameter("radius", 1.0)
        self.startRadius = _model_parameter("startRadius", 1.0)
        self.endRadius = _model_parameter("endRadius", 1.5)
        self.chordLength = _model_parameter("chordLength", 1.0)
        self.tangencyWeight = _model_parameter("tangencyWeight", 0.5)
        self.midPositions = BaseCollection([_model_parameter("midPosition", 0.5)])
        self.midRadii = BaseCollection([_model_parameter("midRadius", 1.0)])
        self.continuity = SurfaceContinuityTypes.TangentSurfaceContinuityType

    @property
    def objectType(self):
        return self._object_type

    def addMidPosition(self, position, radius):
        self.midPositions._append(_model_parameter("midPosition", position))
        self.midRadii._append(_model_parameter("midRadius", radius))
        return True


class JointGeometry(Base):
    @staticmethod
    def _make(kind, *args):
        geo = JointGeometry()
        geo.kind = kind
        geo.args = args
        return geo

    createByCurve = staticmethod(lambda *args: JointGeometry._make("curve", *args))
    createByPoint = staticmethod(lambda *args: JointGeometry._make("point", *args))
    createByPlanarFace = staticmethod(lambda *args: JointGeometry._make("planarFace", *args))
    createByNonPlanarFace = staticmethod(lambda *args: JointGeometry._make("nonPlanarFace", *args))
    createByProfile = staticmethod(lambda *args: JointGeometry._make("profile", *args))
    createByBetweenTwoPlanes = staticmethod(lambda *args: JointGeometry._make("betweenTwoPlanes", *args))


class TemporaryBRepManager(Base):
    @staticmethod
    def get():
        return TemporaryBRepManager()

    def createBox(self, box):
        return BRepBody(BodyState("TemporaryBox"))

    def copy(self, body):
        return body

    def createWireFromCurves(self, curves, options=None):
        body = BRepBody(BodyState("WireBody"))
        body._is_wire = True
        return body, ObjectCollection.create()

    def createCylinderOrCone(self, *args, **kwargs):
        return BRepBody(BodyState("TemporaryCylinder"))

    def createEllipticalCylinderOrCone(self, *args, **kwargs):
        return BRepBody(BodyState("TemporaryEllipticalCylinder"))


class _CustomGraphicsFactory(Base):
    @staticmethod
    def create(*args, **kwargs):
        item = _CustomGraphicsFactory()
        item.args = args
        item.kwargs = kwargs
        return item

    @staticmethod
    def cast(value):
        return value


CustomGraphicsAppearanceColorEffect = _CustomGraphicsFactory
CustomGraphicsBasicMaterialColorEffect = _CustomGraphicsFactory
CustomGraphicsBillBoard = _CustomGraphicsFactory
CustomGraphicsCoordinates = _CustomGraphicsFactory
CustomGraphicsGroup = _CustomGraphicsFactory
CustomGraphicsGroups = _CustomGraphicsFactory
CustomGraphicsPointSet = _CustomGraphicsFactory
CustomGraphicsSolidColorEffect = _CustomGraphicsFactory
CustomGraphicsVertexColorEffect = _CustomGraphicsFactory
CustomGraphicsViewPlacement = _CustomGraphicsFactory
CustomGraphicsViewScale = _CustomGraphicsFactory


def __getattr__(name):
    if name.endswith("Types") or name.endswith("States"):
        value = _EnumContainer()
        globals()[name] = value
        return value
    cls = type(name, (UniversalStub,), {
        "create": staticmethod(lambda *args, **kwargs: UniversalStub(name, args=args, kwargs=kwargs)),
        "cast": staticmethod(lambda value: value),
        "classType": staticmethod(lambda: f"adsk.fusion.{name}"),
    })
    globals()[name] = cls
    return cls
