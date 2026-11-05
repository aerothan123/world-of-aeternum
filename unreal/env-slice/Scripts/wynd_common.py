# Shared paths, the game to Unreal frame conversion and the export readers
# for the env slice editor scripts.
#
# Frame: the world slice export is in the game frame (right-handed, +Y up,
# yards, the glTF frame). Interchange imports glTF as UE = (100 x, 100 z,
# 100 y) (pinned by probe_import.py on terrain_0_0: game x, z in [-224, -168]
# came in as UE X, Y in [-22400, -16800]), so the world uses the same map
# and one game unit is one metre. A game yaw rotY about +Y becomes a UE yaw
# of -rotY (in degrees) about +Z.
import json
import math
import os
import re

import unreal

EXPORT = os.environ.get("WYND_EXPORT", r"E:\WyndlewoodUnreal\export\eastbrook_vale")
THIRD_PARTY = os.environ.get("WYND_THIRD_PARTY", r"E:\WyndlewoodUnreal\ThirdParty\polyhaven")
OUT = os.environ.get("WYND_OUT", r"E:\WyndlewoodUnreal\out")
ROOT = "/Game/EnvSlice"
MODELS = ROOT + "/Export"
PH = ROOT + "/PolyHaven"
MAP = ROOT + "/Maps/EastbrookVale"
UNIT = 100.0


def to_ue(x, y, z):
    return unreal.Vector(x * UNIT, z * UNIT, y * UNIT)


def dir_to_ue(d):
    return unreal.Vector(d[0], d[2], d[1])


def yaw_ue(rot_y):
    return -math.degrees(rot_y)


def load_json(name):
    with open(os.path.join(EXPORT, name), "r", encoding="utf8") as f:
        return json.load(f)


def model_folder(glb_path):
    """Content folder an exported GLB imports into: /models/props/fence.glb ->
    /Game/EnvSlice/Export/props/fence."""
    rel = glb_path.lstrip("/")
    rel = re.sub(r"^models/", "", rel)
    rel = re.sub(r"\.glb$", "", rel)
    return MODELS + "/" + re.sub(r"[^A-Za-z0-9_/]", "_", rel)


# Imported GLBs split into one static mesh per glTF node; these name tails
# are the client's far LODs and hulls, which the slice does not place.
SKIP_MESH = re.compile(r"(_H\d+|_LOD[1-9]|_L[1-9]|_collider|_collision|_shadow)$", re.I)


def model_meshes(glb_path):
    folder = model_folder(glb_path)
    out = []
    for p in unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        a = unreal.EditorAssetLibrary.load_asset(p)
        if isinstance(a, unreal.StaticMesh) and not SKIP_MESH.search(a.get_name()):
            out.append(a)
    return out


def union_bounds(meshes):
    lo = [1e18, 1e18, 1e18]
    hi = [-1e18, -1e18, -1e18]
    for m in meshes:
        b = m.get_bounding_box()
        for i, (a, c) in enumerate(((b.min.x, b.max.x), (b.min.y, b.max.y), (b.min.z, b.max.z))):
            lo[i] = min(lo[i], a)
            hi[i] = max(hi[i], c)
    return lo, hi


def fit_scale(fit, lo, hi):
    """Uniform (or per-axis for spans) scale for an export fit record, from
    the model's bounds in UE units (Z up)."""
    ext = [max(1e-3, hi[i] - lo[i]) / UNIT for i in range(3)]
    mode = fit["mode"]
    if mode == "maxDim":
        s = fit["size"] / max(ext)
        return (s, s, s)
    if mode == "height":
        s = fit["height"] / ext[2]
        return (s, s, s)
    if mode == "span":
        sx = fit["length"] / ext[0]
        sz = fit["height"] / ext[2]
        return (sx, sz, sz)
    s = fit["scale"]
    return (s, s, s)


def log(msg):
    unreal.log("[wynd] " + msg)
