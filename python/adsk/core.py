import asyncio
from pathlib import Path

import aim3d.core as aim_core
from adsk import Aim3dUnsupportedFeatureError


def _run_sync(awaitable, alternative):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)
    raise RuntimeError(f"Cannot synchronously block an active event loop. Use {alternative} instead.")


def _unsupported(feature_name, alternative="aim3d.core"):
    raise Aim3dUnsupportedFeatureError(feature_name, alternative)


class Base:
    @staticmethod
    def classType():
        return "adsk.core.Base"

    @property
    def objectType(self):
        return f"{self.__class__.__module__}.{self.__class__.__name__}"

    @property
    def isValid(self):
        return True


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

    def __iter__(self):
        return iter(self._items)

    def __len__(self):
        return len(self._items)

    def __getitem__(self, index):
        item = self.item(index)
        if item is None:
            raise IndexError(index)
        return item

    def add(self, *args, **kwargs):
        _unsupported(f"{self.__class__.__name__}.add", "supported aim3d.* construction APIs")


class ObjectCollection(BaseCollection):
    @staticmethod
    def create():
        return ObjectCollection()

    def add(self, item):
        self._items.append(item)
        return True


class DataFile(Base):
    def __init__(self, document):
        self._document = document

    @property
    def name(self):
        return self._document.name

    @property
    def filePath(self):
        return self._document.filePath


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


class Point3D(Base):
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

    @staticmethod
    def create(x=0.0, y=0.0, z=0.0):
        return Point3D(x, y, z)

    def asArray(self):
        return [self.x, self.y, self.z]


class Vector3D(Point3D):
    @staticmethod
    def create(x=0.0, y=0.0, z=0.0):
        return Vector3D(x, y, z)


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


class UserInterface(Base):
    def messageBox(self, message, title="", buttons=0, icon=0):
        print(f"[adsk.core UI Dialog] {title}: {message}")
        return 0


class ProductCollection(BaseCollection):
    def itemByProductType(self, product_type):
        for item in self._items:
            if getattr(item, "productType", None) == product_type:
                return item
        return None


class Document(Base):
    def __init__(self, native_doc):
        self._native_doc = native_doc
        self._data_file = DataFile(self)
        self._products = None

    @property
    def name(self):
        path = Path(self.filePath)
        return path.stem or "Untitled"

    @property
    def filePath(self):
        return getattr(self._native_doc, "file_path", "Untitled.a3d")

    @property
    def dataFile(self):
        return self._data_file

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

    def saveAs(self, path, description="", tags=""):
        return _run_sync(self._native_doc.save_async(path), "aim3d.core.Document.save_async")


class Documents(BaseCollection):
    def add(self, documentType):
        if documentType != DocumentTypes.FusionDesignDocumentType:
            _unsupported(f"DocumentType {documentType}", "adsk.core.DocumentTypes.FusionDesignDocumentType")
        doc = Document(aim_core.documents.create())
        self._items.append(doc)
        return doc

    def open(self, path, visible=True):
        doc = Document(aim_core.documents.open(path))
        self._items.append(doc)
        return doc


class DocumentTypes:
    FusionDesignDocumentType = 0


class Application(Base):
    _instance = None

    def __init__(self):
        self._documents = Documents()
        self._user_interface = UserInterface()
        self._is_headless = True

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

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
        return None

    @property
    def activeProduct(self):
        document = self.activeDocument
        if document is None:
            return None
        return document.design

    def execute_macro(self, macro_code):
        _unsupported("Imperative Macro Executions", "aim3d.core JSON-Schema Commands")
