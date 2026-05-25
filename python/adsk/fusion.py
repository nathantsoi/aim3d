from adsk import Aim3dUnsupportedFeatureError
from adsk.core import Base, BaseCollection


def _unsupported(feature_name, alternative="aim3d.core"):
    raise Aim3dUnsupportedFeatureError(feature_name, alternative)


class BRepBody(Base):
    def __init__(self, native_body):
        self._native_body = native_body

    @property
    def name(self):
        return getattr(self._native_body, "name", "")

    @property
    def isValid(self):
        return self._native_body is not None


class BRepBodies(BaseCollection):
    def __init__(self, bodies_list=None):
        super().__init__([BRepBody(body) for body in bodies_list or []])


class SketchInput(Base):
    def __init__(self, plane):
        self.plane = plane
        self.name = "Sketch"


class Sketches(BaseCollection):
    def createInput(self, plane):
        return SketchInput(plane)

    def add(self, plane_or_input):
        _unsupported("Sketches.add", "aim3d.core sketch solver APIs")


class ExtrudeFeatureInput(Base):
    def __init__(self, profile, operation):
        self.profile = profile
        self.operation = operation
        self.distance = None

    def setDistanceExtent(self, is_symmetric, distance):
        self.distance = distance
        self.isSymmetric = bool(is_symmetric)
        return True


class ExtrudeFeatures(BaseCollection):
    def createInput(self, profile, operation):
        return ExtrudeFeatureInput(profile, operation)

    def add(self, input_object):
        _unsupported("ExtrudeFeatures.add", "aim3d.core feature/history APIs")


class Features(Base):
    def __init__(self):
        self._extrude_features = ExtrudeFeatures()

    @property
    def extrudeFeatures(self):
        return self._extrude_features


class Component(Base):
    def __init__(self, native_comp):
        self._native_comp = native_comp
        self._occurrences = Occurrences()
        self._sketches = Sketches()
        self._features = Features()

    @property
    def name(self):
        return getattr(self._native_comp, "name", "RootComponent")

    @property
    def bRepBodies(self):
        return BRepBodies(getattr(self._native_comp, "b_rep_bodies", []))

    @property
    def occurrences(self):
        return self._occurrences

    @property
    def sketches(self):
        return self._sketches

    @property
    def features(self):
        return self._features


class Occurrence(Base):
    def __init__(self, name, comp):
        self._name = name
        self._component = comp

    @property
    def name(self):
        return self._name

    @property
    def component(self):
        return self._component


class Occurrences(BaseCollection):
    def addNewComponent(self, transform):
        _unsupported("Occurrences.addNewComponent", "aim3d.core document/component APIs")


class Design(Base):
    productType = "DesignProductType"

    def __init__(self, document):
        self._document = document
        native_design = getattr(document._native_doc, "design", None)
        native_root = getattr(native_design, "root_component", None)
        self._root_component = Component(native_root)

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
    def rootComponent(self):
        return self._root_component

    @property
    def occurrences(self):
        return self._root_component.occurrences


class FeatureOperations:
    NewBodyFeatureOperation = 0
    JoinFeatureOperation = 1
    CutFeatureOperation = 2
    IntersectFeatureOperation = 3
