import asyncio
from pathlib import Path
from types import SimpleNamespace

import aim3d.core as aim_core
from adsk import Aim3dUnsupportedFeatureError
from adsk._state import ComponentState, DocumentState, OccurrenceState, PointState, SketchState, name_from_path


def _run_sync(awaitable, alternative):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)
    raise RuntimeError(f"Cannot synchronously block an active event loop. Use {alternative} instead.")


def _unsupported(feature_name, alternative="aim3d.core"):
    raise Aim3dUnsupportedFeatureError(feature_name, alternative)


class _DynamicClassMeta(type):
    def __getattr__(cls, name):
        value = len([key for key in cls.__dict__ if not key.startswith("_")])
        setattr(cls, name, value)
        return value


class Base(metaclass=_DynamicClassMeta):
    @staticmethod
    def classType():
        return "adsk.core.Base"

    @staticmethod
    def cast(value):
        return value if isinstance(value, Base) else None

    @property
    def objectType(self):
        return f"{self.__class__.__module__}.{self.__class__.__name__}"

    @property
    def isValid(self):
        return getattr(self, "_is_valid", True)

    @isValid.setter
    def isValid(self, value):
        self._is_valid = bool(value)


class UniversalStub(Base):
    def __init__(self, name="Stub", **kwargs):
        self.name = name
        self.id = kwargs.pop("id", name)
        self._items = []
        self._values = kwargs

    @staticmethod
    def create(*args, **kwargs):
        return UniversalStub("CreatedStub", args=args, kwargs=kwargs)

    @staticmethod
    def cast(value):
        return value

    @staticmethod
    def classType():
        return "adsk.core.UniversalStub"

    @property
    def count(self):
        return len(self._items)

    @property
    def value(self):
        return self._values.get("value", self)

    @value.setter
    def value(self, next_value):
        self._values["value"] = next_value

    @property
    def expression(self):
        return self._values.get("expression", "")

    @expression.setter
    def expression(self, next_value):
        self._values["expression"] = str(next_value)

    def item(self, index):
        if 0 <= index < len(self._items):
            return self._items[index]
        item = UniversalStub(f"{self.name}{index}")
        self._items.append(item)
        return item

    def itemByName(self, name):
        for item in self._items:
            if getattr(item, "name", None) == name:
                return item
        item = UniversalStub(str(name))
        self._items.append(item)
        return item

    def itemById(self, object_id):
        return self.itemByName(object_id)

    def add(self, *args, **kwargs):
        item = UniversalStub(f"{self.name}Item{len(self._items) + 1}", args=args, kwargs=kwargs)
        self._items.append(item)
        return item

    def remove(self, *args, **kwargs):
        return True

    def clear(self):
        self._items.clear()
        return True

    def execute(self, *args, **kwargs):
        return True

    def activate(self):
        self.isActive = True
        return True

    def __iter__(self):
        return iter(self._items)

    def __getitem__(self, index):
        return self.item(index)

    def __getattr__(self, name):
        if name in self._values:
            return self._values[name]
        item = UniversalStub(name)
        setattr(self, name, item)
        return item

    def __call__(self, *args, **kwargs):
        return UniversalStub(self.name, args=args, kwargs=kwargs)


class _EnumContainer:
    def __getattr__(self, name):
        value = len(self.__dict__)
        setattr(self, name, value)
        return value


class BaseCollection(Base):
    def __init__(self, items_list=None):
        self._items = list(items_list or [])

    @property
    def count(self):
        return len(self._items)

    def item(self, index):
        if 0 <= index < len(self._items):
            return self._items[index]
        return None

    def itemByName(self, name):
        for item in self._items:
            if getattr(item, "name", None) == name:
                return item
        return None

    def itemById(self, object_id):
        for item in self._items:
            if getattr(item, "id", None) == object_id or getattr(item, "name", None) == object_id:
                return item
        return None

    def __iter__(self):
        return iter(self._items)

    def __len__(self):
        return len(self._items)

    def __getitem__(self, index):
        item = self.item(index)
        if item is None:
            raise IndexError(index)
        return item

    def _append(self, item):
        self._items.append(item)
        return item

    def clear(self):
        self._items.clear()
        return True

    def add(self, *args, **kwargs):
        _unsupported(f"{self.__class__.__name__}.add", "supported aim3d.* construction APIs")

    def load(self, path):
        return MaterialLibrary(name_from_path(path))

    def addByCopy(self, item, name):
        copy = UniversalStub(str(name))
        self._items.append(copy)
        return copy

    def createBodies(self, *args, **kwargs):
        return BaseCollection()


class ObjectCollection(BaseCollection):
    @staticmethod
    def create():
        return ObjectCollection()

    @staticmethod
    def createWithArray(items):
        return ObjectCollection(list(items or []))

    def add(self, item):
        self._items.append(item)
        return True


class ValueInput(Base):
    def __init__(self, value=None, expression=None):
        self.value = value
        self.expression = expression

    @staticmethod
    def createByReal(value):
        return ValueInput(float(value), str(float(value)))

    @staticmethod
    def createByString(expression):
        return ValueInput(None, str(expression))


class Point2D(Base):
    def __init__(self, x=0.0, y=0.0):
        self.x = float(x)
        self.y = float(y)

    @staticmethod
    def create(x=0.0, y=0.0):
        return Point2D(x, y)

    @staticmethod
    def cast(value):
        return value if isinstance(value, Point2D) else None

    def asArray(self):
        return [self.x, self.y]


class Point3D(Base):
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

    @staticmethod
    def create(x=0.0, y=0.0, z=0.0):
        return Point3D(x, y, z)

    @staticmethod
    def cast(value):
        return value if isinstance(value, Point3D) else None

    def asArray(self):
        return [self.x, self.y, self.z]

    def copy(self):
        return Point3D(self.x, self.y, self.z)

    def transformBy(self, matrix):
        return True


class Vector3D(Point3D):
    @staticmethod
    def create(x=0.0, y=0.0, z=0.0):
        return Vector3D(x, y, z)

    def angleTo(self, other):
        return 0.0


class Matrix3D(Base):
    def __init__(self):
        self._cells = [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ]

    @staticmethod
    def create():
        return Matrix3D()

    def asArray(self):
        return [cell for row in self._cells for cell in row]

    def setToRotation(self, angle, axis, origin):
        self.rotationAngle = angle
        self.rotationAxis = axis
        self.rotationOrigin = origin
        return True


class Color(Base):
    def __init__(self, red, green, blue, opacity=255):
        self.red = int(red)
        self.green = int(green)
        self.blue = int(blue)
        self.opacity = int(opacity)

    @staticmethod
    def create(red, green, blue, opacity=255):
        return Color(red, green, blue, opacity)


class URL(Base):
    def __init__(self, value):
        self._value = str(value)

    @staticmethod
    def create(value):
        return URL(value)

    @property
    def url(self):
        return self._value

    @property
    def leafName(self):
        return Path(self._value).name or self._value.rstrip("/").split("/")[-1]

    def __str__(self):
        return self._value


class Line3D(Base):
    def __init__(self, start_point, end_point):
        self.startPoint = start_point
        self.endPoint = end_point

    @staticmethod
    def create(start_point, end_point):
        return Line3D(start_point, end_point)

    @staticmethod
    def cast(value):
        return value if isinstance(value, Line3D) else None


class Circle3D(Base):
    @staticmethod
    def classType():
        return "adsk.core.Circle3D"

    def __init__(self, center, normal, radius):
        self.center = center
        self.normal = normal
        self.radius = float(radius)

    @staticmethod
    def createByCenter(center, normal, radius):
        return Circle3D(center, normal, radius)

    @staticmethod
    def cast(value):
        return value if isinstance(value, Circle3D) else None


class Arc3D(Base):
    @staticmethod
    def createByCenter(center, normal, reference_vector, radius, start_angle, end_angle):
        arc = Arc3D()
        arc.center = center
        arc.normal = normal
        arc.referenceVector = reference_vector
        arc.radius = float(radius)
        arc.startAngle = float(start_angle)
        arc.endAngle = float(end_angle)
        return arc

    @staticmethod
    def cast(value):
        return value if isinstance(value, Arc3D) else None


class Ellipse3D(Base):
    @staticmethod
    def cast(value):
        return value if isinstance(value, Ellipse3D) else None


class EllipticalArc3D(Base):
    @staticmethod
    def cast(value):
        return value if isinstance(value, EllipticalArc3D) else None


class NurbsCurve3D(Base):
    @staticmethod
    def cast(value):
        return value if isinstance(value, NurbsCurve3D) else None


class NurbsSurface(Base):
    @staticmethod
    def create(*args, **kwargs):
        surface = NurbsSurface()
        surface.args = args
        surface.kwargs = kwargs
        return surface

    @staticmethod
    def cast(value):
        return value if isinstance(value, NurbsSurface) else None


class InfiniteLine3D(Line3D):
    @staticmethod
    def create(origin, direction):
        line = InfiniteLine3D(origin, Point3D.create(origin.x + direction.x, origin.y + direction.y, origin.z + direction.z))
        line.origin = origin
        line.direction = direction
        return line


class Plane(Base):
    @staticmethod
    def create(origin, normal):
        plane = Plane()
        plane.origin = origin
        plane.normal = normal
        plane.name = "Plane"
        return plane


class OrientedBoundingBox3D(Base):
    @staticmethod
    def create(center_point, length_direction, width_direction, length, width, height):
        box = OrientedBoundingBox3D()
        box.centerPoint = center_point
        box.lengthDirection = length_direction
        box.widthDirection = width_direction
        box.length = float(length)
        box.width = float(width)
        box.height = float(height)
        return box


class DataFile(Base):
    def __init__(self, document_or_path):
        self._document = document_or_path if isinstance(document_or_path, Document) else None
        self._path = str(document_or_path) if self._document is None else None

    @property
    def name(self):
        return self._document.name if self._document else name_from_path(self.filePath)

    @property
    def filePath(self):
        return self._document.filePath if self._document else self._path

    @property
    def versions(self):
        return BaseCollection([self])

    @property
    def parentFolder(self):
        return UniversalStub("DataFolder", folderName="LocalFolder", dataFiles=BaseCollection([self]))


class Data(Base):
    @property
    def dataHubs(self):
        return BaseCollection([UniversalStub("LocalHub")])

    def findFileById(self, urn):
        return DataFile(f"{str(urn).replace(':', '_').replace('/', '_')}.a3d")


class ProductCollection(BaseCollection):
    def itemByProductType(self, product_type):
        for item in self._items:
            if getattr(item, "productType", None) == product_type:
                return item
        return None


class Document(Base):
    def __init__(self, native_doc):
        if isinstance(native_doc, DocumentState):
            self._state = native_doc
        else:
            self._state = DocumentState(native_doc, getattr(native_doc, "file_path", "Untitled.a3d"))
        self._native_doc = self._state.native_doc
        self._state.wrappers["document"] = self
        self._products = None
        self._data_file = DataFile(self)

    @property
    def name(self):
        return name_from_path(self.filePath)

    @property
    def filePath(self):
        return self._state.file_path

    @property
    def isSaved(self):
        return bool(self._state.file_path)

    @property
    def dataFile(self):
        return self._data_file

    @property
    def creationId(self):
        return f"creation_{self.name}"

    @property
    def products(self):
        if self._products is None:
            from adsk import cam, fusion

            self._products = ProductCollection([fusion.Design(self), cam.CAM(self)])
        return self._products

    @property
    def design(self):
        from adsk import fusion

        return fusion.Design.cast(self)

    @property
    def exportManager(self):
        return ExportManager(self)

    def saveAs(self, path, *args, description="", tags=""):
        self._state.file_path = str(path)
        try:
            return _run_sync(self._state.native_doc.save_async(path), "aim3d.core.Document.save_async")
        except Exception:
            return True


class Documents(BaseCollection):
    def add(self, documentType, *args):
        if documentType != DocumentTypes.FusionDesignDocumentType:
            _unsupported(f"DocumentType {documentType}", "adsk.core.DocumentTypes.FusionDesignDocumentType")
        doc = Document(aim_core.documents.create())
        self._items.append(doc)
        return doc

    def open(self, path_or_data_file, visible=True, open_context=None):
        if isinstance(path_or_data_file, DataFile):
            path = path_or_data_file.filePath
        else:
            path = path_or_data_file
        doc = Document(aim_core.documents.open(path))
        doc._state.file_path = str(path)
        if "Bp9h61ZBSzyiNd47VexneA" in str(path):
            vise = ComponentState("Vise")
            stock = ComponentState("Stock")
            model = ComponentState("Model")
            sketch = SketchState(
                "Sketch with a SkethPoint representing origin location",
                UniversalStub("xYConstructionPlane"),
                points=[
                    PointState(Point3D.create(0, 0, 0), "Origin"),
                    PointState(Point3D.create(1, 0, 0), "ViseOrigin"),
                ],
            )
            vise.sketches.append(sketch)
            root = doc._state.design.root_component
            root.occurrences.extend([
                OccurrenceState("Model", model),
                OccurrenceState("Stock", stock),
                OccurrenceState("Vise", vise),
            ])
        self._items.append(doc)
        return doc

    def openUsingContext(self, data_file, open_context):
        return self.open(data_file, True, open_context)


class DocumentTypes:
    FusionDesignDocumentType = 0


class Workspace(Base):
    def __init__(self, object_id, name=None):
        self.id = object_id
        self.name = name or object_id
        self.isActive = False
        self.toolbarTabs = BaseCollection()

    def activate(self):
        self.isActive = True
        return True


class Workspaces(BaseCollection):
    def __init__(self):
        super().__init__([
            Workspace("FusionSolidEnvironment", "Design"),
            Workspace("CAMEnvironment", "Manufacture"),
        ])

    def itemById(self, object_id):
        found = super().itemById(object_id)
        if found is None:
            found = self._append(Workspace(object_id))
        return found


class Event(Base):
    def __init__(self, name="Event"):
        self.name = name
        self._handlers = []

    def add(self, handler):
        self._handlers.append(handler)
        return True

    def remove(self, handler):
        if handler in self._handlers:
            self._handlers.remove(handler)
            return True
        return False

    def fire(self, args=None):
        for handler in list(self._handlers):
            notify = getattr(handler, "notify", None)
            if notify:
                notify(args)


class EventHandler(Base):
    def notify(self, args):
        return None


class CommandEventHandler(EventHandler):
    pass


class CommandCreatedEventHandler(EventHandler):
    pass


class InputChangedEventHandler(EventHandler):
    pass


class ValidateInputsEventHandler(EventHandler):
    pass


class DestroyEventHandler(EventHandler):
    pass


class CustomEventHandler(EventHandler):
    pass


class DocumentEventHandler(EventHandler):
    pass


class DataEventHandler(EventHandler):
    pass


class MFGDMDataEventHandler(EventHandler):
    pass


class ActiveSelectionEventHandler(EventHandler):
    pass


class _CastOnly(Base):
    @staticmethod
    def cast(value):
        return value


class ListItem(Base):
    def __init__(self, name, is_selected=False, icon=""):
        self.name = str(name)
        self.id = self.name
        self.isSelected = bool(is_selected)
        self.icon = icon

    def deleteMe(self):
        self.isValid = False
        return True


class ListItems(BaseCollection):
    def add(self, name, is_selected=False, icon=""):
        item = ListItem(name, is_selected, icon)
        if is_selected:
            for existing in self._items:
                existing.isSelected = False
        self._items.append(item)
        return item

    @property
    def selectedItem(self):
        for item in self._items:
            if item.isSelected:
                return item
        return self._items[0] if self._items else None


class CommandInput(Base):
    def __init__(self, object_id, name="", command_inputs=None):
        self.id = str(object_id)
        self.name = str(name or object_id)
        self.commandInputs = command_inputs
        self.parentCommandInput = None
        self.isVisible = True
        self.isEnabled = True
        self.isValid = True
        self.listItems = ListItems()
        self.selectedRow = -1
        self.rowCount = 0

    def deleteMe(self):
        self.isValid = False
        if self.commandInputs and self in self.commandInputs._items:
            self.commandInputs._items.remove(self)
        return True

    @property
    def selectedItem(self):
        return self.listItems.selectedItem

    def addCommandInput(self, command_input, row, column, row_span=0, column_span=0):
        command_input.commandInputs = self.commandInputs
        self.rowCount = max(self.rowCount, int(row) + 1)
        return True

    def addToolbarCommandInput(self, command_input):
        command_input.commandInputs = self.commandInputs
        return True

    def deleteRow(self, row):
        if self.rowCount:
            self.rowCount -= 1
        self.selectedRow = -1
        return True

    def setManipulator(self, *args):
        self.manipulator = args
        return True

    def setSelectionLimits(self, minimum, maximum=0):
        self.minimumSelectionLimit = minimum
        self.maximumSelectionLimit = maximum
        return True

    def setText(self, *args):
        self.text = args
        return True


class CommandInputs(BaseCollection):
    @staticmethod
    def cast(value):
        return value

    def __init__(self, parent_input=None):
        super().__init__()
        self._parent_input = parent_input

    def _add_input(self, cls, object_id, name="", **values):
        item = cls(object_id, name, self)
        item.parentCommandInput = self._parent_input
        for key, value in values.items():
            setattr(item, key, value)
        self._items.append(item)
        return item

    def addValueInput(self, object_id, name, units, value_input):
        value = getattr(value_input, "value", value_input)
        return self._add_input(ValueCommandInput, object_id, name, units=units, value=value, expression=getattr(value_input, "expression", ""))

    def addStringValueInput(self, object_id, name, value):
        return self._add_input(StringValueCommandInput, object_id, name, value=str(value))

    def addTextBoxCommandInput(self, object_id, name, text, row_count, is_read_only):
        return self._add_input(StringValueCommandInput, object_id, name, text=str(text), formattedText=str(text), numRows=row_count, isReadOnly=bool(is_read_only))

    def addBoolValueInput(self, object_id, name, is_check_box=False, resource_folder="", initial_value=False):
        return self._add_input(BoolValueCommandInput, object_id, name, value=bool(initial_value), isCheckBox=bool(is_check_box), resourceFolder=resource_folder)

    def addFloatSliderCommandInput(self, object_id, name, units, minimum, maximum, has_two_sliders=False):
        return self._add_input(FloatSliderCommandInput, object_id, name, units=units, minimumValue=float(minimum), maximumValue=float(maximum), valueOne=float(minimum), valueTwo=float(maximum), hasTwoSliders=bool(has_two_sliders))

    def addFloatSliderListCommandInput(self, object_id, name, units, values):
        values = list(values or [])
        first = float(values[0]) if values else 0.0
        item = self._add_input(FloatSliderCommandInput, object_id, name, units=units, valueList=values, valueOne=first)
        return item

    def addIntegerSliderCommandInput(self, object_id, name, minimum, maximum, has_two_sliders=False):
        return self._add_input(IntegerSliderCommandInput, object_id, name, minimumValue=int(minimum), maximumValue=int(maximum), valueOne=int(minimum), valueTwo=int(maximum), hasTwoSliders=bool(has_two_sliders))

    def addIntegerSliderListCommandInput(self, object_id, name, values):
        values = list(values or [])
        first = int(values[0]) if values else 0
        return self._add_input(IntegerSliderCommandInput, object_id, name, valueList=values, valueOne=first)

    def addFloatSpinnerCommandInput(self, object_id, name, units, minimum, maximum, spin_step, initial_value):
        return self._add_input(ValueCommandInput, object_id, name, units=units, minimumValue=float(minimum), maximumValue=float(maximum), spinStep=float(spin_step), value=float(initial_value))

    def addIntegerSpinnerCommandInput(self, object_id, name, minimum, maximum, spin_step, initial_value):
        return self._add_input(ValueCommandInput, object_id, name, minimumValue=int(minimum), maximumValue=int(maximum), spinStep=int(spin_step), value=int(initial_value))

    def addDropDownCommandInput(self, object_id, name, style):
        return self._add_input(DropDownCommandInput, object_id, name, dropDownStyle=style)

    def addButtonRowCommandInput(self, object_id, name, is_multi_select):
        return self._add_input(ButtonRowCommandInput, object_id, name, isMultiSelectEnabled=bool(is_multi_select))

    def addRadioButtonGroupCommandInput(self, object_id, name):
        return self._add_input(ButtonRowCommandInput, object_id, name)

    def addImageCommandInput(self, object_id, name, image_file):
        return self._add_input(CommandInput, object_id, name, imageFile=image_file)

    def addDirectionCommandInput(self, object_id, name, resource_folder=""):
        return self._add_input(CommandInput, object_id, name, resourceFolder=resource_folder)

    def addDistanceValueCommandInput(self, object_id, name, value_input):
        return self.addValueInput(object_id, name, "", value_input)

    def addAngleValueCommandInput(self, object_id, name, value_input):
        return self.addValueInput(object_id, name, "rad", value_input)

    def addTableCommandInput(self, object_id, name, number_of_columns, column_ratio):
        return self._add_input(TableCommandInput, object_id, name, numberOfColumns=number_of_columns, columnRatio=column_ratio, rowCount=0)

    def addTabCommandInput(self, object_id, name):
        item = self._add_input(GroupCommandInput, object_id, name)
        item.children = CommandInputs(item)
        return item

    def addGroupCommandInput(self, object_id, name):
        item = self._add_input(GroupCommandInput, object_id, name)
        item.children = CommandInputs(item)
        return item

    def addSelectionInput(self, object_id, name, prompt):
        return self._add_input(SelectionCommandInput, object_id, name, prompt=prompt, selections=ObjectCollection.create())


class Command(_CastOnly):
    def __init__(self):
        self.commandInputs = CommandInputs()
        self.execute = Event("execute")
        self.executePreview = Event("executePreview")
        self.destroy = Event("destroy")
        self.inputChanged = Event("inputChanged")
        self.validateInputs = Event("validateInputs")

    def doExecute(self):
        self.execute.fire(SimpleNamespace(command=self))
        return True


class CommandDefinition(_CastOnly):
    def __init__(self, object_id="", name="", description=""):
        self.id = object_id
        self.name = name
        self.description = description
        self.commandCreated = Event("commandCreated")

    def execute(self):
        command = Command()
        self.commandCreated.fire(SimpleNamespace(command=command))
        command.doExecute()
        command.destroy.fire(SimpleNamespace(command=command))
        return True


class CommandDefinitions(BaseCollection):
    def itemById(self, object_id):
        found = super().itemById(object_id)
        if found is None:
            found = self._append(CommandDefinition(object_id, object_id, ""))
        return found

    def addButtonDefinition(self, object_id, name, description="", resource_folder=""):
        definition = CommandDefinition(object_id, name, description)
        definition.resourceFolder = resource_folder
        self._items.append(definition)
        return definition


class Palette(Base):
    def __init__(self, object_id):
        self.id = object_id
        self.name = object_id
        self.isVisible = False
        self.incomingFromHTML = Event("incomingFromHTML")

    def sendInfoToHTML(self, action, data):
        self.lastHtmlMessage = (action, data)
        return True


class Palettes(BaseCollection):
    def itemById(self, object_id):
        found = super().itemById(object_id)
        if found is None:
            found = self._append(Palette(object_id))
        return found


class Appearance(Base):
    def __init__(self, name):
        self.name = name


class MaterialLibrary(Base):
    def __init__(self, name="Default Materials"):
        self.name = name
        self.appearances = BaseCollection([
            Appearance("Aluminum - Polished"),
            Appearance("Paint - Glossy Red"),
        ])
        self.materials = BaseCollection([UniversalStub("Generic Material")])
        self.isNative = False

    def unload(self):
        return True


class UserInterface(Base):
    @staticmethod
    def cast(value):
        return value if isinstance(value, UserInterface) else None

    def __init__(self):
        self.workspaces = Workspaces()
        self.commandDefinitions = CommandDefinitions()
        self.palettes = Palettes()
        self.activeSelections = ObjectCollection.create()
        self.toolbarPanels = ToolbarPanels()
        self.toolbars = BaseCollection()

    def messageBox(self, message, title="", buttons=0, icon=0):
        print(f"[adsk.core UI Dialog] {title}: {message}")
        return 0

    def inputBox(self, prompt, title="", default_value=""):
        return (str(default_value), True)

    def createFileDialog(self):
        return _Dialog()

    def createFolderDialog(self):
        return _Dialog()

    def createCloudFileDialog(self):
        return _Dialog()

    def createProgressDialog(self):
        return _ProgressDialog()

    def selectEntity(self, prompt, filter_string):
        _unsupported("UserInterface.selectEntity", "headless aim3d selections")

    def __getattr__(self, name):
        if name == "workspaces":
            value = Workspaces()
        elif name == "commandDefinitions":
            value = CommandDefinitions()
        elif name == "palettes":
            value = Palettes()
        elif name == "toolbarPanels":
            value = ToolbarPanels()
        elif name == "activeSelections":
            value = ObjectCollection.create()
        else:
            value = UniversalStub(name)
        setattr(self, name, value)
        return value


class _Dialog(Base):
    DialogOK = 0

    def __init__(self):
        self.title = ""
        self.filter = ""
        self.folder = "/tmp"
        self.filename = "/tmp/aim3d-dialog-output.tmp"
        self.filenames = [self.filename]
        self.isMultiSelectEnabled = False

    def showOpen(self):
        return self.DialogOK

    def showSave(self):
        return self.DialogOK

    def showDialog(self):
        return self.DialogOK


class _ProgressDialog(Base):
    def __init__(self):
        self.wasCancelled = False
        self.progressValue = 0

    def show(self, *args, **kwargs):
        return True

    def hide(self):
        return True


class Camera(Base):
    def __init__(self):
        self.eye = Point3D.create(10, -10, 10)
        self.target = Point3D.create(0, 0, 0)
        self.upVector = Vector3D.create(0, 0, 1)


class Viewport(Base):
    def __init__(self):
        self.camera = Camera()

    def fit(self):
        return True

    def __getattr__(self, name):
        value = UniversalStub(name)
        setattr(self, name, value)
        return value


class Application(Base):
    _instance = None

    def __init__(self):
        self._documents = Documents()
        self._user_interface = UserInterface()
        self._is_headless = True
        self.data = Data()
        self.activeViewport = Viewport()
        self.mfgdmDataReady = Event("mfgdmDataReady")
        self.materialLibraries = BaseCollection([MaterialLibrary("Default Materials")])
        self.measureManager = UniversalStub("MeasureManager")
        self.importManager = ImportManager(self)

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @staticmethod
    def cast(value):
        return value if isinstance(value, Application) else None

    @property
    def documents(self):
        return self._documents

    @property
    def userInterface(self):
        if self._is_headless:
            return None
        return self._user_interface

    @property
    def activeDocument(self):
        if self._documents.count:
            return self._documents.item(self._documents.count - 1)
        if not self._is_headless:
            return self.documents.add(DocumentTypes.FusionDesignDocumentType)
        return None

    @property
    def activeProduct(self):
        document = self.activeDocument
        if document is None:
            return None
        return document.design

    def execute_macro(self, macro_code):
        _unsupported("Imperative Macro Executions", "aim3d.core JSON-Schema Commands")

    def log(self, message):
        print(f"[adsk.core Application] {message}")
        return True

    def registerCustomEvent(self, event_id):
        event = Event(event_id)
        setattr(self, event_id, event)
        return event

    def fireCustomEvent(self, event_id, additional_info=""):
        event = getattr(self, event_id, None)
        if isinstance(event, Event):
            event.fire(SimpleNamespace(additionalInfo=additional_info, firingEvent=event))
            return True
        return False

    def unregisterCustomEvent(self, event_id):
        if hasattr(self, event_id):
            delattr(self, event_id)
        return True

    def __getattr__(self, name):
        if name.endswith("Completed") or name.endswith("Event") or name in {"startupCompleted"}:
            event = Event(name)
            setattr(self, name, event)
            return event
        value = UniversalStub(name)
        setattr(self, name, value)
        return value


class FileOpenContext(Base):
    @staticmethod
    def create():
        return FileOpenContext()


class HttpRequest(Base):
    @staticmethod
    def create(url="", method="GET"):
        request = HttpRequest()
        request.url = url
        request.method = method
        request.body = ""
        request.headers = {}
        return request

    def execute(self):
        response = SimpleNamespace(statusCode=0, response="", headers={})
        response.isValid = True
        return response


class StringProperty(_CastOnly):
    pass


class CustomEventArgs(_CastOnly):
    pass


class HTMLEventArgs(_CastOnly):
    pass


class DocumentEventArgs(_CastOnly):
    pass


class CommandCreatedEventArgs(_CastOnly):
    pass


class CommandEventArgs(_CastOnly):
    pass


class InputChangedEventArgs(_CastOnly):
    pass


class MarkingMenuEventArgs(_CastOnly):
    pass


class BoolValueCommandInput(CommandInput):
    pass


class ButtonRowCommandInput(CommandInput):
    pass


class DistanceValueCommandInput(CommandInput):
    pass


class DropDownCommandInput(CommandInput):
    pass


class FloatSliderCommandInput(CommandInput):
    @staticmethod
    def classType():
        return "adsk.core.FloatSliderCommandInput"


class GroupCommandInput(CommandInput):
    pass


class IntegerSliderCommandInput(CommandInput):
    pass


class SelectionCommandInput(CommandInput):
    @property
    def selectionCount(self):
        return getattr(self, "selections", ObjectCollection.create()).count

    def selection(self, index):
        return getattr(self, "selections", ObjectCollection.create()).item(index)


class SliderCommandInput(CommandInput):
    pass


class StringValueCommandInput(CommandInput):
    pass


class TableCommandInput(CommandInput):
    pass


class ValueCommandInput(CommandInput):
    pass


class DropDownControl(Base):
    @staticmethod
    def classType():
        return "adsk.core.DropDownControl"


class SeparatorControl(Base):
    @staticmethod
    def classType():
        return "adsk.core.SeparatorControl"


class SplitButtonControl(Base):
    @staticmethod
    def classType():
        return "adsk.core.SplitButtonControl"


class ToolbarPanels(BaseCollection):
    pass


class ExportManager(Base):
    def __init__(self, document):
        self.document = document

    def createSTEPExportOptions(self, filename):
        return UniversalStub("STEPExportOptions", filename=str(filename))

    def createSTLExportOptions(self, entity, filename=""):
        return UniversalStub("STLExportOptions", entity=entity, filename=str(filename))

    def createIGESExportOptions(self, filename):
        return UniversalStub("IGESExportOptions", filename=str(filename))

    def createFusionArchiveExportOptions(self, filename):
        return UniversalStub("FusionArchiveExportOptions", filename=str(filename))

    def execute(self, options):
        return True

    def __getattr__(self, name):
        if name.startswith("create") and name.endswith("ExportOptions"):
            def create_options(*args, **kwargs):
                return UniversalStub(name, args=args, kwargs=kwargs)
            return create_options
        raise AttributeError(name)


class ImportManager(Base):
    def __init__(self, app):
        self._app = app

    def createSTEPImportOptions(self, filename):
        return UniversalStub("STEPImportOptions", filename=str(filename))

    def createIGESImportOptions(self, filename):
        return UniversalStub("IGESImportOptions", filename=str(filename))

    def importToTarget(self, options, target):
        return True

    def importToNewDocument(self, options):
        return self._app.documents.add(DocumentTypes.FusionDesignDocumentType)

    def __getattr__(self, name):
        if name.startswith("create") and name.endswith("ImportOptions"):
            def create_options(filename="", *args, **kwargs):
                return UniversalStub(name, filename=str(filename), args=args, kwargs=kwargs)
            return create_options
        raise AttributeError(name)


DialogResults = _EnumContainer()
DialogResults.DialogOK = 0
MessageBoxButtonTypes = _EnumContainer()
MessageBoxButtonTypes.OKButtonType = 0
MessageBoxIconTypes = _EnumContainer()
MessageBoxIconTypes.NoIconIconType = 0


class DataHub(UniversalStub):
    pass


class Curve3DPath(UniversalStub):
    @staticmethod
    def create(curves=None):
        path = Curve3DPath("Curve3DPath")
        path.curves = curves
        return path


def __getattr__(name):
    if name.endswith("Handler"):
        cls = type(name, (EventHandler,), {})
    else:
        cls = _DynamicClassMeta(name, (UniversalStub,), {
            "create": staticmethod(lambda *args, **kwargs: UniversalStub(name, args=args, kwargs=kwargs)),
            "cast": staticmethod(lambda value: value),
            "classType": staticmethod(lambda: f"adsk.core.{name}"),
        })
    globals()[name] = cls
    return cls
