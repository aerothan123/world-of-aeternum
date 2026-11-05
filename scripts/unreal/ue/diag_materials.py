# Read-only diagnostic: dump slot names, instance parents and parameter values for one registry asset.
import json
import os
import unreal

ID = os.environ.get('WYND_DIAG_ID', 'tidehold/bank')
reg = json.load(open(r'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json'))
eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
mesh = eal.load_asset(reg[ID]['path'].split('.')[0])
try:
    unreal.log(f'DIAG uv_channels lod0={unreal.EditorStaticMeshLibrary.get_num_uv_channels(mesh, 0)}')
except Exception as e:
    unreal.log(f'DIAG uv_channels err {e}')
for i in range(len(mesh.static_materials)):
    m = mesh.get_material(i)
    slot = str(mesh.static_materials[i].material_slot_name)
    if isinstance(m, unreal.MaterialInstanceConstant):
        parent = m.get_editor_property('parent')
        tex = mel.get_material_instance_texture_parameter_value(m, 'BaseColorTex')
        emi = mel.get_material_instance_texture_parameter_value(m, 'EmissiveTex')
        tint = mel.get_material_instance_vector_parameter_value(m, 'BaseTint')
        ets = mel.get_material_instance_scalar_parameter_value(m, 'EmissiveTexStrength')
        unreal.log(f'DIAG slot{i} {slot} mi={m.get_name()} parent={parent.get_name() if parent else None} '
                   f'base={tex.get_name() if tex else None} srgb={tex.get_editor_property("srgb") if tex else None} '
                   f'emis={emi.get_name() if emi else None} emisStr={ets} tint=({tint.r:.2f},{tint.g:.2f},{tint.b:.2f})')
    else:
        unreal.log(f'DIAG slot{i} {slot} NOT-MI {m.get_name() if m else None}')
