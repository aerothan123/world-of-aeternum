"""Review sheets for a rigged creature: a turntable and per-clip frame strips.

Reads the .blend quadruped_rig.py saves (--blend), so it sees the rig, the skin and
every clip exactly as they were baked, and renders with EEVEE under a soft key and
fill on a neutral floor:

  * <out>_turntable.png: the Idle's first frame from eight angles around the body;
  * <out>_<clip>.png: one row of evenly spaced frames per clip (side view), so a
    foot through the floor, a T-pose pop or a broken limb shows at a glance.

  blender --background <creature.blend> --python review_render.py -- <out prefix> \
      [--clips Run,Attack,Death] [--frames 6] [--size 384]
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


CLIPS = opt('--clips', 'Idle,Walk,Run,Attack,Hit,Death').split(',')
FRAMES = int(opt('--frames', '6'))
SIZE = int(opt('--size', '384'))

scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH')
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('review') if not scene.world else scene.world
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (0.62, 0.66, 0.72, 1.0)
bg.inputs[1].default_value = 0.55

# Frame the body by its rest bounds.
pts = [body.matrix_world @ Vector(c) for c in body.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
centre = (lo + hi) / 2
radius = max((hi - lo).length / 2, 0.05)

floor_mesh = bpy.data.meshes.new('floor')
s = radius * 40
floor_mesh.from_pydata([(-s, -s, lo.z), (s, -s, lo.z), (s, s, lo.z), (-s, s, lo.z)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new('floor', floor_mesh)
mat = bpy.data.materials.new('floor')
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.45, 0.38, 1)
floor_mesh.materials.append(mat)
scene.collection.objects.link(floor)

for name, energy, rot in (('key', 3.2, (math.radians(50), 0, math.radians(35))),
                          ('fill', 1.1, (math.radians(65), 0, math.radians(-140)))):
    light = bpy.data.lights.new(name, 'SUN')
    light.energy = energy
    light.angle = math.radians(8)
    obj = bpy.data.objects.new(name, light)
    obj.rotation_euler = rot
    scene.collection.objects.link(obj)

cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 50
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def aim(azimuth_deg, elev_deg=14, dist_mul=2.5):
    az, el = math.radians(azimuth_deg), math.radians(elev_deg)
    d = radius * dist_mul
    cam.location = centre + Vector((d * math.cos(el) * math.cos(az), d * math.cos(el) * math.sin(az),
                                    d * math.sin(el)))
    direction = centre - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def render_to_array():
    path = os.path.join(bpy.app.tempdir, 'review_tmp.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
    bpy.data.images.remove(img)
    return arr


def save_row(tiles, path):
    sheet = np.concatenate(tiles, axis=1)
    h, w = sheet.shape[:2]
    out = bpy.data.images.new('sheet', w, h, alpha=False)
    out.pixels = sheet.ravel().tolist()
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    print('SHEET', path)


def use_clip(name):
    action = bpy.data.actions.get(name)
    if action is None:
        return None
    arm.animation_data.action = action
    return action


# The body faces +X; the game's yaw turns it, so the side view is from -Y.
if use_clip('Idle'):
    scene.frame_set(1)
tiles = []
for k in range(8):
    aim(-90 + 45 * k)
    tiles.append(render_to_array())
save_row(tiles, OUT + '_turntable.png')

for clip in CLIPS:
    action = use_clip(clip)
    if action is None:
        print('NO CLIP', clip)
        continue
    first, last = (int(v) for v in action.frame_range)
    aim(-70)
    tiles = []
    for k in range(FRAMES):
        scene.frame_set(round(first + (last - first) * k / max(FRAMES - 1, 1)))
        tiles.append(render_to_array())
    save_row(tiles, '%s_%s.png' % (OUT, clip.lower()))
