# Imports one terrain tile and one building GLB through Interchange and
# records what assets come out and their bounds, to pin the glTF to Unreal
# axis convention the slice build relies on.
import json
import os

import unreal

EXPORT = r"E:\WyndlewoodUnreal\export\eastbrook_vale"
OUT = r"E:\WyndlewoodUnreal\probe_import.json"
files = [
    (os.path.join(EXPORT, "terrain", "terrain_0_0.glb"), "/Game/EnvSlice/Probe/Terrain"),
    (os.path.join(EXPORT, "models", "tidehold", "smithy.glb"), "/Game/EnvSlice/Probe/Smithy"),
]
res = {"tasks": []}
for src, dest in files:
    task = unreal.AssetImportTask()
    task.filename = src
    task.destination_path = dest
    task.automated = True
    task.replace_existing = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    paths = list(task.imported_object_paths)
    entry = {"src": src, "imported": paths, "meshes": []}
    for p in unreal.EditorAssetLibrary.list_assets(dest, recursive=True):
        a = unreal.load_asset(p)
        row = {"path": p, "class": a.get_class().get_name()}
        if isinstance(a, unreal.StaticMesh):
            b = a.get_bounding_box()
            row["min"] = [b.min.x, b.min.y, b.min.z]
            row["max"] = [b.max.x, b.max.y, b.max.z]
            row["nanite"] = a.get_editor_property("nanite_settings").enabled
        entry["meshes"].append(row)
    res["tasks"].append(entry)
with open(OUT, "w") as f:
    json.dump(res, f, indent=1)
unreal.log("probe_import wrote " + OUT)
