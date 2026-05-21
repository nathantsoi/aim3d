import ctypes
import numpy as np
import asyncio

class BRepBody:
    def __init__(self, name):
        self._name = name
        # Simulated raw float list [X, Y, Z] for three vertices
        self._mock_vertices = [0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 10.0, 0.0]

    @property
    def name(self):
        return self._name

    def get_vertices_tensor(self):
        """
        Exposes low-level, zero-copy memory buffers of C++ B-rep vertices.
        Simulates returning a direct memoryview on C++ contiguous memory.
        """
        # Create a ctypes double array of size 9 pointing to mock vertices
        double_array_type = ctypes.c_double * len(self._mock_vertices)
        c_array = double_array_type(*self._mock_vertices)
        
        # Access raw buffer without copy
        buffer_view = memoryview(c_array)
        return buffer_view

class Component:
    def __init__(self, name):
        self._name = name
        self._bodies = [BRepBody("Body1")]

    @property
    def name(self):
        return self._name

    @property
    def b_rep_bodies(self):
        return self._bodies

class DesignProduct:
    def __init__(self):
        self._root_component = Component("RootComponent")

    @property
    def root_component(self):
        return self._root_component

class Document:
    def __init__(self, path="Untitled.a3d"):
        self._filePath = path
        self._design = DesignProduct()

    @property
    def file_path(self):
        return self._filePath

    @property
    def design(self):
        return self._design

    async def save_async(self, path):
        """
        Async awaitable recompute / save cycle
        """
        await asyncio.sleep(0.01) # Simulated async I/O
        self._filePath = path
        return True

class DocumentsCollection:
    def __init__(self):
        self._docs = []

    def open(self, path):
        doc = Document(path)
        self._docs.append(doc)
        return doc

    def create(self):
        doc = Document()
        self._docs.append(doc)
        return doc

documents = DocumentsCollection()
