# Copied to Content/Python/init_unreal.py, which the editor runs at start-up.
# With WYND_RUN=1 in the environment it starts the slice build and shots a
# few frames after the editor is up. (-ExecutePythonScript closes the editor
# as soon as its script returns, which would end the tick-driven shots.)
import os
import runpy

import unreal

if os.environ.get("WYND_RUN") == "1":
    _state = {"frames": 0}

    def _boot(dt):
        _state["frames"] += 1
        if _state["frames"] < 30:
            return
        unreal.unregister_slate_post_tick_callback(_state["handle"])
        project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
        # WYND_SCRIPT picks another Scripts/ entry (e.g. test_building.py)
        script = os.environ.get("WYND_SCRIPT", "run_slice.py")
        try:
            runpy.run_path(os.path.join(project, "Scripts", script))
        except Exception:
            # an unattended run must never leave an editor open and holding
            # one of the two shared editor slots: log, then quit unsaved
            import traceback

            unreal.log_error("[wynd] %s failed, quitting:\n%s" % (script, traceback.format_exc()))
            unreal.SystemLibrary.quit_editor()

    _state["handle"] = unreal.register_slate_post_tick_callback(_boot)
