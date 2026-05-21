import aim3d.core as aim_core
from adsk import Aim3dUnsupportedFeatureError

class BaseCollection:
    def __init__(self, items_list):
        self._items = items_list

    @property
    def count(self):
        return len(self._items)

    def item(self, index):
        if 0 <= index < len(self._items):
            return self._items[index]
        return None

    def itemByName(self, name):
        for item in self._items:
            if hasattr(item, "name") and item.name == name:
                return item
        return None

class ObjectCollection(BaseCollection):
    pass

class UserInterface:
    def __init__(self):
        self.messageBox = self._message_box

    def _message_box(self, message, title="", buttons=0, icon=0):
        print(f"[adsk.core UI Dialog] {title}: {message}")
        return 0

class Document:
    def __init__(self, native_doc):
        self._native_doc = native_doc
        self._products = BaseCollection([])

    @property
    def products(self):
        return self._products

    def saveAs(self, path, description, tags):
        """
        Synchronous wrapper mapping to modern async document saves.
        """
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            raise RuntimeError("Cannot synchronously block loop in active async thread. Use aim3d.* instead.")
        return loop.run_until_complete(self._native_doc.save_async(path))

class Documents(BaseCollection):
    def __init__(self):
        super().__init__([])

    def add(self, documentType):
        if documentType != 0: # 0 is standard design doc in Fusion
            raise Aim3dUnsupportedFeatureError(f"DocumentType {documentType}")
        native_doc = aim_core.documents.create()
        doc = Document(native_doc)
        self._items.append(doc)
        return doc

    def open(self, path, visible=True):
        native_doc = aim_core.documents.open(path)
        doc = Document(native_doc)
        self._items.append(doc)
        return doc

class Application:
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
            # Graceful headless degradation: return None or stubs
            return None
        return self._user_interface

    @property
    def activeDocument(self):
        if self._documents.count > 0:
            return self._documents.item(self._documents.count - 1)
        return None

    def execute_macro(self, macro_code):
        raise Aim3dUnsupportedFeatureError("Imperative Macro Executions", "aim3d.core JSON-Schema Commands")
