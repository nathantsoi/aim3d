import ast
import importlib
import importlib.util
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import adsk.core


SAMPLE_ROOT = (
    Path(__file__).resolve().parents[3]
    / "docs"
    / "fusion360_docs"
    / "fusion360_python_samples"
)
EXPECTED_SAMPLE_COUNT = 131
EXPECTED_SYNTAX_ERRORS = {
    "ExportManager_Sample.py": "unexpected indent in the checked-in Fusion sample corpus",
}


@dataclass(frozen=True)
class SampleInventory:
    path: Path
    syntax_error: Optional[str]
    has_run: bool
    has_stop: bool
    imports: tuple[str, ...]
    adsk_calls: tuple[str, ...]
    receiver_calls: tuple[str, ...]
    all_calls: tuple[str, ...]

    @property
    def name(self):
        return self.path.name


class TestDialog:
    DialogOK = 0

    def __init__(self, folder):
        self.title = ""
        self.filter = ""
        self.folder = str(folder)
        self.filename = str(folder / "fusion-sample-output.tmp")
        self.filenames = [self.filename]
        self.isMultiSelectEnabled = False

    def showOpen(self):
        return self.DialogOK

    def showSave(self):
        return self.DialogOK

    def showDialog(self):
        return self.DialogOK


class TestProgressDialog:
    def __init__(self):
        self.wasCancelled = False
        self.progressValue = 0

    def show(self, *args, **kwargs):
        return True

    def hide(self):
        return True


class TestSelections:
    def __init__(self):
        self.items = []

    def add(self, item):
        self.items.append(item)
        return True

    def clear(self):
        self.items.clear()
        return True


class TestUserInterface(adsk.core.UserInterface):
    def __init__(self, temp_dir):
        self.messages = []
        self.temp_dir = Path(temp_dir)
        self.activeSelections = TestSelections()

    def messageBox(self, message, title="", buttons=0, icon=0):
        self.messages.append((str(title), str(message)))
        return 0

    def inputBox(self, prompt, title="", default_value=""):
        return (str(default_value), True)

    def createFileDialog(self):
        return TestDialog(self.temp_dir)

    def createFolderDialog(self):
        return TestDialog(self.temp_dir)

    def createCloudFileDialog(self):
        return TestDialog(self.temp_dir)

    def createProgressDialog(self):
        return TestProgressDialog()

    def selectEntity(self, prompt, filter_string):
        raise adsk.Aim3dUnsupportedFeatureError(
            "UserInterface.selectEntity", "headless aim3d test fixtures"
        )


def call_name(call_node):
    return dotted_name(call_node.func)


def dotted_name(node):
    parts = []
    current = node
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        parts.append(current.id)
        return ".".join(reversed(parts))
    return None


def _imports(tree):
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.add(node.module or "")
    return tuple(sorted(imports))


def _entrypoints(tree):
    names = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
    return "run" in names, "stop" in names


def _calls(tree):
    adsk_calls = set()
    receiver_calls = set()
    all_calls = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = call_name(node)
        if name is None:
            all_calls.add(f"<dynamic>@{node.lineno}:{node.col_offset}")
            continue
        all_calls.add(name)
        if name.startswith("adsk."):
            adsk_calls.add(name)
        elif "." in name:
            receiver_calls.add(name)
    return tuple(sorted(adsk_calls)), tuple(sorted(receiver_calls)), tuple(sorted(all_calls))


def inventory_sample(path):
    source = path.read_text()
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return SampleInventory(
            path=path,
            syntax_error=f"{exc.msg} at line {exc.lineno}",
            has_run=False,
            has_stop=False,
            imports=(),
            adsk_calls=(),
            receiver_calls=(),
            all_calls=(),
        )

    has_run, has_stop = _entrypoints(tree)
    adsk_calls, receiver_calls, all_calls = _calls(tree)
    return SampleInventory(
        path=path,
        syntax_error=None,
        has_run=has_run,
        has_stop=has_stop,
        imports=_imports(tree),
        adsk_calls=adsk_calls,
        receiver_calls=receiver_calls,
        all_calls=all_calls,
    )


@lru_cache(maxsize=1)
def sample_inventory():
    return tuple(inventory_sample(path) for path in sorted(SAMPLE_ROOT.glob("*.py")))


def resolve_adsk_symbol(name):
    if not name.startswith("adsk."):
        return True

    module_name, _, tail = name.partition(".")
    current = importlib.import_module(module_name)
    for part in tail.split("."):
        if not hasattr(current, part):
            return False
        current = getattr(current, part)
    return callable(current)


def unsupported_adsk_calls(sample):
    return tuple(call for call in sample.adsk_calls if not resolve_adsk_symbol(call))


def static_gap_reason(sample):
    if sample.syntax_error:
        return EXPECTED_SYNTAX_ERRORS.get(sample.name, sample.syntax_error)
    missing = unsupported_adsk_calls(sample)
    if missing:
        preview = ", ".join(missing[:4])
        suffix = "" if len(missing) <= 4 else f", +{len(missing) - 4} more"
        return f"unsupported sample API call(s): {preview}{suffix}"
    return None


def install_test_application(temp_dir):
    adsk.core.Application._instance = None
    app = adsk.core.Application.get()
    ui = TestUserInterface(temp_dir)
    app._is_headless = False
    app._user_interface = ui
    return app, ui


def reset_test_application():
    adsk.core.Application._instance = None


def import_sample_module(sample, temp_dir):
    app, ui = install_test_application(temp_dir)
    module_name = f"_aim3d_fusion_sample_{sample.path.stem}"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, sample.path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
        if hasattr(module, "time"):
            module.time.sleep = lambda *_args, **_kwargs: None
        return module, app, ui
    except Exception:
        sys.modules.pop(module_name, None)
        raise


def cleanup_sample_module(sample):
    sys.modules.pop(f"_aim3d_fusion_sample_{sample.path.stem}", None)
    reset_test_application()


def captured_failure(ui):
    for _title, message in ui.messages:
        if message.startswith("Failed:\n") or "Traceback (most recent call last):" in message:
            return message
    return None
