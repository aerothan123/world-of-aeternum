# Entry point, run inside the full editor:
#   UnrealEditor.exe EnvSlice.uproject -ExecutePythonScript=<this file>
# Builds the slice into a fresh level, then for each shot: sets the sun to
# the shot's game time of day, pilots the shot camera, lets Lumen and the
# virtual shadow maps settle, measures the mean frame time over a window,
# waits for shaders and streaming, and takes a 2560x1440 high-res shot. Ends
# by saving the level, writing shots.json and closing the editor.
import json
import os
import sys
import time

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import unreal  # noqa: E402
import wynd_common as W  # noqa: E402
import wynd_scene as S  # noqa: E402

WIDTH, HEIGHT = 2560, 1440
WARMUP_FRAMES = int(os.environ.get("WYND_WARMUP", "240"))
MEASURE_FRAMES = 150
ONLY = [s for s in os.environ.get("WYND_SHOTS", "").split(",") if s]

# Shots in the GAME frame: eye (x, height above ground, z), target (x, height
# above ground, z), focal length, key light. Slice facts these lean on: the
# civic square and monument at (-14.75, -102), the bank (-62, -118), the
# Eastbrook Docks and watchtower west of town on the sea, the north road
# toward Wolf Run. The shipped slice has no river or water mill, so shot 3
# frames the harbour shore instead.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "look_shots.json")) as _f:
    SHOTS = json.load(_f)["shots"]
if ONLY:
    SHOTS = [s for s in SHOTS if s["name"] in ONLY]

level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
try:  # keep ticking at full rate while the editor window is in the background
    perf = unreal.load_object(None, "/Script/UnrealEd.Default__EditorPerformanceSettings")
    perf.set_editor_property("bThrottleCPUWhenNotForeground", False)
    W.log("background throttle off")
except Exception as err:
    W.log("throttle setting unavailable (%s); Config/DefaultEditorPerProjectUserSettings.ini sets it" % err)

os.makedirs(W.OUT, exist_ok=True)
# the main map is World Partition with One File Per Actor: load it when it
# exists (a new_level over it would replace it), create it partitioned if not
if unreal.EditorAssetLibrary.does_asset_exist(W.MAP):
    level.load_level(W.MAP)
else:
    level.new_level(W.MAP, True)

t0 = time.time()
cover = []
for s in SHOTS:
    ex, _, ez = s["eye"]
    tx, _, tz = s["target"]
    if s["name"] != "wide_vista":
        cover.append((ex * 0.4 + tx * 0.6, ez * 0.4 + tz * 0.6, 46.0))
sl, sun = S.build(cover)
build_s = time.time() - t0
# diagnostic shots name a probe radius: log nature's instances around the
# target so a blotch can be told apart from terrain shading (read-only)
for s in SHOTS:
    if s.get("probeRadius"):
        tx, _, tz = s["target"]
        near = S.nature_near(tx, tz, s["probeRadius"])
        sl.stats.setdefault("natureNear", {})[s["name"]] = near
        W.log("nature near %s: %s" % (s["name"], near))
world = unreal.EditorLevelLibrary.get_editor_world()


def cmd(c):
    unreal.SystemLibrary.execute_console_command(world, c)


for c in ["r.ScreenPercentage 100", "r.Lumen.ScreenProbeGather.TemporalFilterProbes 1",
          "r.VolumetricFog.GridPixelSize 8", "r.Shadow.Virtual.Enable 1", "t.MaxFPS 0"]:
    cmd(c)
try:
    level.editor_set_game_view(True)
except Exception as err:
    W.log("game view: %s" % err)

cams = []
for s in SHOTS:
    ex, eh, ez = s["eye"]
    tx, th, tz = s["target"]
    eye = W.to_ue(ex, sl.ground(ex, ez) + eh, ez)
    tgt = W.to_ue(tx, max(sl.ground(tx, tz), sl.sea) + th, tz)
    cams.append(S.camera(s["name"], eye, tgt, s["focal"]))

state = {"i": -1, "frame": 0, "deltas": [], "task": None, "wait": 0, "results": []}


def begin(i):
    s = SHOTS[i]
    S.set_time(sl, sun, s["time"])
    level.pilot_level_actor(cams[i])
    state.update(i=i, frame=0, deltas=[], task=None, wait=0)


def finish():
    unreal.unregister_slate_post_tick_callback(handle)
    with open(os.path.join(W.OUT, "shots.json"), "w") as f:
        json.dump({"buildSeconds": build_s, "stats": sl.stats, "shots": state["results"]}, f, indent=1)
    level.eject_pilot_level_actor()
    unreal.EditorLevelLibrary.save_current_level()
    if os.environ.get("WYND_KEEP") == "1":
        W.log("done; editor kept open")
        return
    W.log("done; quitting")
    unreal.SystemLibrary.quit_editor()


def tick(dt):
    if state["i"] < 0:
        begin(0)
        return
    s = SHOTS[state["i"]]
    state["frame"] += 1
    f = state["frame"]
    if f > WARMUP_FRAMES and len(state["deltas"]) < MEASURE_FRAMES:
        state["deltas"].append(dt)
        return
    if state["task"] is None and len(state["deltas"]) >= MEASURE_FRAMES:
        unreal.AutomationLibrary.finish_loading_before_screenshot()
        name = os.path.join(W.OUT, "unreal_%s.png" % s["name"])
        state["task"] = unreal.AutomationLibrary.take_high_res_screenshot(WIDTH, HEIGHT, name, cams[state["i"]])
        state["file"] = name
        return
    if state["task"] is not None:
        state["wait"] += 1
        done = state["task"].is_task_done() if hasattr(state["task"], "is_task_done") else state["wait"] > 120
        if not done and state["wait"] < 900:
            return
        d = sorted(state["deltas"])
        state["results"].append({
            "name": s["name"],
            "time": s["time"],
            "meanFrameMs": 1000.0 * sum(d) / len(d),
            "p95FrameMs": 1000.0 * d[int(len(d) * 0.95) - 1],
            "file": state["file"],
            "exists": os.path.exists(state["file"]),
        })
        W.log("shot %s" % state["results"][-1])
        if state["i"] + 1 < len(SHOTS):
            begin(state["i"] + 1)
        else:
            finish()


handle = unreal.register_slate_post_tick_callback(tick)
