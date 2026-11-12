# Shared creature kits (born in the retired Hollow Crypt)

The Hollow Crypt dungeon was retired on 2026-11-11 and its creature builders,
specs and GLBs went with it. Two shared Blender helpers stay here because live
builders import them by this path:

- `creature_kit.py`: chunky rigid-skinned bodies, the rig and clip authoring
  (`sunken_bastion_creatures/build_creature.py` and `sea_kit.py` build on it).
- `organic_kit.py`: smooth organic hero bodies on top of the creature kit
  (`sunken_bastion_creatures/reaper.py`, `turnkey.py` and `gaol_props.py`).

Do not add new Hollow Crypt builders here. Moving the two kits into a neutrally
named folder is fine once every `sys.path.insert` that points here moves with
them.
