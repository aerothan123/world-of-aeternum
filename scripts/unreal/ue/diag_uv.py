# Read-only UV verification from the StaticMeshDescription (the EditorStaticMeshLibrary
# get_num_uv_channels call returns 0 even for /Engine/BasicShapes/Cube in a commandlet, so it is not a valid probe).
# Env WYND_UV_IDS: comma list of registry ids (default: the six tidehold buildings + the engine cube as control).
import json
import os
import unreal

eal = unreal.EditorAssetLibrary
reg = json.load(open(r'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json'))
ids = os.environ.get('WYND_UV_IDS', 'tidehold/bank,tidehold/smithy,tidehold/tavern,tidehold/hall,tidehold/shop_a,tidehold/house_b').split(',')
items = [('ENGINE_CUBE_CONTROL', '/Engine/BasicShapes/Cube')] + [(i, reg[i]['path'].split('.')[0]) for i in ids if i in reg]
probed = False
for name, p in items:
    m = eal.load_asset(p)
    d = m.get_static_mesh_description(0)
    if not probed:
        unreal.log('UVD methods ' + ','.join(n for n in dir(d) if not n.startswith('_') and ('uv' in n.lower() or 'vertex_instance' in n.lower() or 'count' in n.lower() or n.startswith('get_num'))))
        probed = True
    res = []
    for fn in ('get_num_uv_channels', 'get_vertex_instance_count', 'get_triangle_count', 'get_vertex_count'):
        if hasattr(d, fn):
            try:
                res.append(f'{fn}={getattr(d, fn)()}')
            except Exception as e:
                res.append(f'{fn}=ERR')
    # sample UVs of the first vertex instances
    if hasattr(d, 'get_vertex_instance_uv'):
        n = d.get_vertex_instance_count() if hasattr(d, 'get_vertex_instance_count') else 0
        us, vs = [], []
        for vi in range(0, n, max(1, n // 400)):
            try:
                uv = d.get_vertex_instance_uv(unreal.VertexInstanceID(vi), 0)
                us.append(uv.x)
                vs.append(uv.y)
            except Exception:
                break
        if us:
            res.append(f'uv_range u[{min(us):.2f},{max(us):.2f}] v[{min(vs):.2f},{max(vs):.2f}] samples={len(us)}')
    unreal.log(f'UVD {name} ' + ' '.join(res))
