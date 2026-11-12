# src/render/hollow_crypt/ (shared survivors only)

The Hollow Crypt dungeon was retired on 2026-11-11 and its renderer went with it.
Two shared helpers that other dungeons import still live here:

- `crypt_fx_particles.ts`: the pooled particle and flame shader kit every dungeon
  FX painter builds on (with `GHOST_FIRE_RAMP` / `ghostFireRampGlsl`).
- `crypt_gate_state_core.ts`: the gate open/close state and `gateOpenness` easing
  every dungeon's gate renderer reads.

Do not add new Hollow Crypt code here. Moving these two into a neutrally named
directory is a follow-up rename (it touches every dungeon FX import).
