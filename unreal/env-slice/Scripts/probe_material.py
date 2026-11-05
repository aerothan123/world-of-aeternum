# Read-only look at one converted building material: the instance's scalar
# and vector parameters, its base colour texture's size and settings, and
# the parent master's expressions that sample textures (with their UV
# coordinate index), to see why the baked colour does not show.
import unreal

lib = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
out = []
mi = lib.load_asset("/Game/Wyndlewood/Materials/Assets/Instances/MI_SM_tidehold_bank_1")
out.append("mi %s parent %s" % (mi.get_name(), mi.get_editor_property("parent").get_path_name()))
for n in mel.get_scalar_parameter_names(mi):
    out.append("scalar %s=%s" % (n, mel.get_material_instance_scalar_parameter_value(mi, n)))
for n in mel.get_vector_parameter_names(mi):
    out.append("vector %s=%s" % (n, mel.get_material_instance_vector_parameter_value(mi, n)))
for n in mel.get_static_switch_parameter_names(mi):
    out.append("switch %s=%s" % (n, mel.get_material_instance_static_switch_parameter_value(mi, n)))
t = mel.get_material_instance_texture_parameter_value(mi, "BaseColorTex")
if t:
    out.append(
        "tex %s %dx%d srgb=%s comp=%s"
        % (t.get_name(), t.blueprint_get_size_x(), t.blueprint_get_size_y(), t.get_editor_property("srgb"),
           t.get_editor_property("compression_settings"))
    )
master = mi.get_base_material()
out.append("master %s" % master.get_path_name())
for cls in (unreal.MaterialExpressionTextureSampleParameter2D, unreal.MaterialExpressionTextureCoordinate):
    pass
try:
    exprs = mel.get_material_expressions(master) if hasattr(mel, "get_material_expressions") else []
except Exception as err:
    exprs = []
    out.append("expressions unavailable: %s" % err)
for e in exprs:
    name = e.get_class().get_name()
    if "Texture" in name or "Coordinate" in name or "Lerp" in name:
        extra = ""
        for k in ("parameter_name", "coordinate_index", "const_coordinate", "u_tiling", "v_tiling"):
            try:
                extra += " %s=%s" % (k, e.get_editor_property(k))
            except Exception:
                pass
        ins = [i.get_name() for i in mel.get_inputs_for_material_expression(master, e) if i] if hasattr(mel, "get_inputs_for_material_expression") else []
        out.append("expr %s%s inputs=%s" % (name, extra, ins))
for line in out:
    unreal.log_warning("[wynd] probe " + line)
