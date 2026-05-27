from pathlib import Path
from types import SimpleNamespace

import aim3d.cam as aim_cam
from adsk import Aim3dUnsupportedFeatureError
from adsk._state import OperationState, ParameterState, ParameterValueState, SetupState, parameter
from adsk.core import Base, BaseCollection, URL, _run_sync


def _unsupported(feature_name, alternative="aim3d.cam"):
    raise Aim3dUnsupportedFeatureError(feature_name, alternative)


class _EnumContainer:
    def __getattr__(self, name):
        value = len(self.__dict__)
        setattr(self, name, value)
        return value


class CAMParameter(Base):
    def __init__(self, state):
        self._state = state

    @property
    def name(self):
        return self._state.name

    @property
    def value(self):
        return self._state.value

    @property
    def expression(self):
        return self._state.expression

    @expression.setter
    def expression(self, value):
        self._state.expression = str(value)
        self._state.value.expression = str(value)


class CAMParameters(BaseCollection):
    def __init__(self, mapping=None):
        self._mapping = mapping if mapping is not None else {}
        super().__init__([CAMParameter(item) for item in self._mapping.values()])

    def itemByName(self, name):
        return CAMParameter(parameter(self._mapping, name))


class GenerateToolpathFuture(Base):
    def __init__(self, operation=None):
        self.operation = operation
        self.isGenerationCompleted = True
        self.progress = 1.0
        self.numberOfOperations = 1 if operation is not None else 0
        self.numberOfCompleted = self.numberOfOperations


class Operation(Base):
    def __new__(cls, native_or_state):
        if isinstance(native_or_state, OperationState) and hasattr(native_or_state, "_wrapper"):
            return native_or_state._wrapper
        instance = super().__new__(cls)
        if isinstance(native_or_state, OperationState):
            native_or_state._wrapper = instance
        return instance

    def __init__(self, native_or_state):
        if "_state" in self.__dict__:
            return
        if isinstance(native_or_state, OperationState):
            self._state = native_or_state
        else:
            self._state = OperationState(getattr(native_or_state, "name", "Pocket1"), native_operation=native_or_state)

    @property
    def name(self):
        return self._state.name

    @name.setter
    def name(self, value):
        self._state.name = str(value)

    @property
    def parameters(self):
        return CAMParameters(self._state.parameters)

    @parameters.setter
    def parameters(self, value):
        self._state.parameters = getattr(value, "_mapping", value if isinstance(value, dict) else {})

    @property
    def tool(self):
        return self._state.tool

    @tool.setter
    def tool(self, value):
        self._state.tool = value

    @property
    def isLightBulbOn(self):
        return self._state.is_light_bulb_on

    @isLightBulbOn.setter
    def isLightBulbOn(self, value):
        self._state.is_light_bulb_on = bool(value)

    def generateToolpath(self):
        native = getattr(self._state, "native_operation", None)
        generate = getattr(native, "generate_toolpath_async", None)
        if generate is None:
            return GenerateToolpathFuture(self)
        return _run_sync(generate(), "aim3d.cam.Operation.generate_toolpath_async")

    def duplicate(self):
        return Operation(OperationState(self.name + " Copy", self._state.operation_type))

    def copyAfter(self, operation):
        return self.duplicate()

    def copyBefore(self, operation):
        return self.duplicate()

    def __getattr__(self, name):
        value = SimpleNamespace(name=name)
        setattr(self, name, value)
        return value


class OperationInput(Base):
    def __init__(self, operation_type):
        self.operationType = operation_type
        self.name = operation_type
        self.displayName = operation_type
        self.tool = None
        self.parameters = CAMParameters({})


class Operations(BaseCollection):
    def __init__(self, setup_state=None):
        self._setup_state = setup_state
        super().__init__([Operation(op) for op in (setup_state.operations if setup_state else [])])

    @property
    def count(self):
        if self._setup_state is not None:
            return len(self._setup_state.operations)
        return super().count

    def item(self, index):
        if self._setup_state is not None:
            if 0 <= index < len(self._setup_state.operations):
                return Operation(self._setup_state.operations[index])
            return None
        return super().item(index)

    def itemByName(self, name):
        if self._setup_state is not None:
            for operation in self._setup_state.operations:
                if operation.name == name:
                    return Operation(operation)
            return None
        return super().itemByName(name)

    def createInput(self, operation_type):
        return OperationInput(operation_type)

    def add(self, input_object):
        name = getattr(input_object, "displayName", None) or getattr(input_object, "name", None) or getattr(input_object, "operationType", "Operation")
        state = OperationState(str(name), str(getattr(input_object, "operationType", "milling")))
        state.tool = getattr(input_object, "tool", None)
        if hasattr(input_object, "parameters"):
            state.parameters.update(getattr(input_object.parameters, "_mapping", {}))
        if self._setup_state is not None:
            self._setup_state.operations.append(state)
        self._items.append(Operation(state))
        return Operation(state)


class SetupInput(Base):
    def __init__(self, operation_type="milling"):
        self.operationType = operation_type
        self.name = "Setup"
        self.models = []


class Setup(Base):
    def __init__(self, native_or_state):
        if isinstance(native_or_state, SetupState):
            self._state = native_or_state
        else:
            operations = getattr(native_or_state, "operations", {})
            self._state = SetupState(getattr(native_or_state, "name", "Setup1"))
            self._state.operations = [OperationState(getattr(op, "name", name), native_operation=op) for name, op in operations.items()]

    @property
    def name(self):
        return self._state.name

    @name.setter
    def name(self, value):
        self._state.name = str(value)

    @property
    def operations(self):
        return Operations(self._state)

    @property
    def parameters(self):
        return CAMParameters(self._state.parameters)

    @property
    def stockMode(self):
        return self._state.stock_mode

    @stockMode.setter
    def stockMode(self, value):
        self._state.stock_mode = value

    def createOperationInput(self, operation_type):
        return OperationInput(operation_type)

    def postProcess(self, post_input=None):
        operation = self._state.operations[0] if self._state.operations else OperationState("Pocket1")
        setup = aim_cam.Setup(self._state.name)
        native_operation = getattr(operation, "native_operation", None)
        if native_operation is None:
            native_operation = OperationState(getattr(operation, "name", "Pocket1")).native_operation
        setup._operations["Pocket1"] = native_operation
        return _run_sync(setup.post_process_async(), "aim3d.cam.Setup.post_process_async")


class Setups(BaseCollection):
    def __init__(self, cam_state=None):
        self._cam_state = cam_state
        super().__init__([Setup(setup) for setup in (cam_state.setups if cam_state else [])])

    @property
    def count(self):
        if self._cam_state is not None:
            return len(self._cam_state.setups)
        return super().count

    def item(self, index):
        if self._cam_state is not None:
            if 0 <= index < len(self._cam_state.setups):
                return Setup(self._cam_state.setups[index])
            return None
        return super().item(index)

    def itemByName(self, name):
        if self._cam_state is not None:
            for setup in self._cam_state.setups:
                if setup.name == name:
                    return Setup(setup)
            return None
        return super().itemByName(name)

    def createInput(self, operation_type="milling"):
        return SetupInput(operation_type)

    def add(self, input_object):
        state = SetupState(getattr(input_object, "name", "Setup"), getattr(input_object, "operationType", "milling"))
        state.models = list(getattr(input_object, "models", []) or [])
        if self._cam_state is not None:
            self._cam_state.setups.append(state)
        self._items.append(Setup(state))
        return Setup(state)


class NCProgramInput(Base):
    def __init__(self):
        self.displayName = "NC Program"
        self.operations = []
        self.parameters = CAMParameters({})


class NCProgram(Base):
    def __init__(self, input_object):
        self.name = getattr(input_object, "displayName", "NC Program")
        self.displayName = self.name
        self.operations = list(getattr(input_object, "operations", []) or [])
        self.parameters = getattr(input_object, "parameters", CAMParameters({}))
        self.postParameters = CAMParameters({})
        self.postConfiguration = None
        self.output = ""

    def updatePostParameters(self, post_parameters):
        self.postParameters = post_parameters
        return True

    def postProcess(self, options=None):
        setup = Setup(SetupState("NCProgramSetup", operations=[
            op._state if isinstance(op, Operation) else OperationState(getattr(op, "name", "Operation"))
            for op in self.operations
        ] or [OperationState("Pocket1")]))
        self.output = setup.postProcess(options)
        return True


class NCPrograms(BaseCollection):
    def __init__(self, cam_state):
        self._cam_state = cam_state
        super().__init__(cam_state.nc_programs)

    def createInput(self):
        return NCProgramInput()

    def add(self, input_object):
        program = NCProgram(input_object)
        self._cam_state.nc_programs.append(program)
        self._items.append(program)
        return program


class CAM(Base):
    productType = "CAMProductType"

    def __init__(self, document=None):
        self._document = document
        if document is not None and hasattr(document, "_state"):
            self._state = document._state.cam
            document._state.wrappers["cam"] = self
        else:
            self._state = SimpleNamespace(setups=[SetupState("Setup1", operations=[OperationState("Pocket1")])], temporary_folder="/tmp", nc_programs=[])

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
        return Setups(self._state)

    @property
    def manufacturingModels(self):
        return ManufacturingModels()

    @property
    def allOperations(self):
        operations = []
        for setup in self._state.setups:
            operations.extend(Operation(op) for op in setup.operations)
        return BaseCollection(operations)

    @property
    def ncPrograms(self):
        return NCPrograms(self._state)

    @property
    def temporaryFolder(self):
        return self._state.temporary_folder

    @property
    def designRootOccurrence(self):
        from adsk.fusion import Occurrence

        root = self._document._state.design.root_component if self._document is not None else None
        return Occurrence("RootOccurrence", SimpleNamespace(_state=root))

    def generateToolpath(self, operation):
        if isinstance(operation, Operation):
            operation.generateToolpath()
        return GenerateToolpathFuture(operation)

    def generateAllToolpaths(self, skip_valid=True):
        for setup in self.setups:
            for operation in setup.operations:
                operation.generateToolpath()
        return GenerateToolpathFuture()

    def generateAllSetupSheets(self, *args, **kwargs):
        return GenerateToolpathFuture()


class CAMManager(Base):
    @staticmethod
    def get():
        return CAMManager()

    def __init__(self):
        self.libraryManager = CAMLibraryManager()


class CAMLibraryManager(Base):
    def __init__(self):
        self.toolLibraries = ToolLibraries()
        self.postLibrary = PostLibrary()
        self.templateLibrary = CAMTemplateLibrary()


class ManufacturingModels(BaseCollection):
    def createInput(self):
        return SimpleNamespace(name="ManufacturingModelInput", occurrence=None)

    def add(self, input_object):
        model = SimpleNamespace(name=getattr(input_object, "name", "ManufacturingModel"), occurrence=getattr(input_object, "occurrence", None))
        self._items.append(model)
        return model


class Tool(Base):
    def __init__(self, name, tool_type, diameter):
        self.name = name
        self.parameters = CAMParameters({
            "tool_type": ParameterState("tool_type", ParameterValueState(tool_type, tool_type), tool_type),
            "tool_diameter": ParameterState("tool_diameter", ParameterValueState(diameter, str(diameter)), str(diameter)),
        })


class ToolLibrary(BaseCollection):
    def __init__(self):
        super().__init__([
            Tool("Face Mill", "face mill", 5.0),
            Tool("Bull Nose 12mm", "bull nose end mill", 1.2),
            Tool("Flat End Mill", "flat end mill", 1.0),
        ])

    def createQuery(self):
        return SimpleNamespace(criteria=BaseCollection())


class ToolLibraries(Base):
    def urlByLocation(self, location):
        return URL.create(f"toollibrary://{location}")

    def toolLibraryAtURL(self, url):
        return ToolLibrary()

    def childAssetURLs(self, url):
        return BaseCollection([URL.create(str(url) + "/default")])


class MachineLibrary(Base):
    def urlByLocation(self, location):
        return URL.create(f"machine://{location}")

    def childMachines(self, url):
        return BaseCollection()


class PrintSettingLibrary(Base):
    def urlByLocation(self, location):
        return URL.create(f"printsetting://{location}")

    def childPrintSettings(self, url):
        return BaseCollection()


class PostConfiguration(Base):
    def __init__(self, description="XYZ", extension=".nc"):
        self.description = description
        self.extension = extension


class PostConfigurationQuery(Base):
    def __init__(self, location):
        self.location = location
        self.vendor = ""
        self.capability = None
        self.criteria = BaseCollection()

    def execute(self):
        return [PostConfiguration("XYZ", ".nc"), PostConfiguration("LinuxCNC", ".ngc")]


class PostLibrary(Base):
    def createQuery(self, location):
        return PostConfigurationQuery(location)

    def importPostConfiguration(self, config, url, name):
        return URL.create(f"{url}/{name}")

    def postConfigurationAtURL(self, url):
        return PostConfiguration(Path(str(url)).stem or "XYZ", ".nc")


class NCProgramPostProcessOptions(Base):
    @staticmethod
    def create():
        return NCProgramPostProcessOptions()


class OperationTypes:
    MillingOperation = "milling"
    TurningOperation = "turning"


class SetupStockModes:
    RelativeBoxStock = "relativeBox"
    FixedBoxStock = "fixedBox"
    SolidStock = "solidStock"


class LibraryLocations:
    Fusion360LibraryLocation = "fusion360"
    LocalLibraryLocation = "local"
    CloudLibraryLocation = "cloud"


class PostCapabilities:
    Milling = "milling"
    Turning = "turning"


class CAMTemplate(Base):
    @staticmethod
    def createFromFile(path):
        template = CAMTemplate()
        template.path = str(path)
        return template


class CreateFromCAMTemplateInput(Base):
    @staticmethod
    def create(template):
        item = CreateFromCAMTemplateInput()
        item.template = template
        return item


class RecognizedHolesInput(Base):
    @staticmethod
    def create():
        return RecognizedHolesInput()


class RecognizedHole(Base):
    @staticmethod
    def recognizeHoles(*args, **kwargs):
        return []


class RecognizedHoleGroup(Base):
    @staticmethod
    def recognizeHoleGroupsWithInput(*args, **kwargs):
        return []


class RecognizedPocket(Base):
    @staticmethod
    def recognizePockets(*args, **kwargs):
        return []


class AdditivePlatformMachineElement(Base):
    @staticmethod
    def staticTypeId():
        _unsupported("AdditivePlatformMachineElement", "subtractive aim3d.cam milling APIs")


MachiningMode = _EnumContainer()
MachiningMode.Avoid_MachiningMode = 0
MachiningMode.Machine_MachiningMode = 1
MachiningMode.Gouge_MachiningMode = 2
MachiningMode.Fixture_MachiningMode = 3
MachiningMode.Milling = "milling"
MachineAvoidGroups = _EnumContainer()
AvoidSelectionType = _EnumContainer()


class CAMTemplateLibrary(BaseCollection):
    pass


def __getattr__(name):
    if name.endswith("Types") or name.endswith("Modes") or name.endswith("Locations") or name.endswith("Capabilities"):
        value = _EnumContainer()
        globals()[name] = value
        return value
    cls = type(name, (Base,), {
        "create": staticmethod(lambda *args, **kwargs: SimpleNamespace(args=args, kwargs=kwargs)),
        "cast": staticmethod(lambda value: value),
        "classType": staticmethod(lambda: f"adsk.cam.{name}"),
    })
    globals()[name] = cls
    return cls
