# Read-only: why M_Terrain (and M_Cover) log "Failed to compile Material".
# Loads each, forces a recompile, logs shader statistics and the static
# switch state, and lists any compile-error API the editor library offers.
# Run headless: UnrealEditor-Cmd ... -run=pythonscript -script=<this file>
import unreal

lib = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary


def log(msg):
    unreal.log_warning("[wynd] probe " + msg)


log("mel error/compile api: %s" % [n for n in dir(mel) if "rror" in n or "ompil" in n])
for path in ("/Game/Wyndlewood/Materials/Landscape/M_Terrain",
             "/Game/Wyndlewood/World/Placeholders/Materials/M_Cover"):
    m = lib.load_asset(path)
    if not m:
        log("%s missing" % path)
        continue
    log("%s nanite=%s domain=%s" % (path, m.get_editor_property("used_with_nanite"),
                                   m.get_editor_property("material_domain")))
    mel.recompile_material(m)
    try:
        s = mel.get_statistics(m)
        log("%s stats vs=%s ps=%s samplers=%s" % (
            path, s.num_vertex_shader_instructions, s.num_pixel_shader_instructions, s.num_samplers))
    except Exception as err:
        log("%s statistics failed: %s" % (path, err))
    for fn in ("get_material_compile_errors", "get_compile_errors"):
        f = getattr(mel, fn, None) or getattr(m, fn, None)
        if f:
            try:
                log("%s %s: %s" % (path, fn, f(m) if f is getattr(mel, fn, None) else f()))
            except Exception as err:
                log("%s %s raised %s" % (path, fn, err))
    n = 0
    for e in (mel.get_material_expressions(m) if hasattr(mel, "get_material_expressions") else []):
        cls = e.get_class().get_name()
        if "StaticSwitch" in cls or "VertexColor" in cls:
            n += 1
            ins = [i.get_name() if i else None for i in mel.get_inputs_for_material_expression(m, e)]
            log("%s expr %s inputs=%s" % (path, cls, ins))
    log("%s switch/vcol nodes %d" % (path, n))
log("done")
