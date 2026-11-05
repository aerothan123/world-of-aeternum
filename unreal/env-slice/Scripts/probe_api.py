# Writes which editor Python APIs this engine build exposes for the slice
# build (landscape import, glTF import, PCG, water, movie render queue).
import json
import os

import unreal

OUT = os.environ.get("WYND_PROBE_OUT", r"E:\WyndlewoodUnreal\probe_api.json")

names = [
    "LandscapeEditorSubsystem", "LandscapeProxy", "Landscape", "LandscapeImportLayerInfo",
    "LandscapeLayerInfoObject", "LandscapeEditorLibrary", "EditorLandscapeLibrary",
    "InterchangeManager", "InterchangeGenericAssetsPipeline", "AssetImportTask",
    "PCGComponent", "PCGVolume", "WaterBodyRiver", "WaterBodyLake", "WaterBodyOcean",
    "MoviePipelineQueueSubsystem", "MoviePipelinePIEExecutor", "MoviePipelineDeferredPassBase",
    "MoviePipelineImageSequenceOutput_PNG", "AutomationLibrary", "SceneCapture2D",
    "LevelEditorSubsystem", "EditorActorSubsystem", "VolumetricCloud", "SkyAtmosphere",
    "ExponentialHeightFog", "PostProcessVolume", "DirectionalLight", "SkyLight",
    "HierarchicalInstancedStaticMeshComponent", "InstancedFoliageActor",
    "FoliageType_InstancedStaticMesh", "MaterialEditingLibrary", "MaterialInstanceConstant",
    "Texture2D", "RenderingLibrary",
]
out = {"engine": unreal.SystemLibrary.get_engine_version(), "present": {}, "methods": {}}
for n in names:
    out["present"][n] = getattr(unreal, n, None) is not None
for n in ["LandscapeProxy", "Landscape", "LandscapeEditorSubsystem", "EditorLandscapeLibrary",
          "LandscapeEditorLibrary", "AutomationLibrary", "InterchangeManager"]:
    cls = getattr(unreal, n, None)
    if cls is not None:
        out["methods"][n] = [m for m in dir(cls) if not m.startswith("_")][:400]
out["landscape_like"] = [n for n in dir(unreal) if "andscape" in n][:200]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
unreal.log("probe_api wrote " + OUT)
