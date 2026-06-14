def pytest_sessionfinish(session, exitstatus):
    try:
        import aim3d.cam as aim_cam

        setup = getattr(aim_cam.setups, "_active_setup", None)
        operations = getattr(setup, "_operations", {})
        for operation in operations.values():
            operation.release()
    except Exception:
        pass

def pytest_addoption(parser):
    parser.addoption(
        "--record-meshes",
        action="store_true",
        default=False,
        help="Record all tests that simulate motion or design elements to mesh files",
    )

import pytest
@pytest.fixture
def record_meshes(request):
    return request.config.getoption("--record-meshes")
