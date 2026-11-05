# Commandlet step after import_assets.py. Builds two masked, two-sided,
# two-sided-foliage master materials and re-materials the vegetation with
# instances of them, so leaves, grass and flowers cut out properly and let
# light through from behind:
#   M_Plant  Poly Haven ground cover: colour + separate cut-out mask (their
#            glTF ships JPG colour with no alpha, and imports as opaque
#            BLEND cards), normal (OpenGL, green flipped), ARM.
#   M_Leaf   the game's own foliage leaves: colour with its alpha as the mask.
# Runs in the commandlet so the render run never recompiles a material while
# it instances (doing that in the open editor stalled its game thread).
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import unreal  # noqa: E402
import wynd_common as W  # noqa: E402
import wynd_materials as WM  # noqa: E402

mel = unreal.MaterialEditingLibrary
lib = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
MP = unreal.MaterialProperty


def master(name, separate_alpha):
    m = WM.fresh_material(W.ROOT + "/Materials/" + name)
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    m.set_editor_property("two_sided", True)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    m.set_editor_property("used_with_instanced_static_meshes", True)
    m.set_editor_property("used_with_nanite", True)
    g = WM.G(m)

    def tparam(pname, kind):
        st = {
            "color": unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,
            "normal": unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,
            "masks": unreal.MaterialSamplerType.SAMPLERTYPE_MASKS,
        }[kind]
        return g.node(unreal.MaterialExpressionTextureSampleParameter2D, 3, parameter_name=pname, sampler_type=st)

    col = tparam("BaseColor", "color")
    tint = g.node(
        unreal.MaterialExpressionVectorParameter, 4, parameter_name="Tint",
        default_value=unreal.LinearColor(1.0, 1.0, 1.0, 1.0),
    )
    base = g.op(unreal.MaterialExpressionMultiply, col, tint, "RGB")
    mel.connect_material_property(base, "", MP.MP_BASE_COLOR)
    sss = g.op(unreal.MaterialExpressionMultiply, base, g.const(0.7))
    mel.connect_material_property(sss, "", MP.MP_SUBSURFACE_COLOR)
    if separate_alpha:
        alpha = tparam("Alpha", "masks")
        mel.connect_material_property(alpha, "R", MP.MP_OPACITY_MASK)
        nor = tparam("Normal", "normal")
        mel.connect_material_property(nor, "RGB", MP.MP_NORMAL)
        arm = tparam("ARM", "masks")
        mel.connect_material_property(arm, "G", MP.MP_ROUGHNESS)
        mel.connect_material_property(arm, "R", MP.MP_AMBIENT_OCCLUSION)
    else:
        mel.connect_material_property(col, "A", MP.MP_OPACITY_MASK)
        mel.connect_material_property(g.const(0.8), "", MP.MP_ROUGHNESS)
    m.set_editor_property("opacity_mask_clip_value", 0.4)
    mel.recompile_material(m)
    lib.save_loaded_asset(m)
    return m


def instance(path, parent, textures):
    if lib.does_asset_exist(path):
        lib.delete_asset(path)
    pkg, name = path.rsplit("/", 1)
    mi = tools.create_asset(name, pkg, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(mi, parent)
    for k, t in textures.items():
        if t:
            mel.set_material_instance_texture_parameter_value(mi, k, t)
    mel.update_material_instance(mi)
    lib.save_loaded_asset(mi)
    return mi


def textures_in(folder):
    out = {}
    for p in lib.list_assets(folder, recursive=True, include_folder=False):
        a = lib.load_asset(p)
        if isinstance(a, unreal.Texture2D):
            out[a.get_name().lower()] = a
    return out


def import_png(src, dest):
    t = unreal.AssetImportTask()
    t.filename = src
    t.destination_path = dest
    t.automated = True
    t.replace_existing = True
    t.save = True
    tools.import_asset_tasks([t])
    return lib.load_asset(dest + "/" + os.path.splitext(os.path.basename(src))[0])


plant = master("M_Plant", True)
leaf = master("M_Leaf", False)
stats = {"plants": 0, "leafSlots": 0, "missing": []}

for asset in sorted(os.listdir(W.THIRD_PARTY)):
    cut = os.path.join(W.THIRD_PARTY, asset, "cutout", asset + "_alpha_1k.png")
    folder = W.PH + "/Plants/" + asset
    if not lib.does_directory_exist(folder):
        continue
    alpha = import_png(cut, folder + "/Cutout") if os.path.exists(cut) else None
    if alpha:
        alpha.set_editor_property("srgb", False)
        alpha.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
        lib.save_loaded_asset(alpha)
    tex = textures_in(folder)
    pick = lambda key: next((t for n, t in tex.items() if key in n and "alpha" not in n), None)  # noqa: E731
    nor = pick("nor")
    if nor:
        nor.set_editor_property("flip_green_channel", True)
        lib.save_loaded_asset(nor)
    mi = instance(
        folder + "/MI_" + asset, plant,
        {"BaseColor": pick("diff"), "Normal": nor, "ARM": pick("arm"), "Alpha": alpha},
    )
    if not alpha:
        stats["missing"].append(asset)
    for p in lib.list_assets(folder, recursive=True, include_folder=False):
        m = lib.load_asset(p)
        if isinstance(m, unreal.StaticMesh):
            for i in range(len(m.get_editor_property("static_materials"))):
                m.set_material(i, mi)
            lib.save_loaded_asset(m)
            stats["plants"] += 1

LEAFY = ("leaf", "leaves", "fern")
made = {}
for p in lib.list_assets(W.MODELS + "/foliage", recursive=True, include_folder=False):
    m = lib.load_asset(p)
    if not isinstance(m, unreal.StaticMesh):
        continue
    changed = False
    for i, sm in enumerate(m.get_editor_property("static_materials")):
        src = sm.get_editor_property("material_interface")
        if not src or not any(k in src.get_name().lower() for k in LEAFY):
            continue
        key = src.get_path_name()
        if key not in made:
            base = None
            for n in mel.get_texture_parameter_names(src):
                if "base" in str(n).lower() or "color" in str(n).lower() or "albedo" in str(n).lower():
                    base = mel.get_material_instance_texture_parameter_value(src, n)
                    if base:
                        break
            folder = src.get_path_name().rsplit("/", 1)[0]
            made[key] = instance(folder + "/MI_Leaf_" + src.get_name(), leaf, {"BaseColor": base})
        m.set_material(i, made[key])
        changed = True
        stats["leafSlots"] += 1
    if changed:
        lib.save_loaded_asset(m)

W.log("foliage prep %s" % stats)
