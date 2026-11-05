# Interactive-editor preview: builds a temp level (not saved) with the given registry assets in a row,
# lights it and writes a PNG, then exits. Env: WYND_PREVIEW_IDS (comma list of asset ids),
# WYND_PREVIEW_OUT (png path). Run with UnrealEditor.exe -ExecutePythonScript (one editor only).
import json
import os
import unreal

REG = json.load(open(r'E:\WyndlewoodUnreal\export\registry_t1.json')) if os.environ.get('WYND_PREVIEW_T1') else json.load(open(r'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json'))
IDS = os.environ.get('WYND_PREVIEW_IDS', 'props/eastbrook_bank,props/eastbrook_inn,props/eastbrook_chapel').split(',')
OUT = os.environ.get('WYND_PREVIEW_OUT', r'E:\WyndlewoodUnreal\export\preview.png')

els = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
els.new_level('/Temp/WyndPreview')
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

x = 0.0
for aid in IDS:
    mesh = unreal.EditorAssetLibrary.load_asset(REG[aid]['path'].split('.')[0])
    a = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(x, 0, 0))
    a.static_mesh_component.set_static_mesh(mesh)
    ext = mesh.get_bounds().box_extent
    a.set_actor_scale3d(unreal.Vector(1.3, 1.3, 1.3))
    x += ext.x * 3.2
floor = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(x / 2, 0, -5))
floor.static_mesh_component.set_static_mesh(unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Plane'))
floor.set_actor_scale3d(unreal.Vector(max(x / 50.0, 20), 40, 1))
sun = eas.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1000))
sun.set_actor_rotation(unreal.Rotator(0, -40, 35), False)
sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property('intensity', 8.0)
eas.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 500))
eas.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
cam = eas.spawn_actor_from_class(unreal.CineCameraActor, unreal.Vector(x / 2, -x * 0.9 - 1500, 700))
cam.set_actor_rotation(unreal.Rotator(0, -8, 90), False)

state = {'n': 0}


def tick(dt):
    state['n'] += 1
    if state['n'] == 150:
        unreal.AutomationLibrary.take_high_res_screenshot(1600, 900, OUT, cam)
    if state['n'] == 400:
        unreal.log('WYND preview written ' + OUT)
        unreal.SystemLibrary.execute_console_command(None, 'QUIT_EDITOR')


h = unreal.register_slate_post_tick_callback(tick)
