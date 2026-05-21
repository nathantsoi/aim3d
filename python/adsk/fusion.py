from adsk.core import BaseCollection
import aim3d.core as aim_core

class BRepBody:
    def __init__(self, native_body):
        self._native_body = native_body

    @property
    def name(self):
        return self._native_body.name

class BRepBodies(BaseCollection):
    def __init__(self, bodies_list):
        wrapped = [BRepBody(b) for b in bodies_list]
        super().__init__(wrapped)

class Component:
    def __init__(self, native_comp):
        self._native_comp = native_comp

    @property
    def name(self):
        return self._native_comp.name

    @property
    def bRepBodies(self):
        return BRepBodies(self._native_comp.b_rep_bodies)

class Occurrence:
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
    pass

class Design:
    def __init__(self):
        # Wraps the modern default product structures
        self._root_component = Component(aim_core.documents.create().design.root_component)
        self._occurrences = Occurrences([])

    @property
    def rootComponent(self):
        return self._root_component

    @property
    def occurrences(self):
        return self._occurrences
