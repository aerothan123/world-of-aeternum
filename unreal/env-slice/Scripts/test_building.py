# Isolation test for a converted building: a throwaway level holding only
# the mesh the main build would place for one GLB path (WYND_TEST_GLB,
# default /models/tidehold/bank.glb), a sun, sky and sky light, and one
# camera. Logs which mesh and which material each slot of the PLACED
# component resolves to (overrides included), then takes one 1920x1080
# shot to WYND_OUT/test_<name>.png and quits. Run through init_unreal.py
# with WYND_RUN=1 WYND_SCRIPT=test_building.py.
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import unreal  # noqa: E402
import wynd_common as W  # noqa: E402

GLB = os.environ.get("WYND_TEST_GLB", "/models/tidehold/bank.glb")
NAME = os.path.splitext(os.path.basename(GLB))[0]
LEVEL = W.ROOT + "/Maps/Test_Building"
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
mel = unreal.MaterialEditingLibrary

if unreal.EditorAssetLibrary.does_asset_exist(LEVEL):
    level.load_level(LEVEL)
else:
    level.new_level(LEVEL, False)
for a in actors.get_all_level_actors():
    if a.get_actor_label().startswith("WYND_"):
        actors.destroy_actor(a)

meshes = W.model_meshes(GLB)
W.log("test %s meshes %s" % (GLB, [m.get_path_name() for m in meshes]))
lo, hi = W.union_bounds(meshes)
for m in meshes:
    a = actors.spawn_actor_from_object(m, unreal.Vector(0, 0, -lo[2]), unreal.Rotator(0, 0, 0))
    a.set_actor_label("WYND_Test_" + m.get_name())
    c = a.static_mesh_component
    for i in range(c.get_num_materials()):
        mi = c.get_material(i)
        line = "slot %d %s" % (i, mi.get_path_name() if mi else None)
        if isinstance(mi, unreal.MaterialInstance):
            for n in mel.get_texture_parameter_names(mi):
                t = mel.get_material_instance_texture_parameter_value(mi, n)
                line += " | %s=%s" % (n, t.get_name() if t else None)
        W.log("test " + line)
    if os.environ.get("WYND_TEST_DEBUG") == "1":
        # Swap every slot, on THIS test component only, for a bare unlit
        # material that samples the slot's own BaseColorTex on UV0. If the
        # atlas shows, the mesh UVs and textures are fine and the flat look
        # comes from the master graph; if it stays flat, the built UVs are.
        import wynd_materials as WM

        dbg_path = W.PLACEHOLDERS + "/Materials/M_TexDebug"
        dbg = WM.fresh_material(dbg_path)
        dbg.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
        dbg.set_editor_property("used_with_nanite", True)
        g = WM.G(dbg)
        s = g.node(
            unreal.MaterialExpressionTextureSampleParameter2D, 2,
            parameter_name="Tex", texture=unreal.EditorAssetLibrary.load_asset("/Engine/EngineResources/DefaultTexture"),
        )
        mel.connect_material_property(s, "RGB", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
        mel.recompile_material(dbg)
        unreal.EditorAssetLibrary.save_loaded_asset(dbg)
        for i in range(c.get_num_materials()):
            src = c.get_material(i)
            tex = None
            if isinstance(src, unreal.MaterialInstance):
                tex = mel.get_material_instance_texture_parameter_value(src, "BaseColorTex")
            if not tex:
                continue
            mi = c.create_dynamic_material_instance(i, dbg)
            mi.set_texture_parameter_value("Tex", tex)
        W.log("test debug material applied to %d slots" % c.get_num_materials())

sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 2000), unreal.Rotator(-35, 0, 40))
sun.set_actor_label("WYND_Test_Sun")
sun.light_component.set_editor_property("atmosphere_sun_light", True)
sun.light_component.set_editor_property("intensity", 10.0)
actors.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0)).set_actor_label("WYND_Test_Sky")
sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 0))
sky.set_actor_label("WYND_Test_SkyLight")
sky.light_component.set_editor_property("real_time_capture", True)
sky.light_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)

size = max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
center = unreal.Vector((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (hi[2] - lo[2]) / 2)
eye = unreal.Vector(center.x + size * 1.3, center.y - size * 1.1, center.z + size * 0.4)
cam = actors.spawn_actor_from_class(
    unreal.CineCameraActor, eye, unreal.MathLibrary.find_look_at_rotation(eye, center)
)
cam.set_actor_label("WYND_Test_Cam")
level.pilot_level_actor(cam)
try:
    level.editor_set_game_view(True)
except Exception as err:
    W.log("game view: %s" % err)

os.makedirs(W.OUT, exist_ok=True)
state = {"frame": 0, "task": None, "wait": 0}
shot = os.path.join(W.OUT, "test_%s.png" % NAME)


def tick(dt):
    state["frame"] += 1
    if state["frame"] < 180:
        return
    if state["task"] is None:
        unreal.AutomationLibrary.finish_loading_before_screenshot()
        state["task"] = unreal.AutomationLibrary.take_high_res_screenshot(1920, 1080, shot, cam)
        return
    state["wait"] += 1
    done = state["task"].is_task_done() if hasattr(state["task"], "is_task_done") else state["wait"] > 120
    if not done and state["wait"] < 900:
        return
    unreal.unregister_slate_post_tick_callback(handle)
    W.log("test shot %s exists %s" % (shot, os.path.exists(shot)))
    level.eject_pilot_level_actor()
    unreal.SystemLibrary.quit_editor()


handle = unreal.register_slate_post_tick_callback(tick)
