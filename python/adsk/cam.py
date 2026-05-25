import aim3d.cam as aim_cam
from adsk import Aim3dUnsupportedFeatureError
from adsk.core import Base, BaseCollection, _run_sync


def _unsupported(feature_name, alternative="aim3d.cam"):
    raise Aim3dUnsupportedFeatureError(feature_name, alternative)


class Operation(Base):
    def __init__(self, native_op):
        self._native_op = native_op

    @property
    def name(self):
        return getattr(self._native_op, "name", "")

    def generateToolpath(self):
        return _run_sync(self._native_op.generate_toolpath_async(), "aim3d.cam.Operation.generate_toolpath_async")


class Operations(BaseCollection):
    def add(self, input_object):
        _unsupported("Operations.add", "aim3d.cam operation construction APIs")


class OperationInput(Base):
    def __init__(self, operation_type):
        self.operationType = operation_type
        self.name = operation_type


class SetupInput(Base):
    def __init__(self, operation_type="milling"):
        self.operationType = operation_type
        self.name = "Setup"


class Setup(Base):
    def __init__(self, native_setup):
        self._native_setup = native_setup
        operations = getattr(native_setup, "operations", {})
        self._operations = Operations([Operation(op) for op in operations.values()])

    @property
    def name(self):
        return getattr(self._native_setup, "name", "")

    @property
    def operations(self):
        return self._operations

    def createOperationInput(self, operation_type):
        return OperationInput(operation_type)

    def postProcess(self, post_input=None):
        return _run_sync(self._native_setup.post_process_async(), "aim3d.cam.Setup.post_process_async")


class Setups(BaseCollection):
    def createInput(self, operation_type="milling"):
        return SetupInput(operation_type)

    def add(self, input_object):
        _unsupported("Setups.add", "aim3d.cam setup construction APIs")


class CAM(Base):
    productType = "CAMProductType"

    def __init__(self, document=None):
        self._document = document
        native_setup = aim_cam.setups.active_setup
        self._setups = Setups([Setup(native_setup)])

    @staticmethod
    def cast(value):
        if isinstance(value, CAM):
            return value
        products = getattr(value, "products", None)
        if products is not None:
            return products.itemByProductType(CAM.productType)
        return None

    @property
    def name(self):
        return "CAM"

    @property
    def setups(self):
        return self._setups
