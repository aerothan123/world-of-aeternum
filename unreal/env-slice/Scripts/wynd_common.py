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
# environment-lead content (README.md "Folder ownership"): the world map,
# terrain, rasters, water and atmosphere under World; landscape materials
# under Materials/Landscape. The exported GLBs and plant materials sit in
# World/Placeholders until the asset-convert and nature crews deliver theirs.
ROOT = "/Game/Wyndlewood/World"
LANDSCAPE = "/Game/Wyndlewood/Materials/Landscape"
PLACEHOLDERS = ROOT + "/Placeholders"
MODELS = PLACEHOLDERS + "/Export"
PH = ROOT + "/PolyHaven"
MAP = ROOT + "/Maps/EastbrookVale"
UNIT = 100.0


def to_ue(x, y, z):
    return unreal.Vector(x * UNIT, z * UNIT, y * UNIT)


def dir_to_ue(d):
    return unreal.Vector(d[0], d[2], d[1])


def yaw_ue(rot_y):
    return -math.degrees(rot_y)


def load_json(name, export=None):
    with open(os.path.join(export or EXPORT, name), "r", encoding="utf8") as f:
        return json.load(f)


# Further export slices built beside the vale, each its own export folder
# next to EXPORT (export_slice.mjs --slice <name>): the Proving Shore is the
# starter island the server spawns players on. Each gets its own terrain and
# raster folders and a material instance of M_Terrain with its bounds.
EXTRA_SLICES = [
    s for s in os.environ.get("WYND_EXTRA_SLICES", "proving_shore").split(",")
    if s and os.path.isdir(os.path.join(os.path.dirname(EXPORT), s))
]


def slice_export(name):
    return os.path.join(os.path.dirname(EXPORT), name)


def slice_folder(kind, name=None):
    """Content folder of a slice's terrain or rasters: the vale keeps the
    plain Terrain and Rasters folders; another slice gets Terrain_<name>."""
    return ROOT + "/" + kind + ("_" + name if name else "")


def model_folder(glb_path):
    """Content folder an exported GLB imports into: /models/props/fence.glb ->
    /Game/Wyndlewood/World/Placeholders/Export/props/fence."""
    rel = glb_path.lstrip("/")
    rel = re.sub(r"^models/", "", rel)
    rel = re.sub(r"\.glb$", "", rel)
    return MODELS + "/" + re.sub(r"[^A-Za-z0-9_/]", "_", rel)


# Imported GLBs split into one static mesh per glTF node; these name tails
# are the client's far LODs and hulls, which the slice does not place.
# A painted building's `_H1` / `_H2` nodes are its upper storeys and roof
# (render/interior_reveal.ts), not hulls, so they are always placed.
SKIP_MESH = re.compile(r"(_LOD[1-9]|_collider|_collision|_shadow)$", re.I)


# The asset-convert crew's converted meshes (Content/Wyndlewood/Assets/
# asset_registry.json, keyed by the GLB path without /models/ and .glb,
# e.g. props/eastbrook_bank). A registry mesh of an allowed category is
# placed instead of the placeholder import. Every category by default;
# WYND_REGISTRY_CATS narrows it (a comma list such as "Buildings,Props").
_REGISTRY = None
REGISTRY_CATS = [c for c in os.environ.get("WYND_REGISTRY_CATS", "all").split(",") if c]


def registry():
    global _REGISTRY
    if _REGISTRY is None:
        p = os.path.join(unreal.Paths.project_content_dir(), "Wyndlewood", "Assets", "asset_registry.json")
        try:
            with open(p, "r", encoding="utf8") as f:
                _REGISTRY = json.load(f)
        except OSError:
            _REGISTRY = {}
    return _REGISTRY


def registry_mesh(glb_path):
    key = re.sub(r"\.glb$", "", re.sub(r"^/?models/", "", glb_path.lstrip("/")))
    rec = registry().get(key)
    if not rec or ("all" not in REGISTRY_CATS and rec.get("cat") not in REGISTRY_CATS):
        return None
    m = unreal.EditorAssetLibrary.load_asset(rec["path"].split(".")[0])
    return m if isinstance(m, unreal.StaticMesh) else None


def canopy_material(glb_path, variant):
    """(slot, material) for a placement's canopyVariant, from the registry's
    `canopy_variants: {variant: {slot, material}}` (asset-convert's market
    stall entry); None when the entry or variant is absent. The slot is a
    material slot name or index."""
    key = re.sub(r"\.glb$", "", re.sub(r"^/?models/", "", glb_path.lstrip("/")))
    v = (registry().get(key) or {}).get("canopy_variants", {}).get(variant)
    if not v:
        return None
    m = unreal.EditorAssetLibrary.load_asset(str(v["material"]).split(".")[0])
    return (v["slot"], m) if m else None


# which GLB paths resolved to a converted mesh and which fell back to the
# placeholder import, for the build's stats
MESH_SOURCES = {"registry": set(), "placeholder": set()}


def model_meshes(glb_path):
    reg = registry_mesh(glb_path)
    if reg:
        MESH_SOURCES["registry"].add(glb_path)
        return [reg]
    MESH_SOURCES["placeholder"].add(glb_path)
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
