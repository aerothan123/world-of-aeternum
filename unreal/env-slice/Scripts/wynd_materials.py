# Builds the slice's master materials through MaterialEditingLibrary:
#   M_Terrain  five PBR ground layers (grass, dirt, sand, rock, cobble) from
#              CC0 Poly Haven sets, blended by the exported splat control map
#              with a height-aware edge, world-aligned tiling, and the game's
#              own baked ground tint as a low-strength macro colour.
#   M_Water    single layer water at the game's water level.
import os

import unreal

import wynd_common as W

mel = unreal.MaterialEditingLibrary
lib = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
MP = unreal.MaterialProperty

# layer, Poly Haven set, tile size in metres, edge contrast
LAYERS = [
    ("grass", "leafy_grass", 3.2),
    ("dirt", "dirt_floor", 3.0),
    ("sand", "coast_sand_01", 4.0),
    ("rock", "rock_pitted_mossy", 4.5),
    ("cobble", "mossy_cobblestone", 2.6),
]
# The vale's painted turf as a linear colour (sRGB about 78, 138, 46: the
# Refined client's sunlit grass), and the mean linear luminance of the
# leafy_grass scan, measured over its 2k diffuse, that its detail divides by.
GRASS_COLOR = (0.076, 0.25, 0.028, 1.0)
GRASS_SCAN_LUM = 0.241
# The game's baked ground tint averaged over the slice (tint.png, linear).
TINT_MEAN = (0.493, 0.53, 0.249)


def fresh_material(path):
    """An empty material at `path`. An existing one is cleared in place
    rather than deleted: a delete fails while instances still reference it
    (and an unattended create over it is refused), and clearing keeps every
    instance and mesh slot pointing at the same asset."""
    if lib.does_asset_exist(path):
        m = lib.load_asset(path)
        if isinstance(m, unreal.Material):
            mel.delete_all_material_expressions(m)
            return m
        lib.delete_asset(path)
    pkg, name = path.rsplit("/", 1)
    return tools.create_asset(name, pkg, unreal.Material, unreal.MaterialFactoryNew())


class G:
    """Tiny graph helper: node placement on a grid, typed connections."""

    def __init__(self, mat):
        self.m = mat
        self.row = 0

    def node(self, cls, x=0, **props):
        e = mel.create_material_expression(self.m, cls, -300 * (x + 1), 140 * self.row)
        self.row += 1
        for k, v in props.items():
            e.set_editor_property(k, v)
        return e

    def const(self, v):
        return self.node(unreal.MaterialExpressionConstant, 6, r=v)

    def link(self, a, out, b, inp):
        mel.connect_material_expressions(a, out, b, inp)

    def op(self, cls, a, b, ao="", bo=""):
        e = self.node(cls, 2)
        self.link(a, ao, e, "A")
        self.link(b, bo, e, "B")
        return e

    def lerp(self, a, b, alpha, ao="", bo="", al=""):
        e = self.node(unreal.MaterialExpressionLinearInterpolate, 1)
        self.link(a, ao, e, "A")
        self.link(b, bo, e, "B")
        self.link(alpha, al, e, "Alpha")
        return e

    def sat(self, a, ao=""):
        e = self.node(unreal.MaterialExpressionSaturate, 2)
        self.link(a, ao, e, "")
        return e

    def tex(self, path, uv, kind):
        t = lib.load_asset(path)
        st = {
            "color": unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,
            "normal": unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,
            "masks": unreal.MaterialSamplerType.SAMPLERTYPE_MASKS,
            "linear": unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR,
        }[kind]
        e = self.node(
            unreal.MaterialExpressionTextureSample,
            4,
            texture=t,
            sampler_type=st,
            sampler_source=unreal.SamplerSourceMode.SSM_WRAP_WORLD_GROUP_SETTINGS,
        )
        if uv is not None:
            self.link(uv, "", e, "UVs")
        return e


def terrain_material():
    path = W.LANDSCAPE + "/M_Terrain"
    m = fresh_material(path)
    g = G(m)
    wp = g.node(unreal.MaterialExpressionWorldPosition, 6)
    wxy = g.node(unreal.MaterialExpressionComponentMask, 5, r=True, g=True, b=False, a=False)
    g.link(wp, "", wxy, "")
    # raster UVs from world position, not the mesh UV channel (the importer
    # is free to repack UV0): u = (x - minX) / size, v = (z - minZ) / size,
    # with UE X = game x and UE Y = game z (wynd_common frame)
    b = W.load_json("manifest.json")["bounds"]
    size = (b["maxX"] - b["minX"]) * W.UNIT
    shifted = g.op(
        unreal.MaterialExpressionSubtract,
        wxy,
        g.node(
            unreal.MaterialExpressionConstant2Vector, 6,
            r=b["minX"] * W.UNIT, g=b["minZ"] * W.UNIT,
        ),
    )
    uv0 = g.op(unreal.MaterialExpressionDivide, shifted, g.const(size))
    ctrl = g.tex(W.ROOT + "/Rasters/splat_control", uv0, "linear")
    cob = g.tex(W.ROOT + "/Rasters/splat_cobble", uv0, "linear")
    tint = g.tex(W.ROOT + "/Rasters/tint", uv0, "color")
    sets = []
    for name, ph, tile in LAYERS:
        uv = g.op(unreal.MaterialExpressionDivide, wxy, g.const(tile * W.UNIT))
        base = W.PH + "/Ground/%s/%s_" % (ph, ph)
        sets.append(
            {
                "name": name,
                "alb": g.tex(base + "Diffuse_2k", uv, "color"),
                "nor": g.tex(base + "nor_dx_2k", uv, "normal"),
                "arm": g.tex(base + "arm_2k", uv, "masks"),
                "hgt": g.tex(base + "Displacement_2k", uv, "masks"),
            }
        )
    # The grass layer is the game's painted turf, not the scan's colour: a
    # lush green parameter carrying the scan's luminance as detail, so the
    # vale reads green under a warm sun while keeping a real PBR surface.
    # detail = lerp(1, lum(scan) / mean lum(scan), GrassDetail)
    lum = g.node(unreal.MaterialExpressionDotProduct, 3)
    g.link(sets[0]["alb"], "RGB", lum, "A")
    g.link(
        g.node(unreal.MaterialExpressionConstant3Vector, 6, constant=unreal.LinearColor(0.2126, 0.7152, 0.0722, 1)),
        "", lum, "B",
    )
    detail = g.lerp(
        g.const(1.0),
        g.op(unreal.MaterialExpressionDivide, lum, g.const(GRASS_SCAN_LUM)),
        g.node(unreal.MaterialExpressionScalarParameter, 6, parameter_name="GrassDetail", default_value=0.6),
    )
    grass_col = g.node(
        unreal.MaterialExpressionVectorParameter, 6,
        parameter_name="GrassColor", default_value=unreal.LinearColor(*GRASS_COLOR),
    )
    sets[0]["alb"] = g.op(unreal.MaterialExpressionMultiply, grass_col, detail)
    alb, nor, arm = sets[0]["alb"], sets[0]["nor"], sets[0]["arm"]
    alb_o, nor_o, arm_o = "", "RGB", "RGB"
    contrast = g.node(unreal.MaterialExpressionScalarParameter, 6, parameter_name="EdgeContrast", default_value=5.0)
    for s, (src, chan) in zip(sets[1:], [(ctrl, "R"), (ctrl, "G"), (ctrl, "B"), (cob, "R")]):
        # alpha = saturate((w - 0.5 + (h - 0.5) * 0.6) * contrast + 0.5)
        hh = g.op(unreal.MaterialExpressionSubtract, s["hgt"], g.const(0.5), "R")
        hh = g.op(unreal.MaterialExpressionMultiply, hh, g.const(0.6))
        ww = g.op(unreal.MaterialExpressionSubtract, src, g.const(0.5), chan)
        a = g.op(unreal.MaterialExpressionAdd, ww, hh)
        a = g.op(unreal.MaterialExpressionMultiply, a, contrast)
        a = g.sat(g.op(unreal.MaterialExpressionAdd, a, g.const(0.5)))
        alb = g.lerp(alb, s["alb"], a, alb_o, "RGB")
        nor = g.lerp(nor, s["nor"], a, nor_o, "RGB")
        arm = g.lerp(arm, s["arm"], a, arm_o, "RGB")
        alb_o = nor_o = arm_o = ""
    # macro colour: the game's baked tint, normalised around a mid grey
    # divided by the vale turf's mean linear tint, so the macro term varies
    # brightness and hue around 1 instead of shifting the whole ground yellow
    ts = g.node(unreal.MaterialExpressionScalarParameter, 6, parameter_name="TintStrength", default_value=0.3)
    mean = g.node(
        unreal.MaterialExpressionConstant3Vector, 6, constant=unreal.LinearColor(*TINT_MEAN, 1.0)
    )
    tn = g.op(unreal.MaterialExpressionDivide, tint, mean, "RGB")
    macro = g.lerp(g.const(1.0), tn, ts)
    warm = g.node(
        unreal.MaterialExpressionVectorParameter,
        6,
        parameter_name="Warmth",
        default_value=unreal.LinearColor(1.0, 1.0, 0.97, 1.0),
    )
    alb = g.op(unreal.MaterialExpressionMultiply, alb, macro)
    alb = g.op(unreal.MaterialExpressionMultiply, alb, warm)
    ao = g.node(unreal.MaterialExpressionComponentMask, 1, r=True, g=False, b=False, a=False)
    g.link(arm, "", ao, "")
    rough = g.node(unreal.MaterialExpressionComponentMask, 1, r=False, g=True, b=False, a=False)
    g.link(arm, "", rough, "")
    debug = os.environ.get("WYND_TERRAIN_DEBUG")
    if debug == "splat":  # r dirt, g sand, b rock as colour
        mel.connect_material_property(ctrl, "RGB", MP.MP_BASE_COLOR)
    elif debug == "grass":  # the grass layer alone
        mel.connect_material_property(sets[0]["alb"], "", MP.MP_BASE_COLOR)
    else:
        mel.connect_material_property(alb, "", MP.MP_BASE_COLOR)
    mel.connect_material_property(nor, "", MP.MP_NORMAL)
    mel.connect_material_property(rough, "", MP.MP_ROUGHNESS)
    mel.connect_material_property(ao, "", MP.MP_AMBIENT_OCCLUSION)
    mel.connect_material_property(g.const(0.0), "", MP.MP_METALLIC)
    m.set_editor_property("used_with_nanite", True)
    mel.recompile_material(m)
    lib.save_loaded_asset(m)
    return m


def water_material():
    path = W.ROOT + "/Materials/M_Water"
    m = fresh_material(path)
    g = G(m)
    try:
        m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_SINGLE_LAYER_WATER)
    except Exception as err:  # older builds: plain glossy surface
        W.log("water shading model unavailable: %s" % err)
    col = g.node(
        unreal.MaterialExpressionVectorParameter,
        2,
        parameter_name="Color",
        default_value=unreal.LinearColor(0.02, 0.07, 0.07, 1.0),
    )
    mel.connect_material_property(col, "", MP.MP_BASE_COLOR)
    mel.connect_material_property(g.const(0.04), "", MP.MP_ROUGHNESS)
    mel.connect_material_property(g.const(0.0), "", MP.MP_METALLIC)
    try:
        out = g.node(unreal.MaterialExpressionSingleLayerWaterMaterialOutput, 0)
        scat = g.node(
            unreal.MaterialExpressionConstant3Vector,
            1,
            constant=unreal.LinearColor(0.02, 0.09, 0.08, 1.0),
        )
        absorb = g.node(
            unreal.MaterialExpressionConstant3Vector,
            1,
            constant=unreal.LinearColor(0.35, 0.09, 0.05, 1.0),
        )
        for src, names in (
            (scat, ("ScatteringCoefficients", "Scattering Coefficients")),
            (absorb, ("AbsorptionCoefficients", "Absorption Coefficients")),
        ):
            if not any(mel.connect_material_expressions(src, "", out, n) for n in names):
                W.log("water output input not found: %s" % (names,))
    except Exception as err:
        W.log("water output node unavailable: %s" % err)
    mel.recompile_material(m)
    lib.save_loaded_asset(m)
    return m
