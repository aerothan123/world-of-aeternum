# Builds the Eastbrook Vale slice in the open editor world from the export:
# terrain tiles, placed props and buildings, scatter trees and rocks, dense
# grass and wildflowers from the exported density rasters, water, and the
# sky, sun, fog, cloud and post-process stack. Everything is spawned into
# the current level; the render driver calls build() then shoots.
import array
import os
import random

import unreal

import wynd_common as W
import wynd_materials as WM

lib = unreal.EditorAssetLibrary
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


class Raster:
    """Bilinear reader over one of the export's row-major rasters."""

    def __init__(self, manifest, name, typecode, scale=1.0, offset=0.0, export=None):
        self.res = manifest["res"]
        self.b = manifest["bounds"]
        self.step = manifest["step"]
        self.a = array.array(typecode)
        with open(os.path.join(export or W.EXPORT, name), "rb") as f:
            self.a.frombytes(f.read())
        self.scale = scale
        self.offset = offset

    def at(self, x, z):
        fx = min(max((x - self.b["minX"]) / self.step, 0), self.res - 1.001)
        fz = min(max((z - self.b["minZ"]) / self.step, 0), self.res - 1.001)
        i, j = int(fx), int(fz)
        tx, tz = fx - i, fz - j
        r = self.res
        a = self.a
        v = (a[j * r + i] * (1 - tx) + a[j * r + i + 1] * tx) * (1 - tz) + (
            a[(j + 1) * r + i] * (1 - tx) + a[(j + 1) * r + i + 1] * tx
        ) * tz
        return self.offset + v * self.scale


class Slice:
    """One export slice: the vale (name None) or a further slice by name
    (wynd_common.EXTRA_SLICES), read from its own export folder."""

    def __init__(self, name=None):
        self.name = name
        self.export = W.slice_export(name) if name else W.EXPORT
        self.manifest = W.load_json("manifest.json", self.export)
        he = self.manifest["heightEncoding"]
        self.height = Raster(
            self.manifest, "heightmap.r16", "H", (he["max"] - he["min"]) / 65535.0, he["min"], self.export
        )
        self.grass = Raster(self.manifest, "grass_density.u8", "B", 1 / 255.0, 0.0, self.export)
        self.flowers = Raster(self.manifest, "flower_density.u8", "B", 1 / 255.0, 0.0, self.export)
        self.lights = W.load_json("lights.json", self.export)
        self.sea = W.load_json("water.json", self.export)["seaLevel"]
        self.stats = {}
        self.mesh_cache = {}

    def ground(self, x, z):
        return self.height.at(x, z)

    def meshes(self, path):
        if path not in self.mesh_cache:
            ms = W.model_meshes(path)
            self.mesh_cache[path] = (ms, W.union_bounds(ms) if ms else None)
        return self.mesh_cache[path]


def spawn(cls, loc=None, rot=None, label=None):
    a = actors.spawn_actor_from_class(cls, loc or unreal.Vector(0, 0, 0), rot or unreal.Rotator(0, 0, 0))
    if label:
        a.set_actor_label(label)
    return a


def nature_owned(a):
    """The nature crew's actors: labelled Nature_* or carrying a component
    tagged WyndNature. The build never deletes or edits them."""
    if a.get_actor_label().startswith("Nature_"):
        return True
    for c in a.get_components_by_class(unreal.ActorComponent):
        if "WyndNature" in [str(t) for t in c.component_tags]:
            return True
    return False


def load_all_cells():
    """The main map is World Partition with One File Per Actor, so its actors
    start unloaded and get_all_level_actors misses them (the nature layer, and
    this build's own WYND_* actors from earlier runs). Load every actor
    descriptor before clearing, counting or rendering. Returns the number of
    descriptors asked for, or -1 when the map is not partitioned."""
    wp = getattr(unreal, "WorldPartitionBlueprintLibrary", None)
    if wp is None:
        W.log("WorldPartitionBlueprintLibrary unavailable; cells not loaded")
        return -1
    try:
        descs = wp.get_actor_descs()
    except Exception as err:
        W.log("get_actor_descs failed (%s); not a partitioned map?" % err)
        return -1
    guids = [d.guid for d in descs]
    if guids:
        ok = wp.load_actors(guids)
        W.log("world partition: loaded %d actor descs (ok=%s)" % (len(guids), ok))
    return len(guids)


NATURE_KINDS = ("grass", "flower", "fern", "tree", "rock", "reed")


def nature_census():
    """Read-only count of the nature crew's actors (after load_all_cells): per
    kind by label keyword, plus overlaps, meaning actors of one kind whose
    locations agree to 0.5 m (a stale build left beside a fresh one). The
    build never deletes or edits these."""
    kinds = {k: 0 for k in NATURE_KINDS + ("other",)}
    seen = {}
    labels = []
    for a in actors.get_all_level_actors():
        if not nature_owned(a):
            continue
        label = a.get_actor_label()
        low = label.lower()
        kind = next((k for k in NATURE_KINDS if k in low), "other")
        kinds[kind] += 1
        p = a.get_actor_location()
        key = (kind, round(p.x / 50.0), round(p.y / 50.0))
        seen.setdefault(key, []).append(label)
        labels.append(label)
    overlaps = {}
    for (kind, _, _), group in seen.items():
        if len(group) > 1:
            overlaps.setdefault(kind, []).append(group)
    return {
        "total": len(labels),
        "byKind": kinds,
        "overlapGroups": {k: len(v) for k, v in overlaps.items()},
        "overlapSamples": {k: v[:3] for k, v in overlaps.items()},
        "otherSamples": [l for l in labels if not any(k in l.lower() for k in NATURE_KINDS)][:8],
    }


def nature_near(x, z, radius):
    """Read-only: per nature actor, how many of its mesh instances sit within
    `radius` yd (game frame, horizontal) of (x, z). Used by the diagnostic
    shots to tell nature's scatter from terrain shading."""
    cx, cy, r2 = x * W.UNIT, z * W.UNIT, (radius * W.UNIT) ** 2
    out = {}
    for a in actors.get_all_level_actors():
        if not nature_owned(a):
            continue
        n = 0
        for c in a.get_components_by_class(unreal.InstancedStaticMeshComponent):
            for i in range(c.get_instance_count()):
                t = c.get_instance_transform(i, True)
                dx, dy = t.translation.x - cx, t.translation.y - cy
                if dx * dx + dy * dy <= r2:
                    n += 1
        if n:
            out[a.get_actor_label()] = n
    return out


def clear_level():
    """Remove only this build's own WYND_* actors from the previous run."""
    for a in actors.get_all_level_actors():
        if a.get_actor_label().startswith("WYND_") and not nature_owned(a):
            actors.destroy_actor(a)


# When the nature crew owns the grass and flowers, this file exists and the
# build places no placeholder cover of its own.
def nature_owns_cover():
    project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
    return os.path.exists(os.path.join(project, "Config", "nature_owns_cover.flag"))


def build_terrain(sl, mat=None, water=True):
    mat = mat or WM.terrain_material()
    n = 0
    for p in lib.list_assets(W.slice_folder("Terrain", sl.name), recursive=True, include_folder=False):
        m = lib.load_asset(p)
        if not isinstance(m, unreal.StaticMesh):
            continue
        a = actors.spawn_actor_from_object(m, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
        a.set_actor_label("WYND_" + m.get_name())
        a.static_mesh_component.set_material(0, mat)
        n += 1
    sl.stats["terrainTiles"] = n
    if not water:
        return mat
    water = WM.water_material()
    plane = lib.load_asset("/Engine/BasicShapes/Plane")
    a = actors.spawn_actor_from_object(plane, W.to_ue(0, sl.sea, 0), unreal.Rotator(0, 0, 0))
    a.set_actor_label("WYND_Water")
    a.set_actor_scale3d(unreal.Vector(3000, 3000, 1))
    a.static_mesh_component.set_material(0, water)
    return mat


def place(sl, rec, label):
    ms, bounds = sl.meshes(rec["path"])
    if not ms:
        return 0
    lo, hi = bounds
    sx, sy, sz = W.fit_scale(rec["fit"], lo, hi)
    y = rec["y"] * W.UNIT
    if rec.get("seatOnGround", True):
        y -= lo[2] * sz
    loc = unreal.Vector(rec["x"] * W.UNIT, rec["z"] * W.UNIT, y)
    rot = unreal.Rotator(0, 0, W.yaw_ue(rec["rotY"]))
    for m in ms:
        a = actors.spawn_actor_from_object(m, loc, rot)
        a.set_actor_label("WYND_%s_%s" % (label, m.get_name()))
        a.set_actor_scale3d(unreal.Vector(sx, sy, sz))
    return len(ms)


def build_props(sl):
    placed = 0
    missing = set()
    for i, rec in enumerate(W.load_json("placements.json", sl.export)):
        k = place(sl, rec, "%s%s_%d" % (sl.name + "_" if sl.name else "", rec["source"], i))
        if not k:
            missing.add(rec["path"])
        placed += 1 if k else 0
    sl.stats["placements"] = placed
    sl.stats["placementsMissingMesh"] = sorted(missing)


FOLIAGE_TWO_SIDED = set()


def foliage_materials(mesh, leaves_only=True):
    """Leaf and grass cards light through from behind: two-sided foliage
    shading on their material instances (bark and rock keep default lit)."""
    for sm in mesh.get_editor_property("static_materials"):
        mi = sm.get_editor_property("material_interface")
        if not isinstance(mi, unreal.MaterialInstanceConstant) or mi.get_path_name() in FOLIAGE_TWO_SIDED:
            continue
        name = mi.get_name().lower()
        if leaves_only and not any(k in name for k in ("leaf", "leaves", "grass", "fern", "flower", "bush")):
            continue
        o = mi.get_editor_property("base_property_overrides")
        for k, v in (
            ("override_two_sided", True), ("two_sided", True),
            ("override_shading_model", False),
        ):
            try:
                o.set_editor_property(k, v)
            except Exception as err:
                W.log("foliage override %s: %s" % (k, err))
        mi.set_editor_property("base_property_overrides", o)
        unreal.MaterialEditingLibrary.update_material_instance(mi)
        lib.save_loaded_asset(mi)
        FOLIAGE_TWO_SIDED.add(mi.get_path_name())


def instancer(label, mesh, cast_shadow=True, cull=None):
    """An actor holding one instanced static mesh component, added through the
    subobject subsystem so it is a real editor component of the level."""
    a = spawn(unreal.StaticMeshActor, label="WYND_" + label)
    # instances are added in actor space: pin the holder at the origin
    a.set_actor_location(unreal.Vector(0, 0, 0), False, False)
    a.static_mesh_component.set_mobility(unreal.ComponentMobility.STATIC)
    sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    root = sds.k2_gather_subobject_data_for_instance(a)[0]
    params = unreal.AddNewSubobjectParams(
        parent_handle=root, new_class=unreal.InstancedStaticMeshComponent, blueprint_context=None
    )
    handle, fail = sds.add_new_subobject(params)
    data = unreal.SubobjectDataBlueprintFunctionLibrary.get_data(handle)
    c = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(data)
    c.set_static_mesh(mesh)
    c.set_mobility(unreal.ComponentMobility.STATIC)
    c.set_editor_property("cast_shadow", cast_shadow)
    if cull:
        c.set_editor_property("instance_end_cull_distance", int(cull))
    return c


def build_scatter(sl):
    groups = {}
    for rec in W.load_json("scatter.json", sl.export):
        groups.setdefault(rec["path"], []).append(rec)
    total = 0
    for path, recs in groups.items():
        ms, bounds = sl.meshes(path)
        if not ms:
            continue
        lo, hi = bounds
        comps = [instancer("scatter_" + m.get_name(), m) for m in ms]
        batch = []
        for rec in recs:
            sx, sy, sz = W.fit_scale(rec["fit"], lo, hi)
            sink = 0.05 * (hi[2] - lo[2]) * sz if rec["species"] != "rock" else 0.3 * W.UNIT * sz
            t = unreal.Transform(
                unreal.Vector(rec["x"] * W.UNIT, rec["z"] * W.UNIT, rec["y"] * W.UNIT - lo[2] * sz - sink),
                unreal.Rotator(0, 0, W.yaw_ue(rec["rotY"])),
                unreal.Vector(sx, sy, sz),
            )
            batch.append(t)
            total += 1
        for c in comps:
            c.add_instances(batch, False, False)
    sl.stats["scatter"] = total


# Placeholder ground cover, the export's own painted clumps (cover_meshes.ts)
# until the nature crew's PCG layer lands: (mesh, density raster, keep
# probability, scale range). Grass keeps near full cover on turf; the
# meadow flowers ride the exported flower density.
COVER = [
    ("grass_clump_a", "grass", 0.62, (0.9, 1.25)),
    ("grass_clump_c", "grass", 0.42, (0.9, 1.3)),
    ("grass_clump_b", "grass", 0.2, (0.85, 1.15)),
    ("flower_daisy", "flowers", 0.3, (0.9, 1.3)),
    ("flower_buttercup", "flowers", 0.26, (0.9, 1.3)),
    ("flower_campion", "flowers", 0.12, (0.9, 1.2)),
    ("flower_cornflower", "flowers", 0.12, (0.9, 1.2)),
]
COVER_ROOT = W.PLACEHOLDERS + "/Cover/"
# Placeholder cover areas (game x, z, radius) for slices without look shots:
# on the Proving Shore, Dawnrest Camp where players spawn (content/
# proving_shore.ts hub -300, 50), the Old Pier path and the Practice Yard.
SLICE_COVER_AREAS = {
    "proving_shore": [(-300.0, 50.0, 48.0), (-280.0, 0.0, 30.0), (-336.0, -14.0, 28.0)],
}


def build_ground_cover(sl, areas, step=0.3):
    """Jittered-grid instances inside each (x, z, radius) area, kept with the
    exported density as the probability. Deterministic (fixed seed)."""
    rng = random.Random(20061)
    comps = {}
    counts = {}
    for asset, _, _, _ in COVER:
        meshes = [
            lib.load_asset(p)
            for p in lib.list_assets(COVER_ROOT + asset, True, False)
        ]
        meshes = [m for m in meshes if isinstance(m, unreal.StaticMesh)]
        tag = (sl.name + "_") if sl.name else ""
        comps[asset] = [instancer("cover_%s%s_%s" % (tag, asset, m.get_name()), m, False, 9000) for m in meshes]
        counts[asset] = 0
    batches = {asset: [] for asset in comps}
    seen = set()
    for cx, cz, r in areas:
        n = int(r / step)
        for gj in range(-n, n + 1):
            for gi in range(-n, n + 1):
                key = (int(round((cx + gi * step) / step)), int(round((cz + gj * step) / step)))
                if key in seen:
                    continue
                seen.add(key)
                x = key[0] * step + rng.uniform(-0.45, 0.45) * step
                z = key[1] * step + rng.uniform(-0.45, 0.45) * step
                if (x - cx) ** 2 + (z - cz) ** 2 > r * r:
                    continue
                dens = {"grass": sl.grass.at(x, z), "flowers": sl.flowers.at(x, z)}
                roll = rng.random()
                acc = 0.0
                for asset, raster, keep, (s0, s1) in COVER:
                    acc += keep * min(1.0, dens[raster] * 1.3) / 1.65
                    if roll < acc:
                        s = rng.uniform(s0, s1)
                        t = unreal.Transform(
                            W.to_ue(x, sl.ground(x, z) - 0.03, z),
                            unreal.Rotator(rng.uniform(-6, 6), rng.uniform(-6, 6), rng.uniform(0, 360)),
                            unreal.Vector(s, s, s),
                        )
                        batches[asset].append(t)
                        counts[asset] += 1
                        break
    # one batched add per component: a per-instance add rebuilds the
    # component's instance buffers every call (quadratic in the count)
    for asset, ts in batches.items():
        for c in comps[asset]:
            c.add_instances(ts, False, False)
    sl.stats["groundCover"] = counts


def build_lights(sl):
    sun = spawn(unreal.DirectionalLight, label="WYND_Sun")
    lc = sun.light_component
    lc.set_editor_property("atmosphere_sun_light", True)
    lc.set_editor_property("intensity", 10.5)
    lc.set_editor_property("use_temperature", True)
    # v17 grade: a warmer golden sun (was 5300 K)
    lc.set_editor_property("temperature", 4900.0)
    lc.set_editor_property("volumetric_scattering_intensity", 1.0)
    # no light-shaft bloom: with a low sun in or near frame it washed the
    # harbour shot out
    lc.set_editor_property("enable_light_shaft_bloom", False)
    lc.set_editor_property("bloom_scale", 0.15)
    lc.set_editor_property("light_source_angle", 1.2)
    lc.set_editor_property("cast_cloud_shadows", True)
    atmo = spawn(unreal.SkyAtmosphere, label="WYND_SkyAtmosphere")
    # a touch more Mie haze than default keeps a golden halo round the low
    # sun; v16's 0.0065 bleached the whole sky pale, so v17 sits nearer the
    # default for a deeper blue overhead (defaults: scale 0.003996,
    # anisotropy 0.8)
    try:
        ac = atmo.get_component_by_class(unreal.SkyAtmosphereComponent)
        ac.set_editor_property("mie_scattering_scale", 0.0046)
        ac.set_editor_property("mie_anisotropy", 0.85)
    except Exception as err:
        W.log("atmosphere tweak skipped: %s" % err)
    sky = spawn(unreal.SkyLight, label="WYND_SkyLight")
    sc = sky.light_component
    sc.set_editor_property("real_time_capture", True)
    sc.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    sc.set_editor_property("intensity", 1.7)
    cloud = spawn(unreal.VolumetricCloud, label="WYND_Clouds")
    cm = lib.load_asset("/Engine/EngineSky/VolumetricClouds/m_SimpleVolumetricCloud_Inst")
    if cm:
        cloud.volumetric_cloud_component.set_editor_property("material", cm)
    fog = spawn(unreal.ExponentialHeightFog, label="WYND_Fog", loc=W.to_ue(0, -2, 0))
    fc = fog.component
    fc.set_editor_property("fog_density", 0.006)
    # distance haze reads sky blue (v16's cream washed the far vale out);
    # the warm golden air comes from the sun-side directional inscatter
    for k, v in (
        ("fog_inscattering_luminance", unreal.LinearColor(0.26, 0.34, 0.48, 1.0)),
        ("directional_inscattering_luminance", unreal.LinearColor(0.55, 0.42, 0.26, 1.0)),
    ):
        try:
            fc.set_editor_property(k, v)
        except Exception as err:
            W.log("fog %s skipped: %s" % (k, err))
    fc.set_editor_property("fog_height_falloff", 0.12)
    fc.set_editor_property("enable_volumetric_fog", True)
    fc.set_editor_property("volumetric_fog_scattering_distribution", 0.75)
    fc.set_editor_property("volumetric_fog_extinction_scale", 0.9)
    fc.set_editor_property("volumetric_fog_distance", 9000.0)
    pp = spawn(unreal.PostProcessVolume, label="WYND_Post")
    pp.set_editor_property("unbound", True)
    s = pp.settings
    for k, v in [
        # golden hour warmth comes from the sun's temperature alone; the
        # grade stays near neutral so greens and whites hold (owner note:
        # the first pass read too orange and too bright)
        # second pass: the frames read grey and dim beside the web game, so
        # a little more exposure, saturation and a soft warm highlight
        # gain, still short of orange; no lens flare, softer bloom and a
        # slow eye adaptation so a low sun cannot pump the exposure
        # third pass (v17): pale and washed out beside the web game, so a
        # storybook golden hour: less exposure, warmer white balance, more
        # saturation and contrast, warmth only in the highlights and a cool
        # lift in the shadows so the sky deepens instead of turning orange
        ("override_auto_exposure_bias", True), ("auto_exposure_bias", 0.1),
        ("override_auto_exposure_speed_up", True), ("auto_exposure_speed_up", 1.0),
        ("override_auto_exposure_speed_down", True), ("auto_exposure_speed_down", 1.0),
        ("override_auto_exposure_high_percent", True), ("auto_exposure_high_percent", 85.0),
        ("override_white_temp", True), ("white_temp", 6900.0),
        ("override_color_saturation", True), ("color_saturation", unreal.Vector4(1.04, 1.1, 1.06, 1.22)),
        ("override_color_contrast", True), ("color_contrast", unreal.Vector4(1.14, 1.14, 1.14, 1.0)),
        ("override_color_gain_highlights", True), ("color_gain_highlights", unreal.Vector4(1.05, 1.01, 0.94, 1.0)),
        ("override_color_gamma_shadows", True), ("color_gamma_shadows", unreal.Vector4(1.0, 1.0, 1.04, 1.0)),
        ("override_bloom_intensity", True), ("bloom_intensity", 0.4),
        ("override_lens_flare_intensity", True), ("lens_flare_intensity", 0.0),
        ("override_vignette_intensity", True), ("vignette_intensity", 0.35),
        ("override_ambient_occlusion_intensity", True), ("ambient_occlusion_intensity", 0.6),
        ("override_lumen_scene_lighting_quality", True), ("lumen_scene_lighting_quality", 2.0),
        ("override_lumen_final_gather_quality", True), ("lumen_final_gather_quality", 2.0),
        ("override_lumen_scene_detail", True), ("lumen_scene_detail", 2.0),
        ("override_film_grain_intensity", True), ("film_grain_intensity", 0.0),
    ]:
        try:
            s.set_editor_property(k, v)
        except Exception as err:
            W.log("post setting %s skipped: %s" % (k, err))
    pp.set_editor_property("settings", s)
    for i, pl in enumerate(sl.lights["pointLights"]):
        a = spawn(unreal.PointLight, loc=W.to_ue(pl["x"], pl["y"], pl["z"]), label="WYND_Lamp_%d" % i)
        c = a.light_component
        c.set_editor_property("intensity", 12.0)
        c.set_editor_property("attenuation_radius", pl["range"] * W.UNIT * 1.4)
        c.set_editor_property("light_color", unreal.Color(r=255, g=184, b=107, a=255))
        c.set_editor_property("cast_shadows", False)
    return sun


def set_time(sl, sun, key):
    k = next(k for k in sl.lights["keyLights"] if k["name"] == key)
    d = W.dir_to_ue(k["sunDir"])
    rot = unreal.MathLibrary.make_rot_from_x(unreal.Vector(-d.x, -d.y, -d.z))
    sun.set_actor_rotation(rot, False)
    return k


def build(cover_areas):
    descs = load_all_cells()
    clear_level()
    sl = Slice()
    sl.stats["wpActorDescs"] = descs
    # trees, bushes, ferns and rocks belong to the nature crew as well once
    # it owns the cover: the flag turns off all of this build's scatter
    nature_cover = nature_owns_cover()
    terrain = build_terrain(sl)
    build_props(sl)
    if not nature_cover:
        build_scatter(sl)
    # further slices (the Proving Shore spawn island): their own terrain
    # through a material instance, props, scatter and placeholder cover
    for name in W.EXTRA_SLICES:
        ex = Slice(name)
        ex.mesh_cache = sl.mesh_cache
        build_terrain(ex, WM.terrain_instance(terrain, name, ex.export), water=False)
        build_props(ex)
        if not nature_cover:
            build_scatter(ex)
            if name in SLICE_COVER_AREAS:
                build_ground_cover(ex, SLICE_COVER_AREAS[name])
        sl.stats[name] = ex.stats
    if nature_cover:
        sl.stats["groundCover"] = "nature crew (Config/nature_owns_cover.flag)"
        sl.stats["scatter"] = "nature crew (Config/nature_owns_cover.flag)"
    else:
        build_ground_cover(sl, cover_areas)
    sun = build_lights(sl)
    sl.stats["meshSources"] = {
        "registry": len(W.MESH_SOURCES["registry"]),
        "placeholder": sorted(W.MESH_SOURCES["placeholder"]),
    }
    sl.stats["nature"] = nature_census()
    W.log("scene stats %s" % sl.stats)
    return sl, sun


def look_rotation(eye, target):
    d = unreal.Vector(target.x - eye.x, target.y - eye.y, target.z - eye.z)
    return unreal.MathLibrary.make_rot_from_x(d)


def camera(label, eye, target, focal=28.0):
    cam = spawn(unreal.CineCameraActor, loc=eye, rot=look_rotation(eye, target), label="WYND_Cam_" + label)
    cc = cam.get_cine_camera_component()
    fb = cc.filmback
    fb.sensor_width = 36.0
    fb.sensor_height = 20.25
    cc.filmback = fb
    cc.current_focal_length = focal
    fs = cc.focus_settings
    fs.focus_method = unreal.CameraFocusMethod.DISABLE
    cc.focus_settings = fs
    return cam
