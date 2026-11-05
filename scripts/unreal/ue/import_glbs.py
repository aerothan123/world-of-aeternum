# Headless import of game GLBs into /Game/Wyndlewood/Assets (one combined StaticMesh per asset id).
# Run via run_import.ps1 (UnrealEditor-Cmd -run=pythonscript).
# Env: WYND_MANIFEST, WYND_TIERS (comma list), WYND_LIMIT (0=all), WYND_REGISTRY (json out).
# Idempotent: assets already present are only re-registered.
import json
import os
import unreal

MANIFEST = os.environ.get('WYND_MANIFEST', r'E:\WyndlewoodUnreal\export\asset_manifest.json')
REGISTRY = os.environ.get('WYND_REGISTRY', r'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json')
TIERS = [int(t) for t in os.environ.get('WYND_TIERS', '1').split(',')]
LIMIT = int(os.environ.get('WYND_LIMIT', '0'))
ROOT = '/Game/Wyndlewood/Assets'

eal = unreal.EditorAssetLibrary
mgr = unreal.InterchangeManager.get_interchange_manager_scripted()


def set_nanite(mesh):
    try:
        ns = mesh.get_editor_property('nanite_settings')
        ns.set_editor_property('enabled', True)
        mesh.set_editor_property('nanite_settings', ns)
        return True
    except Exception as e:
        unreal.log_warning(f'WYND nanite: {e}')
        return False


def set_box_collision(mesh):
    try:
        bs = mesh.get_editor_property('body_setup')
        b = mesh.get_bounds()
        elem = unreal.KBoxElem()
        elem.set_editor_property('center', b.origin)
        elem.set_editor_property('x', b.box_extent.x * 2.0)
        elem.set_editor_property('y', b.box_extent.y * 2.0)
        elem.set_editor_property('z', b.box_extent.z * 2.0)
        agg = bs.get_editor_property('agg_geom')
        agg.set_editor_property('box_elems', [elem])
        bs.set_editor_property('agg_geom', agg)
        bs.set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_SIMPLE_AND_COMPLEX)
        return True
    except Exception as e:
        unreal.log_warning(f'WYND collision: {e}')
        return False


man = json.load(open(MANIFEST))
reg = json.load(open(REGISTRY)) if os.path.exists(REGISTRY) else {}
done = 0
for it in man['items']:
    if it['tier'] not in TIERS:
        continue
    if LIMIT and done >= LIMIT:
        break
    dest_dir = f"{ROOT}/{it['cat']}"
    prev = reg.get(it['id'])
    if prev and eal.does_asset_exist(prev['path'].split('.')[0]):
        continue
    src = it.get('local') or os.path.join(man['modelsRoot'], it['glb'].replace('/', os.sep))
    sd = unreal.InterchangeManager.create_source_data(src)
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    params.replace_existing = True
    objs = mgr.import_asset(dest_dir, sd, params)
    meshes = [o for o in (objs or []) if isinstance(o, unreal.StaticMesh)]
    if not meshes:
        unreal.log_warning(f"WYND import failed: {it['id']}")
        continue
    mesh = meshes[0]
    if len(meshes) > 1:
        unreal.log_warning(f"WYND {it['id']} produced {len(meshes)} meshes")
    # Normalise the name so the registry path is predictable.
    final = mesh.get_path_name()
    set_nanite(mesh)
    set_box_collision(mesh)
    eal.save_directory(f'{dest_dir}/{it["name"]}', only_if_is_dirty=False, recursive=True)
    eal.save_loaded_asset(mesh)
    reg[it['id']] = {'path': final, 'cat': it['cat'], 'mat': it['mat'], 'parts': len(meshes), 'prims': it.get('prims'), 'sockets': it.get('sockets', [])}
    done += 1
    unreal.log(f"WYND imported {it['id']} -> {final}")

os.makedirs(os.path.dirname(REGISTRY), exist_ok=True)
json.dump(reg, open(REGISTRY, 'w'), indent=1, sort_keys=True)
unreal.log(f'WYND done imported={done} registry={len(reg)}')



