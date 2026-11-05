# Read-only: export one converted building's base colour texture to a PNG
# under the out folder so its content can be checked by eye, and report
# the source file its import data points at.
import os

import unreal

path = "/Game/Wyndlewood/Assets/Buildings/SM_tidehold_bank/Textures/T_SM_tidehold_bank_painted_walls_bank_base"
lib = unreal.EditorAssetLibrary
t = lib.load_asset(path)
if not t:
    for p in lib.list_assets("/Game/Wyndlewood", True, False):
        if p.endswith("T_SM_tidehold_bank_painted_walls_bank_base") or ".T_SM_tidehold_bank_painted_walls_bank_base" in p:
            t = lib.load_asset(p)
            break
unreal.log_warning("[wynd] probe texture %s" % (t.get_path_name() if t else None))
if t:
    try:
        src = t.get_editor_property("asset_import_data").get_first_filename()
        unreal.log_warning("[wynd] probe source %s" % src)
    except Exception as err:
        unreal.log_warning("[wynd] probe source unavailable %s" % err)
    out = r"E:\WyndlewoodUnreal\out\test\walls_base_export.png"
    task = unreal.AssetExportTask()
    task.object = t
    task.filename = out
    task.automated = True
    task.prompt = False
    task.replace_identical = True
    task.exporter = unreal.TextureExporterPNG()
    ok = unreal.Exporter.run_asset_export_task(task)
    unreal.log_warning("[wynd] probe export %s %s" % (ok, os.path.exists(out)))
