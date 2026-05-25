import asyncio
import ctypes

from . import _native


class Operation:
    def __init__(self, name="Pocket1", handle=None):
        self.name = name
        self._handle = handle or _native.operation_create_default()
        if not self._handle:
            raise _native.NativeError("Missing native CAM operation handle")

    async def generate_toolpath_async(self):
        def generate():
            if _native.operation_generate_toolpath(self._handle) != 1:
                raise _native.NativeError(f"Failed to generate toolpath for {self.name}")
            return True

        return await asyncio.to_thread(generate)

    def get_toolpath_tensor(self):
        """
        Return the generated canonical toolpath IR as a native float64 Nx5 array:
        motion type, x, y, z, feed rate.
        """
        return _native.NativeBuffer(_native.operation_toolpath(self._handle))

    def release(self):
        if self._handle:
            _native.operation_release(self._handle)
            self._handle = None

    def __del__(self):
        self.release()


class Setup:
    def __init__(self, name):
        self.name = name
        self._operations = {"Pocket1": Operation("Pocket1")}

    @property
    def operations(self):
        return self._operations

    async def post_process_async(self):
        operation = self._operations["Pocket1"]

        def post():
            pointer = _native.operation_post_process(operation._handle)
            if not pointer:
                raise _native.NativeError("Failed to post-process setup")
            try:
                return ctypes.string_at(pointer).decode("utf-8")
            finally:
                _native.string_release(pointer)

        return await asyncio.to_thread(post)


class SetupCollection:
    def __init__(self):
        self._active_setup = Setup("Setup1")

    @property
    def active_setup(self):
        return self._active_setup


setups = SetupCollection()
