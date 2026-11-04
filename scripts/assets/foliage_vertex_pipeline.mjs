import { createHash } from 'node:crypto';
import { Primitive } from '@gltf-transform/core';
import { reorder, weld } from '@gltf-transform/functions';

export const FOLIAGE_TOWN_TREE_ASSETS = Object.freeze([
  {
    path: 'models/foliage/pine_1.glb',
    inputSha256: 'd4a2c6e6f3d6fcc21a7fc93ae12ab1a3f76bf5747809051744827b3f73c6d23d',
    outputSha256: '1d13dc3096cad3ed601f4cbbcfd4b01bf10756973f2eab1d249d60233ad7b186',
    semanticSha256: '55d31eb650c377a5e2810dce1455ee053ac426de71248a1726e68454fa3bb633',
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: 'be1bcdc16f603ba763be099037a52de35d2493694e4ab69e7abc6197b72410b8',
    outputSha256: '431ae89330200d7d36bbff1438082ed575a944b9079f00338c7a63ea4f21cfd8',
    semanticSha256: '62b49e80aaddb6d27ce0328c3d4db584239f870f4d0402cbe2a9077435bee1d3',
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '2200cea8526463d295cc7a0185b04302fd6e7700a68c8a54454ce1c0c08beb58',
    outputSha256: 'e9cdd168e9a6c91ea33e78015ae62c74e97451524776962f65ab6d299ee9cb62',
    semanticSha256: '7ba75d5efc383a774f465e52f7c54756e252f0b742db4a8cb69c4d4ec590dc8c',
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: '704595b5b5ed17779fce6152c27b024a0b1a248634a0819ef71668caa8749603',
    outputSha256: 'e393bd6f8e3b6fbc6c00e1835419b3e6c5381c01910721835718ae8af7e4eac7',
    semanticSha256: 'c52e639b2b9ce8a8a5caf87d2f7702538c39b2cecba52e15e7efafffc58e7a02',
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: 'dc67101c46944c355e439ed85fbda5fa75f505579f225fa39c774dc98204c19d',
    outputSha256: '6c92d87080bd35dfdfcef3c2b8b775667dbb2cb94ef054e46e400414147dc8b4',
    semanticSha256: 'a5b20476ce8047cfa8e641bd305a5b2de7a479b2a6f98a3b32c320ec5d0d7d31',
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: 'e8199779712736c0ddc51d603d6800e2489536811f9572a59372bafa617cf70d',
    outputSha256: '3e2c7a0f329d38da28c90043437d0cdee79f9213f60de335865e97d13b81ac23',
    semanticSha256: 'ea31866413a42520b65e71ed1ea97154d13d28f18ed80e435ef58da623a682e2',
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: 'b2a430f1fceffc8d30988eee8a66140ab39af12ec4fac9e8d50b34e5b423547b',
    outputSha256: 'a3c202b9523959fb6454cec1b87bff0099b78a2e080c71c7830cb1f49e013a7d',
    semanticSha256: 'f2eb742522c4f11001ccd26241ce269b83b0bc75dffc78030331d4b12a4fd289',
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '7ca4b9ee170623060b5b460e01a81c2530dd4c8af1e645f835452a4cb7dc92e8',
    outputSha256: '8ccb3bf21dc6c3141bdec857bd6f2c307354f136a17a99985ccb39d8b9c707d8',
    semanticSha256: '0c6e1fb6746cf3136d1f49b7ccf6cb7c6c212708055e647e83b651360c29d497',
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: '9aead0ec2e9054f0f21ba7af7d26bed8aaffd22ac0d9bcbae562ee54def08f70',
    outputSha256: '54b13ee9ab3d118cc54f61f89199c1d96fae9523389c87515fcd9a8727a0a4a2',
    semanticSha256: '2cc9a905ef552571f1d205177906d718b2d15c39e0449053bba89863adfadefe',
  },
]);

function hashField(hash, value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  hash.update(length);
  hash.update(bytes);
}

function hashAccessorElement(hash, accessor, index) {
  const array = accessor.getArray();
  if (!array) throw new Error(`Accessor ${accessor.getName() || '<unnamed>'} has no array`);
  const bytesPerElement = array.BYTES_PER_ELEMENT;
  const byteOffset = array.byteOffset + index * accessor.getElementSize() * bytesPerElement;
  hash.update(
    new Uint8Array(array.buffer, byteOffset, accessor.getElementSize() * bytesPerElement),
  );
}

function cornerHash(primitive, vertexIndex) {
  const hash = createHash('sha256');
  const semantics = primitive.listSemantics().sort();
  for (const semantic of semantics) {
    const accessor = primitive.getAttribute(semantic);
    if (!accessor) throw new Error(`Primitive lost ${semantic}`);
    hashField(
      hash,
      `${semantic}:${accessor.getComponentType()}:${accessor.getType()}:${accessor.getNormalized()}`,
    );
    hashAccessorElement(hash, accessor, vertexIndex);
  }
  for (const [targetIndex, target] of primitive.listTargets().entries()) {
    for (const semantic of target.listSemantics().sort()) {
      const accessor = target.getAttribute(semantic);
      if (!accessor) throw new Error(`Morph target ${targetIndex} lost ${semantic}`);
      hashField(
        hash,
        `target:${targetIndex}:${semantic}:${accessor.getComponentType()}:${accessor.getType()}:${accessor.getNormalized()}`,
      );
      hashAccessorElement(hash, accessor, vertexIndex);
    }
  }
  return hash.digest('hex');
}

function canonicalTriangles(primitive, label) {
  if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
    throw new Error(`${label} is not TRIANGLES`);
  }
  const indices = primitive.getIndices()?.getArray();
  const position = primitive.getAttribute('POSITION');
  if (!position) throw new Error(`${label} has no POSITION`);
  const cornerCount = indices?.length ?? position.getCount();
  if (cornerCount % 3 !== 0) {
    throw new Error(`${label} has partial triangles`);
  }
  const triangles = [];
  for (let corner = 0; corner < cornerCount; corner += 3) {
    const a = indices ? indices[corner] : corner;
    const b = indices ? indices[corner + 1] : corner + 1;
    const c = indices ? indices[corner + 2] : corner + 2;
    const corners = [cornerHash(primitive, a), cornerHash(primitive, b), cornerHash(primitive, c)];
    // EXT_meshopt's index codec may rotate (a,b,c) to (b,c,a) while
    // retaining winding. Canonicalize only cyclic rotations, never the
    // reversed order.
    triangles.push(
      [
        `${corners[0]}:${corners[1]}:${corners[2]}`,
        `${corners[1]}:${corners[2]}:${corners[0]}`,
        `${corners[2]}:${corners[0]}:${corners[1]}`,
      ].sort()[0],
    );
  }
  return triangles.sort();
}

/**
 * Fingerprint the winding-preserving corner attributes of every triangle
 * while ignoring triangle submission order, cyclic corner rotation, and
 * numeric vertex IDs. Equal fingerprints prove that a weld/cache/fetch
 * reorder retained every triangle and shader-visible vertex value bit for bit.
 */
export function triangleAttributeFingerprint(document) {
  const hash = createHash('sha256');
  for (const [meshIndex, mesh] of document.getRoot().listMeshes().entries()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      const triangles = canonicalTriangles(
        primitive,
        `Mesh ${meshIndex} primitive ${primitiveIndex}`,
      );
      hashField(
        hash,
        `mesh:${meshIndex}:primitive:${primitiveIndex}:triangles:${triangles.length}`,
      );
      for (const triangle of triangles) hashField(hash, triangle);
    }
  }
  return hash.digest('hex');
}

/** The same fingerprint over one primitive, independent of its mesh or index. */
export function primitiveTriangleAttributeFingerprint(primitive) {
  const hash = createHash('sha256');
  const triangles = canonicalTriangles(primitive, 'Primitive');
  hashField(hash, `triangles:${triangles.length}`);
  for (const triangle of triangles) hashField(hash, triangle);
  return hash.digest('hex');
}

/**
 * Merge only bitwise-identical complete vertices, then optimize triangle and
 * vertex storage order for GPU locality. This changes no attribute value or
 * triangle, and runs only in the offline asset pipeline.
 */
export async function optimizeFoliageVertexDocument(document, encoder) {
  await document.transform(
    weld(),
    reorder({
      encoder,
      target: 'performance',
    }),
  );
}
