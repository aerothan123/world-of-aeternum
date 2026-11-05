"""Measure a raw four-legged Tripo body and write a first bone spec for quadruped_rig.py.

The hoard rigger (scripts/assets/hoard_mobs/quadruped_rig.py) places its skeleton
from a hand-written spec. Writing one by eye for every wildlife body is slow and
error prone, so this script reads the body itself and proposes the spec:

  * the four legs are the four columns of vertices near the floor, split front and
    back along the body's long axis and left and right across it; each leg's foot
    is its column's floor point and its top is the middle of the trunk above it;
  * Hips and Chest sit over the hind and fore legs, Spine between them, at the
    middle of the trunk there;
  * the head runs from the chest toward the snout tip (the far +X end), with an
    optional Neck between, and an optional Jaw under the head's front half;
  * the tail runs from behind the hips to the far -X end, cut into three bones;
  * every radius comes from the trunk's own thickness at that bone.

It also draws a side and a top silhouette with the proposed bones over it, so the
spec can be judged (and hand-tuned) before a single clip is baked. The spec is a
proposal: read the overlay, then fix what the body needs.

  blender --background --python measure_quadruped.py -- <raw.glb> <out spec.json> \
      --name Name --key key [--rotate-z deg] [--auto-align] [--neck] [--jaw] \
      [--png <overlay prefix>]

The body must face +X after --rotate-z (the rigger's convention); --auto-align
turns a slanted body square and head-forward on its own. The final turn is written
into the spec's rotateZ so the rigger turns the mesh the same way.
"""
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]


def opt(name, default=None):
    return args[args.index(name) + 1] if name in args else default


NAME = opt('--name', 'Creature')
KEY = opt('--key', 'creature')
ROT = float(opt('--rotate-z', '0'))
PNG = opt('--png')
WANT_NECK = '--neck' in args
WANT_JAW = '--jaw' in args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
mesh_obj = next(o for o in scene.objects if o.type == 'MESH')
world = mesh_obj.matrix_world.copy()
pts = [world @ v.co for v in mesh_obj.data.vertices]
if ROT:
    rz = Matrix.Rotation(math.radians(ROT), 4, 'Z')
    pts = [rz @ p for p in pts]


def turn_pts(degrees):
    rz = Matrix.Rotation(math.radians(degrees), 4, 'Z')
    return [rz @ p for p in pts]


if '--auto-align' in args:
    # A body generated from a three-quarter concept lies at a slant: turn its long
    # axis (the principal axis of its footprint) onto X, then keep the head at +X:
    # the wider end seen from above (a skull with ears, cheeks or tusks against a
    # tail). Height is no guide: a boar's rump stands over its snout. --flip-head
    # overrides a body this reads wrong.
    mx = sum(p.x for p in pts) / len(pts)
    my = sum(p.y for p in pts) / len(pts)
    sxx = sum((p.x - mx) ** 2 for p in pts)
    syy = sum((p.y - my) ** 2 for p in pts)
    sxy = sum((p.x - mx) * (p.y - my) for p in pts)
    slant = math.degrees(0.5 * math.atan2(2 * sxy, sxx - syy))
    pts = turn_pts(-slant)
    ROT -= slant
    lo, hi = min(p.x for p in pts), max(p.x for p in pts)
    span = hi - lo
    front_w = max(abs(p.y) for p in pts if p.x >= hi - 0.18 * span)
    back_w = max(abs(p.y) for p in pts if p.x <= lo + 0.18 * span)
    if (back_w > front_w) != ('--flip-head' in args):
        pts = turn_pts(180)
        ROT += 180
    ROT = round(((ROT + 180) % 360) - 180, 2)
    print('AUTO-ALIGN slant %.2f deg, rotateZ %.2f' % (slant, ROT))

xs = [p.x for p in pts]
zs = [p.z for p in pts]
x0, x1 = min(xs), max(xs)
z0, z1 = min(zs), max(zs)
L, H = x1 - x0, z1 - z0
print('BOUNDS x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f  (L %.3f H %.3f)' % (
    x0, x1, min(p.y for p in pts), max(p.y for p in pts), z0, z1, L, H))


def r3(v):
    return [round(v[0], 3), round(v[1], 3), round(v[2], 3)]


def mean(vals):
    return sum(vals) / len(vals)


def section(xc, half=None, band=None):
    """The vertices within +-half (default 4% of L) of x = xc, optionally |y| <= band."""
    half = half or 0.04 * L
    sel = [p for p in pts if abs(p.x - xc) <= half]
    if band is not None:
        sel = [p for p in sel if abs(p.y) <= band]
    return sel


# ---------------------------------------------------------------- legs
# The floor band: everything in the lowest 15% of the height is leg (paws, shins).
floor_band = [p for p in pts if p.z <= z0 + 0.15 * H]
mid_x = sorted(p.x for p in floor_band)[len(floor_band) // 2]
legs = {}
for kind, test in (('fore', lambda p: p.x >= mid_x), ('hind', lambda p: p.x < mid_x)):
    for side, sgn in (('L', 1), ('R', -1)):
        col = [p for p in floor_band if test(p) and p.y * sgn > 0]
        if not col:
            raise SystemExit('no %s %s leg column found: check --rotate-z' % (kind, side))
        legs[(kind, side)] = (mean([p.x for p in col]), mean([p.y for p in col]))
        print('LEG %s %s x %.3f y %.3f (%d verts)' % (kind, side, *legs[(kind, side)], len(col)))

fore_x = mean([legs[('fore', 'L')][0], legs[('fore', 'R')][0]])
hind_x = mean([legs[('hind', 'L')][0], legs[('hind', 'R')][0]])
fore_y = mean([abs(legs[('fore', 'L')][1]), abs(legs[('fore', 'R')][1])])
hind_y = mean([abs(legs[('hind', 'L')][1]), abs(legs[('hind', 'R')][1])])


def body_span(xc):
    """(bottom, top, half width) of the TRUNK at x = xc: the centre line, above the legs."""
    sec = section(xc)
    top = max(p.z for p in sec)
    centre = [p for p in sec if abs(p.y) <= 0.5 * max(fore_y, hind_y) and p.z > z0 + 0.25 * H]
    bottom = min(p.z for p in centre) if centre else z0 + 0.45 * H
    half_y = max(abs(p.y) for p in sec if p.z > bottom)
    return bottom, top, half_y


hb, ht, hy = body_span(hind_x)
cb, ct, cy = body_span(fore_x)
hip_z = 0.5 * (hb + ht)
chest_z = 0.5 * (cb + ct)
hips_r = 0.5 * min(ht - hb, 2 * hy)
chest_r = 0.5 * min(ct - cb, 2 * cy)
print('TRUNK hind x %.3f z %.3f..%.3f | fore x %.3f z %.3f..%.3f' % (hind_x, hb, ht, fore_x, cb, ct))

# ---------------------------------------------------------------- head, tail
front = [p for p in pts if p.x >= x1 - 0.04 * L]
nose = Vector((x1, 0.0, mean([p.z for p in front])))
back = [p for p in pts if p.x <= x0 + 0.04 * L]
tail_tip = Vector((x0, 0.0, mean([p.z for p in back])))
skull_x = fore_x + 0.45 * (x1 - fore_x)
hsec = section(skull_x)
skull_z = 0.5 * (min(p.z for p in hsec) + max(p.z for p in hsec))
head_r = 0.5 * (max(p.z for p in hsec) - min(p.z for p in hsec))
neck_base = Vector((fore_x + 0.2 * (x1 - fore_x), 0.0, 0.5 * (chest_z + skull_z)))
tail_root = Vector((hind_x - 0.08 * L, 0.0, hip_z + 0.3 * (ht - hip_z)))

bones = []


def add(name, parent, head, tail, radius):
    bones.append([name, parent, r3(head), r3(tail), round(max(radius, 0.01), 3)])


ground = z0
add('Root', None, (hind_x, 0, ground), (hind_x + 0.1 * L, 0, ground), 0.0)
add('Hips', 'Root', (hind_x - 0.06 * L, 0, hip_z), (hind_x + 0.12 * L, 0, hip_z), hips_r)
spine_x = 0.5 * (hind_x + fore_x)
spine_z = 0.5 * (hip_z + chest_z)
add('Spine', 'Hips', (hind_x + 0.12 * L, 0, hip_z), (spine_x + 0.08 * L, 0, spine_z),
    0.5 * (hips_r + chest_r))
add('Chest', 'Spine', (spine_x + 0.08 * L, 0, spine_z), (fore_x + 0.04 * L, 0, chest_z), chest_r)
chest_end = (fore_x + 0.04 * L, 0, chest_z)
if WANT_NECK:
    add('Neck', 'Chest', chest_end, neck_base, 0.8 * chest_r)
    add('Head', 'Neck', neck_base, nose, head_r)
else:
    add('Head', 'Chest', chest_end, nose, head_r)
if WANT_JAW:
    jz = skull_z - 0.5 * head_r
    add('Jaw', 'Head', (skull_x, 0, jz), (x1 - 0.02 * L, 0, jz - 0.1 * head_r), 0.35 * head_r)
t1 = tail_root.lerp(tail_tip, 1 / 3)
t2 = tail_root.lerp(tail_tip, 2 / 3)
tail_r = 0.3 * hips_r
add('Tail1', 'Hips', tail_root, t1, tail_r)
add('Tail2', 'Tail1', t1, t2, 0.8 * tail_r)
add('Tail3', 'Tail2', t2, tail_tip, 0.6 * tail_r)


def leg_chain(kind, side, top_z, foot, radius):
    """One leg on its own side: a body standing in a stride (one hind foot forward)
    has its two legs at different x, so the sides are measured, never mirrored."""
    a, b, c = (('ForeUpper', 'ForeLower', 'ForeFoot') if kind == 'fore'
               else ('HindThigh', 'HindShin', 'HindFoot'))
    parent = 'Chest' if kind == 'fore' else 'Hips'
    trunk_x = fore_x if kind == 'fore' else hind_x
    fx, fy = foot
    # The leg's top sits over the trunk joint, slightly toward its own foot.
    top = Vector((0.5 * (trunk_x + fx), 0.8 * fy, top_z))
    ankle = Vector((fx, fy, ground + 0.14 * (top_z - ground)))
    # A hind leg's hock sits behind the line and a foreleg's elbow over it.
    knee = top.lerp(ankle, 0.5) + Vector((-0.04 * L if kind == 'hind' else 0.01 * L, 0, 0))
    toe = Vector((fx + 0.03 * L, fy, ground))
    s = '.' + side
    add(a + s, parent, top, knee, radius)
    add(b + s, a + s, knee, ankle, 0.75 * radius)
    add(c + s, b + s, ankle, toe, 0.65 * radius)


leg_r = 0.35 * min(hips_r, chest_r)
for side in ('L', 'R'):
    leg_chain('hind', side, hb + 0.35 * (hip_z - hb), legs[('hind', side)], leg_r)
    leg_chain('fore', side, cb + 0.35 * (chest_z - cb), legs[('fore', side)], leg_r)

spec = {
    'name': NAME,
    'key': KEY,
    'rotateZ': ROT,
    'measured': {'length': round(L, 3), 'height': round(H, 3), 'ground': round(ground, 3)},
    'motion': {
        'chestUp': 0,
        'headUp': 0,
        'walkStride': 20,
        'runStride': 30,
        'bob': round(0.012 * H, 4),
        'deathDrop': round(0.45 * (hip_z - ground), 3),
        'deathRoll': 80,
    },
    'bones': bones,
}
with open(OUT, 'w', encoding='utf-8') as handle:
    json.dump(spec, handle, indent=2)
print('WROTE', OUT)


def overlay(path, axis_u, axis_v, size=768):
    """A point-splat silhouette with the proposed bones drawn over it (no PIL needed)."""
    us = [getattr(p, axis_u) for p in pts]
    vs = [getattr(p, axis_v) for p in pts]
    span = max(max(us) - min(us), max(vs) - min(vs)) * 1.1
    cu, cv = 0.5 * (min(us) + max(us)), 0.5 * (min(vs) + max(vs))
    px = [0.12, 0.13, 0.16, 1.0] * (size * size)

    def put(u, v, col, rad=0):
        x = int((u - cu) / span * size + size / 2)
        y = int((v - cv) / span * size + size / 2)
        for dx in range(-rad, rad + 1):
            for dy in range(-rad, rad + 1):
                xx, yy = x + dx, y + dy
                if 0 <= xx < size and 0 <= yy < size:
                    i = (yy * size + xx) * 4
                    px[i:i + 4] = col

    for p in pts[::2]:
        put(getattr(p, axis_u), getattr(p, axis_v), [0.5, 0.5, 0.55, 1.0])
    for name, _, head, tail, _r in bones:
        mirrored = [(head, tail)]
        if name.endswith('.*'):
            mirrored.append(((head[0], -head[1], head[2]), (tail[0], -tail[1], tail[2])))
        for h, t in mirrored:
            hv, tv = Vector(h), Vector(t)
            col = [0.2, 0.9, 1.0, 1.0] if name.endswith('.*') else [1.0, 0.75, 0.1, 1.0]
            for k in range(48):
                q = hv.lerp(tv, k / 47)
                put(getattr(q, axis_u), getattr(q, axis_v), col, 1)
            put(getattr(hv, axis_u), getattr(hv, axis_v), [1.0, 0.2, 0.2, 1.0], 3)
    img = bpy.data.images.new('overlay', size, size, alpha=False)
    img.pixels = px
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    print('OVERLAY', path)


if PNG:
    overlay(PNG + '_side.png', 'x', 'z')
    overlay(PNG + '_top.png', 'x', 'y')
