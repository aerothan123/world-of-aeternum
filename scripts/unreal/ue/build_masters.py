# Builds the Wyndlewood master materials and imports the CC0 detail textures.
# Output: /Game/Wyndlewood/Materials/Master/M_Wynd_<Kind> and /Game/Wyndlewood/Materials/Assets/Textures/T_<Kind>_{N,R}
# Each master keeps the PAINTED base colour (BaseColorTex * BaseTint, or the vertex colour when the
# GLB has no texture), then adds: world-aligned (triplanar) CC0 detail normal + roughness, world-up
# moss (green, rough, thicker where the detail normal is deep), and edge wear (bumped edges brighten
# and get glossier). Kinds: Stone Plaster Wood Roof Metal Cloth Foliage.
import os
import unreal

CC0 = os.environ.get('WYND_CC0', r'E:\WyndlewoodUnreal\export\cc0')
TEX = '/Game/Wyndlewood/Materials/Assets/Textures'
MST = '/Game/Wyndlewood/Materials/Master'
KINDS = {
    # kind: (tile size in cm, detail normal strength, moss amount, wear amount, base roughness, metallic, moss tint rgb)
    'Stone':   (220.0, 1.0, 0.55, 0.45, 0.85, 0.0),
    'Plaster': (260.0, 0.7, 0.30, 0.35, 0.90, 0.0),
    'Wood':    (180.0, 1.0, 0.25, 0.40, 0.80, 0.0),
    'Roof':    (200.0, 1.0, 0.45, 0.20, 0.95, 0.0),
    'Metal':   (120.0, 0.8, 0.00, 0.60, 0.55, 0.85),
    'Cloth':   (60.0, 0.6, 0.00, 0.15, 0.95, 0.0),
    'Foliage': (150.0, 0.5, 0.00, 0.00, 0.85, 0.0),
}
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()


def import_tex(kind, suffix):
    name = f'T_{kind}_{suffix}'
    path = f'{TEX}/{name}'
    if not eal.does_asset_exist(path):
        t = unreal.AssetImportTask()
        t.set_editor_property('filename', os.path.join(CC0, name + '.png'))
        t.set_editor_property('destination_path', TEX)
        t.set_editor_property('destination_name', name)
        t.set_editor_property('automated', True)
        t.set_editor_property('save', False)
        tools.import_asset_tasks([t])
    tex = eal.load_asset(path)
    if tex is None:
        raise RuntimeError('texture import failed ' + name)
    if suffix == 'N':
        tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
        tex.set_editor_property('srgb', False)
    else:
        tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_MASKS)
        tex.set_editor_property('srgb', False)
    eal.save_loaded_asset(tex)
    return tex


def node(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def con(a, ap, b, bp):
    mel.connect_material_expressions(a, ap, b, bp)


def scalar(mat, name, val, x, y):
    n = node(mat, unreal.MaterialExpressionScalarParameter, x, y)
    n.set_editor_property('parameter_name', name)
    n.set_editor_property('default_value', val)
    return n


def vec(mat, name, rgba, x, y):
    n = node(mat, unreal.MaterialExpressionVectorParameter, x, y)
    n.set_editor_property('parameter_name', name)
    n.set_editor_property('default_value', unreal.LinearColor(*rgba))
    return n


def tex_param(mat, name, tex, x, y, normal=False):
    n = node(mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
    n.set_editor_property('parameter_name', name)
    n.set_editor_property('texture', tex)
    if normal:
        n.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    return n


def mul(mat, a, ap, b, bp, x, y):
    n = node(mat, unreal.MaterialExpressionMultiply, x, y)
    con(a, ap, n, 'A')
    con(b, bp, n, 'B')
    return n


def add(mat, a, ap, b, bp, x, y):
    n = node(mat, unreal.MaterialExpressionAdd, x, y)
    con(a, ap, n, 'A')
    con(b, bp, n, 'B')
    return n


def lerp(mat, a, ap, b, bp, alpha, alphap, x, y):
    n = node(mat, unreal.MaterialExpressionLinearInterpolate, x, y)
    con(a, ap, n, 'A')
    con(b, bp, n, 'B')
    con(alpha, alphap, n, 'Alpha')
    return n


def triplanar(mat, texparam_name, tex, tile, normal, y0):
    """Three samples projected on the world axes, blended by the world normal. Returns the blend node."""
    wp = node(mat, unreal.MaterialExpressionWorldPosition, -1600, y0)
    inv = node(mat, unreal.MaterialExpressionConstant, -1600, y0 + 120)
    inv.set_editor_property('r', 1.0 / tile)
    # uv sets
    uvs = []
    for k, (mask) in enumerate(((1, 0, 1, 0), (0, 1, 1, 0), (1, 1, 0, 0))):  # XZ, YZ, XY
        m = node(mat, unreal.MaterialExpressionComponentMask, -1400, y0 + k * 60)
        m.set_editor_property('r', bool(mask[0]))
        m.set_editor_property('g', bool(mask[1]))
        m.set_editor_property('b', bool(mask[2]))
        con(wp, '', m, '')
        sc = mul(mat, m, '', inv, '', -1250, y0 + k * 60)
        uvs.append(sc)
    samples = []
    for k, uv in enumerate(uvs):
        s = node(mat, unreal.MaterialExpressionTextureSampleParameter2D, -1050, y0 + k * 160)
        s.set_editor_property('parameter_name', texparam_name)
        s.set_editor_property('texture', tex)
        if normal:
            s.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        con(uv, '', s, 'UVs')
        samples.append(s)
    # world normal weights
    wn = node(mat, unreal.MaterialExpressionVertexNormalWS, -1050, y0 - 160)
    ab = node(mat, unreal.MaterialExpressionAbs, -900, y0 - 160)
    con(wn, '', ab, '')
    out = None
    chans = ('G', 'R', 'B')  # YZ face weight uses X, XZ uses Y, XY uses Z
    weights = []
    for k, ch in enumerate(('G', 'R', 'B')):
        pass
    # weights: XZ projection faces +-Y, YZ faces +-X, XY faces +-Z
    wsel = {0: (False, True, False), 1: (True, False, False), 2: (False, False, True)}
    acc = None
    for k, s in enumerate(samples):
        cm = node(mat, unreal.MaterialExpressionComponentMask, -750, y0 + k * 160)
        r, g, b = wsel[k]
        cm.set_editor_property('r', r)
        cm.set_editor_property('g', g)
        cm.set_editor_property('b', b)
        con(ab, '', cm, '')
        pw = node(mat, unreal.MaterialExpressionPower, -600, y0 + k * 160)
        con(cm, '', pw, 'Base')
        ex = node(mat, unreal.MaterialExpressionConstant, -700, y0 + k * 160 + 60)
        ex.set_editor_property('r', 4.0)
        con(ex, '', pw, 'Exponent')
        term = mul(mat, s, 'RGB' if normal else 'R', pw, '', -450, y0 + k * 160)
        acc = term if acc is None else add(mat, acc, '', term, '', -300 + k * 20, y0 + k * 160)
    # normalise by sum of weights is skipped: exponent 4 keeps the blend near unit weight
    return acc


def build(kind, cfg):
    tile, nstr, moss, wear, rough0, metal = cfg
    mpath = f'{MST}/M_Wynd_{kind}'
    if eal.does_asset_exist(mpath):
        eal.delete_asset(mpath)
    mat = tools.create_asset(f'M_Wynd_{kind}', MST, unreal.Material, unreal.MaterialFactoryNew())
    nt = import_tex(kind, 'N')
    rt = import_tex(kind, 'R')
    mt = import_tex('Moss', 'R') if kind != 'Moss' else rt
    # painted base colour
    base_tex = tex_param(mat, 'BaseColorTex', None, -1600, -700)
    tint = vec(mat, 'BaseTint', (1, 1, 1, 1), -1600, -500)
    vcol = node(mat, unreal.MaterialExpressionVertexColor, -1600, -350)
    use_vc = scalar(mat, 'UseVertexColor', 0.0, -1600, -250)
    base_tinted = mul(mat, base_tex, 'RGB', tint, 'RGB', -1300, -650)
    base_sel = lerp(mat, base_tinted, '', vcol, 'RGB', use_vc, '', -1100, -600)
    # detail normal and roughness (world aligned)
    dn = triplanar(mat, 'DetailNormal', nt, tile, True, 0)
    dr = triplanar(mat, 'DetailRough', rt, tile, False, 700)
    nflat = node(mat, unreal.MaterialExpressionConstant3Vector, -200, 0)
    nflat.set_editor_property('constant', unreal.LinearColor(0, 0, 1, 1))
    nstrength = scalar(mat, 'DetailNormalStrength', nstr, -200, 100)
    nfinal = lerp(mat, nflat, '', dn, '', nstrength, '', 0, 0)
    mel.connect_material_property(nfinal, '', unreal.MaterialProperty.MP_NORMAL)
    # bump amount from the normal XY length (0 flat .. 1 steep)
    nxy = node(mat, unreal.MaterialExpressionComponentMask, 100, 120)
    nxy.set_editor_property('r', True)
    nxy.set_editor_property('g', True)
    con(nfinal, '', nxy, '')
    ln = node(mat, unreal.MaterialExpressionDotProduct, 250, 120)
    con(nxy, '', ln, 'A')
    con(nxy, '', ln, 'B')
    # moss: world-up facing * mask noise
    wn = node(mat, unreal.MaterialExpressionVertexNormalWS, 100, 300)
    up = node(mat, unreal.MaterialExpressionComponentMask, 250, 300)
    up.set_editor_property('b', True)
    con(wn, '', up, '')
    sat = node(mat, unreal.MaterialExpressionSaturate, 400, 300)
    con(up, '', sat, '')
    mnoise = triplanar(mat, 'MossMask', mt, 300.0, False, 1400)
    mamount = scalar(mat, 'MossAmount', moss, 400, 420)
    mm = mul(mat, sat, '', mnoise, '', 550, 330)
    mm2 = mul(mat, mm, '', mamount, '', 700, 330)
    mclamp = node(mat, unreal.MaterialExpressionSaturate, 850, 330)
    con(mm2, '', mclamp, '')
    mossc = vec(mat, 'MossColor', (0.14, 0.26, 0.07, 1), 700, 450)
    # wear: bumps lighten the painted base
    wearamt = scalar(mat, 'EdgeWear', wear, 700, 600)
    wearc = vec(mat, 'WearColor', (0.55, 0.50, 0.42, 1), 700, 700)
    wmask = mul(mat, ln, '', wearamt, '', 900, 650)
    wsat = node(mat, unreal.MaterialExpressionSaturate, 1050, 650)
    con(wmask, '', wsat, '')
    b1 = lerp(mat, base_sel, '', wearc, '', wsat, '', 1100, -400)
    b2 = lerp(mat, b1, '', mossc, '', mclamp, '', 1300, -300)
    mel.connect_material_property(b2, '', unreal.MaterialProperty.MP_BASE_COLOR)
    # roughness
    rbase = scalar(mat, 'RoughnessBase', rough0, 1100, 300)
    rmix = mul(mat, dr, '', rbase, '', 1300, 300)
    rwear = lerp(mat, rmix, '', rbase, '', wsat, '', 1450, 300)
    rmoss = lerp(mat, rwear, '', rbase, '', mclamp, '', 1600, 300)
    mel.connect_material_property(rmoss, '', unreal.MaterialProperty.MP_ROUGHNESS)
    mt_c = scalar(mat, 'MetallicBase', metal, 1100, 450)
    mel.connect_material_property(mt_c, '', unreal.MaterialProperty.MP_METALLIC)
    emc = vec(mat, 'EmissiveColor', (0, 0, 0, 1), 1100, 900)
    ems = scalar(mat, 'EmissiveStrength', 1.0, 1100, 1000)
    emm = mul(mat, emc, 'RGB', ems, '', 1300, 900)
    emt = tex_param(mat, 'EmissiveTex', eal.load_asset('/Engine/EngineResources/Black'), 1100, 1100)
    emts = scalar(mat, 'EmissiveTexStrength', 0.0, 1100, 1200)
    emtm = mul(mat, emt, 'RGB', emts, '', 1300, 1100)
    emsum = add(mat, emm, '', emtm, '', 1500, 1000)
    mel.connect_material_property(emsum, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mat.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    mel.recompile_material(mat)
    eal.save_loaded_asset(mat)
    unreal.log(f'WYND master built {mpath}')
    return mat


for k, cfg in KINDS.items():
    try:
        build(k, cfg)
    except Exception as e:
        unreal.log_warning(f'WYND master FAILED {k}: {e}')
unreal.log('WYND masters done')


