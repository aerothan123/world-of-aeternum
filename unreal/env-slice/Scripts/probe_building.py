# Reports what a converted building mesh carries: UV channels per LOD and
# each slot's material, its parent and its texture parameters. Read only.
import unreal

lib = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
path = "/Game/Wyndlewood/Assets/Buildings/SM_tidehold_bank/StaticMeshes/SM_tidehold_bank"
m = lib.load_asset(path)
out = ["mesh %s" % (m.get_path_name() if m else None)]
if m:
    # get_num_uv_channels reads 0 in a commandlet even for engine meshes, so
    # sample UVs from the LOD0 mesh description instead
    md = m.get_static_mesh_description(0)
    n = md.get_vertex_instance_count()
    uvs = [md.get_vertex_instance_uv(unreal.VertexInstanceID(i), 0) for i in range(0, n, max(1, n // 4))][:4]
    out.append(
        "lod0 vertex instances %d, uv0 samples %s, nanite %s"
        % (n, [(round(u.x, 3), round(u.y, 3)) for u in uvs], m.get_editor_property("nanite_settings").enabled)
    )
    for s in m.get_editor_property("static_materials"):
        mi = s.get_editor_property("material_interface")
        line = "slot %s -> %s" % (s.get_editor_property("material_slot_name"), mi.get_path_name() if mi else None)
        if isinstance(mi, unreal.MaterialInstance):
            parent = mi.get_editor_property("parent")
            line += " parent=%s" % (parent.get_path_name() if parent else None)
            for n in mel.get_texture_parameter_names(mi):
                t = mel.get_material_instance_texture_parameter_value(mi, n)
                line += " | %s=%s" % (n, t.get_name() if t else None)
        out.append(line)
for line in out:
    unreal.log_warning("[wynd] probe " + line)
