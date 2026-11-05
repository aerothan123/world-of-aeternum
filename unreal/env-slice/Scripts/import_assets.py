# Imports the world slice export (terrain tiles, the PNG rasters, every placed
# and scattered GLB) and the CC0 Poly Haven ground textures and plant models
# into /Game/EnvSlice. Idempotent: an asset that already exists is skipped
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


def import_texture(src, dest, compression=None, srgb=True):
    path = dest + "/" + os.path.splitext(os.path.basename(src))[0]
    if REIMPORT or not lib.does_asset_exist(path):
        run_task(src, dest)
    tex = lib.load_asset(path)
    if not tex:
        return None
    if compression is not None:
        tex.set_editor_property("compression_settings", compression)
    tex.set_editor_property("srgb", srgb)
    lib.save_loaded_asset(tex)
    return tex


def main():
    manifest = W.load_json("manifest.json")
    stats = {"terrain": 0, "models": 0, "textures": 0, "plants": 0, "failed": []}
    n = int(manifest["terrainTiles"]["perSide"])
    for i in range(manifest["terrainTiles"]["count"]):
        name = "terrain_%d_%d" % (i % n, i // n)
        r = import_folder(os.path.join(W.EXPORT, "terrain", name + ".glb"), W.ROOT + "/Terrain/" + name)
        stats["terrain"] += 1 if r != 0 else 0
    for m in manifest["models"]:
        src = os.path.join(W.EXPORT, m["path"].lstrip("/").replace("/", os.sep))
        if import_folder(src, W.model_folder(m["path"])) == 0:
            stats["failed"].append(m["path"])
        stats["models"] += 1
    rasters = W.ROOT + "/Rasters"
    import_texture(os.path.join(W.EXPORT, "splat_control.png"), rasters, TC.TC_VECTOR_DISPLACEMENTMAP, False)
    import_texture(os.path.join(W.EXPORT, "tint.png"), rasters, None, True)
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
