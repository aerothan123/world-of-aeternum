# Imports the world slice export (terrain tiles, the PNG rasters, every placed
# and scattered GLB) and the CC0 Poly Haven ground textures and plant models
# into /Game/Wyndlewood/World (wynd_common paths). Idempotent: an asset that already exists is skipped
# unless WYND_REIMPORT=1.
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import unreal  # noqa: E402
import wynd_common as W  # noqa: E402

REIMPORT = os.environ.get("WYND_REIMPORT") == "1"
tools = unreal.AssetToolsHelpers.get_asset_tools()
lib = unreal.EditorAssetLibrary
TC = unreal.TextureCompressionSettings


def run_task(src, dest):
    t = unreal.AssetImportTask()
    t.filename = src
    t.destination_path = dest
    t.automated = True
    t.replace_existing = True
    t.save = True
    tools.import_asset_tasks([t])
    return len(t.imported_object_paths)


def import_folder(src, dest):
    """A GLB or glTF, imported into its own folder (skipped when it has assets)."""
    if not REIMPORT and lib.does_directory_exist(dest) and lib.list_assets(dest, True, False):
        return -1
    return run_task(src, dest)


def import_texture(src, dest, compression=None, srgb=True, force=False):
    path = dest + "/" + os.path.splitext(os.path.basename(src))[0]
    if force or REIMPORT or not lib.does_asset_exist(path):
        run_task(src, dest)
    tex = lib.load_asset(path)
    if not tex:
        return None
    if compression is not None:
        tex.set_editor_property("compression_settings", compression)
    tex.set_editor_property("srgb", srgb)
    lib.save_loaded_asset(tex)
    return tex


def import_slice(export, name, stats):
    """One export slice's terrain tiles, models and rasters (the models share
    one folder per GLB path across slices)."""
    manifest = W.load_json("manifest.json", export)
    n = int(manifest["terrainTiles"]["perSide"])
    terrain = W.slice_folder("Terrain", name)
    for i in range(manifest["terrainTiles"]["count"]):
        tile = "terrain_%d_%d" % (i % n, i // n)
        r = import_folder(os.path.join(export, "terrain", tile + ".glb"), terrain + "/" + tile)
        stats["terrain"] += 1 if r != 0 else 0
    for m in manifest["models"]:
        src = os.path.join(export, m["path"].lstrip("/").replace("/", os.sep))
        if import_folder(src, W.model_folder(m["path"])) == 0:
            stats["failed"].append(m["path"])
        stats["models"] += 1
    rasters = W.slice_folder("Rasters", name)
    import_texture(os.path.join(export, "splat_control.png"), rasters, TC.TC_VECTOR_DISPLACEMENTMAP, False, True)
    import_texture(os.path.join(export, "splat_cobble.png"), rasters, TC.TC_VECTOR_DISPLACEMENTMAP, False, True)
    import_texture(os.path.join(export, "tint.png"), rasters, None, True, True)
    return manifest


def reimport_terrain():
    """WYND_TERRAIN_ONLY=1: replace just the terrain tiles of every slice (a
    terrain_mesh.ts change, such as the edge skirts) and leave the rest."""
    count = 0
    for export, name in [(W.EXPORT, None)] + [(W.slice_export(e), e) for e in W.EXTRA_SLICES]:
        manifest = W.load_json("manifest.json", export)
        n = int(manifest["terrainTiles"]["perSide"])
        terrain = W.slice_folder("Terrain", name)
        for i in range(manifest["terrainTiles"]["count"]):
            tile = "terrain_%d_%d" % (i % n, i // n)
            run_task(os.path.join(export, "terrain", tile + ".glb"), terrain + "/" + tile)
            count += 1
    W.log("terrain reimported %d tiles" % count)


def main():
    if os.environ.get("WYND_TERRAIN_ONLY") == "1":
        reimport_terrain()
        return
    stats = {"terrain": 0, "models": 0, "textures": 0, "plants": 0, "failed": [], "slices": []}
    manifest = import_slice(W.EXPORT, None, stats)
    for extra in W.EXTRA_SLICES:
        import_slice(W.slice_export(extra), extra, stats)
        stats["slices"].append(extra)
    # the slice's own placeholder ground cover (cover_meshes.ts), until the
    # nature crew's PCG grass and flowers replace it
    stats["cover"] = 0
    for name in manifest["stats"].get("cover", []):
        src = os.path.join(W.EXPORT, "cover", name + ".glb")
        if import_folder(src, W.PLACEHOLDERS + "/Cover/" + name) != 0:
            stats["cover"] += 1
    for asset in sorted(os.listdir(W.THIRD_PARTY)):
        d = os.path.join(W.THIRD_PARTY, asset)
        if not os.path.isdir(d):
            continue
        gltf = [f for f in os.listdir(d) if f.endswith(".gltf")]
        if gltf:
            import_folder(os.path.join(d, gltf[0]), W.PH + "/Plants/" + asset)
            stats["plants"] += 1
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".png"):
                continue
            if "_nor_dx_" in f:
                tex = import_texture(os.path.join(d, f), W.PH + "/Ground/" + asset, TC.TC_NORMALMAP, False)
            elif "_Diffuse_" in f:
                tex = import_texture(os.path.join(d, f), W.PH + "/Ground/" + asset, None, True)
            else:
                tex = import_texture(os.path.join(d, f), W.PH + "/Ground/" + asset, TC.TC_MASKS, False)
            if tex:
                stats["textures"] += 1
            else:
                stats["failed"].append(f)
    W.log("import stats %s" % stats)
    os.makedirs(W.OUT, exist_ok=True)
    with open(os.path.join(W.OUT, "import_stats.txt"), "w") as fh:
        fh.write(repr(stats))


main()
