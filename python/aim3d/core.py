import asyncio

from . import _native


class BRepBody:
    def __init__(self, handle, owner=None):
        if not handle:
            raise _native.NativeError("Missing native body handle")
        self._handle = handle
        self._owner = owner

    @property
    def name(self):
        raw = _native.body_name(self._handle)
        return raw.decode("utf-8") if raw else ""

    def get_vertices_tensor(self):
        """
        Return a native-owned zero-copy-compatible vertex buffer as float32 Nx3.
        The returned object implements NumPy's array protocol and owns the
        native buffer until release or garbage collection.
        """
        return _native.NativeBuffer(_native.body_vertices(self._handle))

    def release(self):
        if self._handle:
            _native.body_release(self._handle)
            self._handle = None

    def __del__(self):
        self.release()


class MeshBuffers:
    def __init__(self, document):
        self._document = document

    def positions(self):
        return _native.NativeBuffer(_native.document_mesh_positions(self._document._handle))

    def normals(self):
        return _native.NativeBuffer(_native.document_mesh_normals(self._document._handle))

    def colors(self):
        return _native.NativeBuffer(_native.document_mesh_colors(self._document._handle))

    def indices(self):
        return _native.NativeBuffer(_native.document_mesh_indices(self._document._handle))


class Component:
    def __init__(self, document, name="RootComponent"):
        self._document = document
        self._name = name

    @property
    def name(self):
        return self._name

    @property
    def b_rep_bodies(self):
        count = _native.document_body_count(self._document._handle)
        handles = [_native.document_body_at(self._document._handle, index) for index in range(count)]
        if not handles:
            handles = [_native.document_preview_body(self._document._handle)]
        return [BRepBody(handle, owner=self._document) for handle in handles if handle]


class DesignProduct:
    def __init__(self, document):
        self._root_component = Component(document)

    @property
    def root_component(self):
        return self._root_component


class Document:
    def __init__(self, handle, path="Untitled.a3d"):
        if not handle:
            raise _native.NativeError("Missing native document handle")
        self._handle = handle
        self._file_path = path
        self._design = DesignProduct(self)
        self.meshes = MeshBuffers(self)

    @property
    def file_path(self):
        return self._file_path

    @property
    def design(self):
        return self._design

    async def save_async(self, path):
        def save():
            if _native.document_save(self._handle, _native._encode_path(path)) != 1:
                raise _native.NativeError(f"Failed to save document: {path}")
            return True

        result = await asyncio.to_thread(save)
        self._file_path = str(path)
        return result

    async def import_geometry_async(self, path):
        task = _native.NativeTask(_native.document_import_geometry_task(self._handle, _native._encode_path(path)))
        try:
            await asyncio.to_thread(task.wait)
            return True
        finally:
            task.release()

    async def inspect_bodies_async(self):
        task = _native.NativeTask(_native.document_inspect_bodies_task(self._handle))
        try:
            await asyncio.to_thread(task.wait)
            return True
        finally:
            task.release()

    async def recompute_async(self):
        def recompute():
            if _native.document_recompute(self._handle) != 1:
                raise _native.NativeError("Failed to recompute document")
            return True

        return await asyncio.to_thread(recompute)

    def release(self):
        if self._handle:
            _native.document_release(self._handle)
            self._handle = None

    def __del__(self):
        self.release()


class DocumentsCollection:
    def __init__(self):
        self._docs = []

    def open(self, path):
        handle = _native.document_open(_native._encode_path(path))
        doc = Document(handle, str(path))
        self._docs.append(doc)
        return doc

    async def open_async(self, path):
        return await asyncio.to_thread(self.open, path)

    def create(self):
        doc = Document(_native.document_create())
        self._docs.append(doc)
        return doc


documents = DocumentsCollection()
