def pytest_sessionfinish(session, exitstatus):
    try:
        import aim3d.cam as aim_cam

        setup = getattr(aim_cam.setups, "_active_setup", None)
        operations = getattr(setup, "_operations", {})
        for operation in operations.values():
            operation.release()
    except Exception:
        pass

