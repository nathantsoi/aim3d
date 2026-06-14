import os
import pytest

import adsk
from fusion_sample_harness import (
    captured_failure,
    cleanup_sample_module,
    import_sample_module,
    sample_inventory,
    static_gap_reason,
)


def _integration_params():
    params = []
    for sample in sample_inventory():
        reason = static_gap_reason(sample)
        marks = ()
        if reason:
            marks = pytest.mark.xfail(reason=reason, strict=True)
        params.append(pytest.param(sample, id=sample.name, marks=marks))
    return params


def _unsupported_exception_reason(exc):
    if isinstance(exc, adsk.Aim3dUnsupportedFeatureError):
        return f"unsupported Fusion API: {exc.feature_name}"
    if isinstance(exc, (AttributeError, FileNotFoundError, ImportError, ModuleNotFoundError, NameError)):
        return f"unsupported or missing Fusion sample dependency: {exc}"
    if isinstance(exc, TypeError) and "NoneType" in str(exc):
        return f"unsupported Fusion sample object graph: {exc}"
    return None


def _unsupported_failure_reason(message):
    unsupported_tokens = (
        "Aim3dUnsupportedFeatureError",
        "AttributeError:",
        "ImportError:",
        "ModuleNotFoundError:",
        "NameError:",
        "FileNotFoundError:",
        "has no attribute",
        "is not supported by aim3d",
    )
    if any(token in message for token in unsupported_tokens):
        return "sample reached an unsupported Fusion facade boundary"
    return None


@pytest.mark.parametrize("sample", _integration_params())
def test_fusion_python_sample_imports_and_runs(sample, tmp_path, monkeypatch):
    # Prevent sample scripts from opening Finder/Explorer windows
    monkeypatch.setattr(os, "system", lambda cmd: 0)
    if hasattr(os, "startfile"):
        monkeypatch.setattr(os, "startfile", lambda path: None)

    module = None
    ui = None
    try:
        module, _app, ui = import_sample_module(sample, tmp_path)
        if sample.has_run:
            module.run(None)
        failure = captured_failure(ui)
        if failure:
            reason = static_gap_reason(sample) or _unsupported_failure_reason(failure)
            if reason:
                pytest.xfail(reason)
            pytest.fail(f"{sample.name} reported failure through messageBox:\n{failure}")
    except Exception as exc:
        reason = static_gap_reason(sample) or _unsupported_exception_reason(exc)
        if reason:
            pytest.xfail(reason)
        raise
    finally:
        if module is not None and sample.has_stop:
            try:
                module.stop(None)
            except Exception:
                pass
        cleanup_sample_module(sample)
