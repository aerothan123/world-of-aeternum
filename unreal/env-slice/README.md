# Unreal environment slice (Eastbrook Vale)

A look-development test: the same Eastbrook and Eastbrook Vale slice the
game draws, rebuilt in Unreal Engine 5.8 from the engine-neutral export
(`scripts/world_export/`). Text sources only; the project itself lives on
`E:\WyndlewoodUnreal\EnvSlice` (copy this folder there; Content, Saved,
Intermediate and DerivedDataCache stay out of git).

1. Export: `node scripts/world_export/export_slice.mjs E:\WyndlewoodUnreal\export\eastbrook_vale`
2. Third-party CC0 files: `ThirdParty/fetch_polyhaven.ps1` (see `THIRD_PARTY_ASSETS.md`).
3. Import: `UnrealEditor-Cmd.exe EnvSlice.uproject -run=pythonscript -script=Scripts/import_assets.py`
4. Build and shoot: `UnrealEditor.exe EnvSlice.uproject -ExecutePythonScript=Scripts/run_slice.py`
   (writes `E:\WyndlewoodUnreal\out\unreal_<shot>.png` and `shots.json`).

Frame: `Scripts/wynd_common.py` header. The terrain is the exported glTF tile
grid as Nanite meshes rather than a Landscape actor, because this engine
build's Python API cannot create a Landscape from a heightmap (only re-import
into one that exists).
