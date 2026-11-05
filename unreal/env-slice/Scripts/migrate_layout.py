# One-time move of the first slice's content from /Game/EnvSlice into the
# shared Wyndlewood layout (see README.md, "Folder ownership"), run inside
# the open editor through remote.py. Opens a fresh World Partition map
# (One File Per Actor) first so nothing being moved is held by a level, then
# moves each folder or asset with reference fix-up and removes the old tree.
import unreal

lib = unreal.EditorAssetLibrary
level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

NEW_MAP = "/Game/Wyndlewood/World/Maps/EastbrookVale"
DIRS = [
    ("/Game/EnvSlice/Export", "/Game/Wyndlewood/World/Placeholders/Export"),
    ("/Game/EnvSlice/PolyHaven", "/Game/Wyndlewood/World/PolyHaven"),
    ("/Game/EnvSlice/Rasters", "/Game/Wyndlewood/World/Rasters"),
    ("/Game/EnvSlice/Terrain", "/Game/Wyndlewood/World/Terrain"),
]
ASSETS = [
    ("/Game/EnvSlice/Materials/M_Terrain", "/Game/Wyndlewood/Materials/Landscape/M_Terrain"),
    ("/Game/EnvSlice/Materials/M_Water", "/Game/Wyndlewood/World/Materials/M_Water"),
    ("/Game/EnvSlice/Materials/M_Plant", "/Game/Wyndlewood/World/Placeholders/Materials/M_Plant"),
    ("/Game/EnvSlice/Materials/M_Leaf", "/Game/Wyndlewood/World/Placeholders/Materials/M_Leaf"),
]

out = {}
if not lib.does_asset_exist(NEW_MAP):
    out["newMap"] = level.new_level(NEW_MAP, True)
else:
    out["newMap"] = level.load_level(NEW_MAP)
for src, dst in DIRS:
    if lib.does_directory_exist(src):
        out[src] = lib.rename_directory(src, dst)
for src, dst in ASSETS:
    if lib.does_asset_exist(src):
        out[src] = lib.rename_asset(src, dst)
# redirectors left behind by the moves, then the old tree (old map, probes)
reg = unreal.AssetRegistryHelpers.get_asset_registry()
tools = unreal.AssetToolsHelpers.get_asset_tools()
redirs = [
    a.get_asset()
    for root in ("/Game/EnvSlice", "/Game/Wyndlewood")
    for a in reg.get_assets_by_path(root, recursive=True)
    if str(a.asset_class_path.asset_name) == "ObjectRedirector"
]
if redirs:
    tools.fixup_referencers(redirs)
out["redirectorsFixed"] = len(redirs)
if lib.does_directory_exist("/Game/EnvSlice"):
    out["deleteOld"] = lib.delete_directory("/Game/EnvSlice")
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
out["worldPartition"] = bool(world.get_world_partition()) if hasattr(world, "get_world_partition") else "unknown"
print(out)
