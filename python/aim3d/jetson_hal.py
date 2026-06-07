import ctypes
import os

IVC_QUEUE_SIZE = 64
IVC_DEV_PATH = "/dev/tegra-ivc-aim3d"

class MotionCommand(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("step_count_x", ctypes.c_uint32),
        ("step_count_y", ctypes.c_uint32),
        ("step_count_z", ctypes.c_uint32),
        ("dir_x", ctypes.c_uint8),
        ("dir_y", ctypes.c_uint8),
        ("dir_z", ctypes.c_uint8),
        ("delay_ticks", ctypes.c_uint32),
    ]

class IVCMailbox(ctypes.Structure):
    _fields_ = [
        ("command_queue", MotionCommand * IVC_QUEUE_SIZE),
        ("head", ctypes.c_uint32),
        ("tail", ctypes.c_uint32),
        ("estop_request", ctypes.c_uint8),
        ("current_state", ctypes.c_uint32),
        ("steps_executed", ctypes.c_uint32),
    ]

class JetsonHAL:
    def __init__(self, mock=False):
        self.mock = mock
        self.mailbox = IVCMailbox()
        self.mailbox.head = 0
        self.mailbox.tail = 0
        self.mailbox.estop_request = 0
        self.mailbox.current_state = 0
        self.mailbox.steps_executed = 0
        
        self.fd = None
        if not self.mock:
            try:
                self.fd = os.open(IVC_DEV_PATH, os.O_RDWR | os.O_SYNC)
            except FileNotFoundError:
                print(f"Warning: {IVC_DEV_PATH} not found. Ensure SPE firmware is loaded. Falling back to mock mode.")
                self.mock = True

    def _sync_to_hw(self):
        if not self.mock and self.fd is not None:
            os.lseek(self.fd, 0, os.SEEK_SET)
            os.write(self.fd, bytes(self.mailbox))

    def _sync_from_hw(self):
        if not self.mock and self.fd is not None:
            os.lseek(self.fd, 0, os.SEEK_SET)
            data = os.read(self.fd, ctypes.sizeof(IVCMailbox))
            ctypes.memmove(ctypes.addressof(self.mailbox), data, ctypes.sizeof(IVCMailbox))

    def trigger_estop(self):
        self.mailbox.estop_request = 1
        self._sync_to_hw()

    def get_state(self):
        self._sync_from_hw()
        return {
            "state": self.mailbox.current_state,
            "steps_executed": self.mailbox.steps_executed,
            "queue_depth": (self.mailbox.head - self.mailbox.tail) % IVC_QUEUE_SIZE
        }

    def enqueue_waypoint(self, sx, sy, sz, dx, dy, dz, delay):
        self._sync_from_hw()
        
        next_head = (self.mailbox.head + 1) % IVC_QUEUE_SIZE
        if next_head == self.mailbox.tail:
            return False # Queue full

        cmd = self.mailbox.command_queue[self.mailbox.head]
        cmd.step_count_x = int(sx)
        cmd.step_count_y = int(sy)
        cmd.step_count_z = int(sz)
        cmd.dir_x = int(dx)
        cmd.dir_y = int(dy)
        cmd.dir_z = int(dz)
        cmd.delay_ticks = int(delay)

        self.mailbox.head = next_head
        self._sync_to_hw()
        return True

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
