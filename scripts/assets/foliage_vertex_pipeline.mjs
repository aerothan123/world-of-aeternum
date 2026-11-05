import { createHash } from 'node:crypto';
import { Primitive } from '@gltf-transform/core';
import { reorder, weld } from '@gltf-transform/functions';

export const FOLIAGE_TOWN_TREE_ASSETS = Object.freeze([
  {
    path: 'models/foliage/pine_1.glb',
    inputSha256: '10dce8acf42359fc9cbf40f7d0003e48af239250321ea623b7c6af26b374a8a3',
    outputSha256: 'e7dfb7dc0bd53dda1a4f3c73cc54a271ee040c7f8396e3e4c522b501190c9f3d',
    semanticSha256: 'fb47b49e240306007f30756cfb686caaa153a7085e8d9618d07f378a75b31a44',
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: '1f3b73333c705d9bbb01d4144e6f6853a65a960d77b71e3c8aa8ad4fe89e4e6a',
    outputSha256: 'ef01904671f3755e3ffb2773c4a16e4cd24c0db29d5a09cedc4148da80e38fae',
    semanticSha256: '2b686bff89372efe802b4e48981541c16f68760f229f2e9ef6e6bca5ccf804b3',
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '946e85df1d89deffb0acb7e9bf2c57124e3d7409d68c0f7be41c3761e89fd6e6',
    outputSha256: '438301274c50d74fad8ced9c5f0e92ded2abc4d7dfd25fcb7a47c5facead74ae',
    semanticSha256: '96102401696917f891ba5642fc96026f0240d50bbeb9b9c9a9df2f4b910bd9a1',
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: 'f8cb6205791570c44b9c6812d88d6af1b91539e5905cde92e7a92bfb2ec3daf0',
    outputSha256: '37dbc1baf4758c43b889b4db232b484ade845888eb2f1b012cfa79c09d43d75a',
    semanticSha256: '57cb00b5afd56866ad125e4f60fab357cf9842c3b97e737948c10740edb52c56',
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: 'dccda5d55a04a64c654ddb9e499df9ea60a4c74b0df5dba48cdf0b1d720c8039',
    outputSha256: 'd38f3eaf035c06f911003d908eba2b1dc9742094d12ced8299a780631fa1de00',
    semanticSha256: 'b2cf6414ec5c9589924bb6da19bac810c6be5c3248fa1837ab857fd9f871c6bf',
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: '7c93696510c20d00e59d4abc06e82a685c0b75d1e5ccfa99ce7b7be5f2995c7f',
    outputSha256: 'c96851d51e4b86fda605fa9af7b9be3df332a6ec1ad9fbcdb4ad8d380ca664a0',
    semanticSha256: '34d3d8dc62382f154efd5d77d8487af12fda44c1d04f87220bdcdb537c3e0574',
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: '11245bab27d8f0e274f15bc3a1083241cd6e161547f7331ec29d63f4a71a1217',
    outputSha256: '682cd65970d23c1fcb63ba2573b5e86ded8ca7c972c14bd52c3c936b6f114d8b',
    semanticSha256: 'a9110b91bb1039fa26b8bed7e90ebd136d9f30d20bf331d8f2e422587c67c5a8',
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '1168937fcfc8f6eb44b91d37b2d59f94a8ca3bd42e1c5baedd074863fe1b2020',
    outputSha256: 'ae59752b50a19fd31e2d3088696870bad1ac73e79405f24217edb298f6280453',
    semanticSha256: '26564016837029fefd7a4193114284388a343695e19ef51db2b8242d6e2814b4',
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: 'd554d130ee37487f515b02ca01845f588a7106c2948a97367dba30738fb97c00',
    outputSha256: '024894e048779493e7802f881b054a841fd9522c46e4ba5f72f8f5a9c1579d30',
    semanticSha256: '737eee01c5dd78b8673e9102d4d52be5a4800f8c5eedfe9fa4804e72c995ad0a',
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
