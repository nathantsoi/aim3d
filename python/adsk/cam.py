from adsk.core import BaseCollection
import aim3d.cam as aim_cam
import asyncio

class Operation:
    def __init__(self, native_op):
        self._native_op = native_op

    @property
    def name(self):
        return self._native_op.name

    def generateToolpath(self):
        """
        Synchronous block wrapper matching legacy imperative toolpath triggers.
        """
        loop = asyncio.get_event_loop()
        if loop.is_running():
            raise RuntimeError("Cannot synchronously block loop in active async thread. Use aim3d.* instead.")
        return loop.run_until_complete(self._native_op.generate_toolpath_async())

class Operations(BaseCollection):
    pass

class Setup:
    def __init__(self, native_setup):
        self._native_setup = native_setup
        wrapped_ops = [Operation(op) for op in native_setup.operations.values()]
        self._operations = Operations(wrapped_ops)

    @property
    def name(self):
        return self._native_setup.name

    @property
    def operations(self):
        return self._operations

    def postProcess(self):
        """
        Synchronous posted code mapping.
        """
        loop = asyncio.get_event_loop()
        if loop.is_running():
            raise RuntimeError("Cannot synchronously block loop in active async thread. Use aim3d.* instead.")
        return loop.run_until_complete(self._native_setup.post_process_async())

class Setups(BaseCollection):
    pass

class CAM:
    def __init__(self):
        native_setup = aim_cam.setups.active_setup
        self._setups = Setups([Setup(native_setup)])

    @property
    def setups(self):
        return self._setups
