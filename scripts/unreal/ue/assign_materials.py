# Replaces the Interchange-generated materials on every registry mesh with instances of the
# Wyndlewood masters. The painted base colour is kept: the imported material's base-colour texture
# (if any) goes into BaseColorTex, the GLB baseColorFactor (manifest 'matinfo') into BaseTint.
# Env: WYND_ONLY (substring filter on asset id, optional), WYND_FORCE_KIND (kind override, optional).
import json
import os
import re
import unreal

REGISTRY = os.environ.get('WYND_REGISTRY', r'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json')
MANIFEST = os.environ.get('WYND_MANIFEST', r'E:\WyndlewoodUnreal\export\asset_manifest.json')
ONLY = os.environ.get('WYND_ONLY', '')
MI_DIR = '/Game/Wyndlewood/Materials/Assets/Instances'
MASTER = '/Game/Wyndlewood/Materials/Master/M_Wynd_'
WHITE = '/Engine/EngineResources/WhiteSquareTexture'

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

RULES = [
    ('Roof', r'thatch|roof|shingle|tile'),
    ('Metal', r'iron|steel|metal|blade|glow|anvil|bell|forge|gold|silver|brass|copper|chain|lantern'),
    ('Cloth', r'cloth|banner|tent|sack|flag|rug|curtain|sail|rope|fabric|canvas|leather|fur'),
    ('Foliage', r'leaf|leaves|grass|foliage|plant|bush|vine|flower'),
    ('Stone', r'stone|rock|brick|cobble|castle|tower|wall|slate|marble|opaque'),
    ('Plaster', r'plaster|daub|lime|chalk'),
    ('Wood', r'wood|plank|timber|log|bark|crate|barrel|beam|door'),
]


# Eastbrook surface semantics (mirrors src/render/eastbrook_surface_atlas.ts) -> master kind + painted sRGB tint.
SEM = {
    'darkStoneBlocks': ('Stone', 0x4a4f55), 'mediumGrayStone': ('Stone', 0x777d80), 'lightStoneBlocks': ('Stone', 0x8d9393),
    'lightGrayStone': ('Stone', 0xa5a8a4), 'irregularDarkStone': ('Stone', 0x40454b), 'warmPlaster': ('Plaster', 0xd8d0bd),
    'verticalDarkTimber': ('Wood', 0x3a2b20), 'horizontalWarmTimber': ('Wood', 0x7a5636), 'cobaltPaintedPlanks': ('Wood', 0x2f5aa0),
    'cobaltRoofShingles': ('Roof', 0x2658b1), 'darkForgedMetal': ('Metal', 0x4a5057), 'warmGoldMetal': ('Metal', 0xc79a38),
    'cyanCrystal': ('Metal', 0x6ee0f0), 'blueCreamCanvas': ('Cloth', 0xb9b7a6), 'redCreamCanvas': ('Cloth', 0xb0604c),
    'darkBrownLeather': ('Cloth', 0x5a3b2a),
}


def srgb_lin(h):
    out = []
    for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255):
        s = c / 255.0
        out.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
    return out


def kind_for(slot, fallback):
    s = slot.lower()
    # Tidehold painted village kit: material names carry the surface class.
    for key, kind in (('painted_walls', 'Plaster'), ('painted_roof', 'Roof'), ('painted_interior', 'Wood'),
                      ('props_metal', 'Metal'), ('props_gold', 'Metal'), ('town_gold', 'Metal'), ('town_iron', 'Metal'),
                      ('painted_props', 'Wood'), ('leaves_dg', 'Foliage'), ('town_atlas', 'Stone')):
        if key in s:
            return kind
    for k, rx in RULES:
        if re.search(rx, s):
            return k
    return fallback


def import_png(path, srgb):
    name = os.path.splitext(os.path.basename(path))[0]
    dest = '/Game/Wyndlewood/Materials/Assets/Textures/Tidehold'
    if not eal.does_asset_exist(f'{dest}/{name}'):
        t = unreal.AssetImportTask()
        t.set_editor_property('filename', path)
        t.set_editor_property('destination_path', dest)
        t.set_editor_property('destination_name', name)
        t.set_editor_property('automated', True)
        t.set_editor_property('save', True)
        tools.import_asset_tasks([t])
    tex = eal.load_asset(f'{dest}/{name}')
    if tex:
        tex.set_editor_property('srgb', srgb)
        eal.save_loaded_asset(tex)
    return tex

man = {i['id']: i for i in json.load(open(MANIFEST))['items']}
reg = json.load(open(REGISTRY))
n = 0
for aid, r in reg.items():
    if ONLY and ONLY not in aid:
        continue
    mesh = eal.load_asset(r['path'].split('.')[0])
    if mesh is None:
        continue
    fallback = {'Plaster': 'Plaster', 'Stone': 'Stone', 'Wood': 'Wood', 'Roof': 'Roof', 'Metal': 'Metal', 'Cloth': 'Cloth'}.get(r.get('mat'), 'Wood')
    info = man.get(aid, {}).get('matinfo', {})
    SIDE = {re.sub(r'[^A-Za-z0-9]', '_', k): v for k, v in info.items() if v.get('base') or v.get('emis')}
    for i in range(len(mesh.static_materials)):
        old = mesh.get_material(i)
        sname = str(mesh.static_materials[i].material_slot_name)
        base = old.get_name() if old else sname
        if base.startswith('M_Wynd') or (old and 'Instances' in old.get_path_name()):
            continue
        sem = None
        for key in (base, sname):
            if '__' in key and key.split('__')[-1] in SEM:
                sem = key.split('__')[-1]
        kind = os.environ.get('WYND_FORCE_KIND') or (SEM[sem][0] if sem else kind_for(base + ' ' + sname, fallback))
        emissive = 'emissive' in (base + sname).lower() or 'town_glow' in (base + sname).lower()
        parent = eal.load_asset(MASTER + kind)
        name = f'MI_{mesh.get_name()}_{i}'
        path = f'{MI_DIR}/{name}'
        mi = eal.load_asset(path) if eal.does_asset_exist(path) else tools.create_asset(name, MI_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mel.set_material_instance_parent(mi, parent)
        tex = None
        try:
            used = mel.get_used_textures(old) if old else []
            tex = used[0] if used else None
        except Exception:
            tex = None
        side = SIDE.get(re.sub(r'[^A-Za-z0-9]', '_', base), SIDE.get(re.sub(r'[^A-Za-z0-9]', '_', sname), {})) if SIDE else {}
        if side.get('base'):
            tex = import_png(side['base'], True)
        if side.get('emis'):
            mel.set_material_instance_texture_parameter_value(mi, 'EmissiveTex', import_png(side['emis'], True))
            mel.set_material_instance_scalar_parameter_value(mi, 'EmissiveTexStrength', 1.0)
        mel.set_material_instance_texture_parameter_value(mi, 'BaseColorTex', tex or eal.load_asset(WHITE))
        if side.get('base'):
            mel.set_material_instance_vector_parameter_value(mi, 'BaseTint', unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
        col = (info.get(base) or info.get(sname) or {}).get('color')
        if sem:
            lin = srgb_lin(SEM[sem][1])
            mel.set_material_instance_vector_parameter_value(mi, 'BaseTint', unreal.LinearColor(lin[0], lin[1], lin[2], 1.0))
            col = None
        elif emissive:
            # glowing window panes: amber emissive, no stone detail wanted
            mel.set_material_instance_vector_parameter_value(mi, 'BaseTint', unreal.LinearColor(1.0, 0.45, 0.08, 1.0))
            mel.set_material_instance_vector_parameter_value(mi, 'EmissiveColor', unreal.LinearColor(1.0, 0.36, 0.05, 1.0))
            mel.set_material_instance_scalar_parameter_value(mi, 'EmissiveStrength', 2.5)
            mel.set_material_instance_scalar_parameter_value(mi, 'MossAmount', 0.0)
            mel.set_material_instance_scalar_parameter_value(mi, 'EdgeWear', 0.0)
            col = None
        if col:
            mel.set_material_instance_vector_parameter_value(mi, 'BaseTint', unreal.LinearColor(col[0], col[1], col[2], 1.0))
        elif tex is None:
            mel.set_material_instance_vector_parameter_value(mi, 'BaseTint', unreal.LinearColor(0.5, 0.5, 0.5, 1.0))
        mel.update_material_instance(mi)
        eal.save_loaded_asset(mi)
        mesh.set_material(i, mi)
        n += 1
    eal.save_loaded_asset(mesh)
    unreal.log(f'WYND materials {aid}')
unreal.log(f'WYND assign done slots={n}')


