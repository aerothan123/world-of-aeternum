// World Style Refined: the shader text. Every function here is a string
// transform applied ONLY when the Refined style is active, AFTER a material's
// own Classic patch has run, so the Classic shader of every consumer is the
// shipped source byte for byte (pinned in tests/world_style_classic_pin.test.ts).
// No new sampler anywhere: the terrain material sits at 15 of 16 fragment
// units, so the Refined layers ride the existing packed albedo array and the
// macro noise it already binds. Numbers come from world_style_core.ts, whose
// JS mirrors (refinedBlendWeights, refinedAerialAmount, refinedPalette) are
// what the tests pin.

import { WATER_LEVEL } from '../sim/world';
import {
  REFINED_AERIAL_MAX,
  REFINED_BLEND,
  REFINED_EARTH,
  REFINED_LAYER_GRASS_B,
  REFINED_LAYER_GRAVEL,
  REFINED_PALETTE,
  type RefinedTerrainProfile,
} from './world_style_core';

const f = (n: number): string => {
  const s = n.toFixed(5);
  return s.includes('.') ? s : `${s}.0`;
};
const v3 = (c: readonly [number, number, number] | readonly number[]): string =>
  `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;

/** A shader patch failed to find its anchor: a three bump or a Classic edit
 *  moved it. Thrown at compile so the miss is loud, never a silent no-op. */
function replaceOnce(source: string, anchor: string, replacement: string, what: string): string {
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error(`world style: ${what} anchor missing: ${anchor.slice(0, 60)}`);
  return source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

/** Uniform declarations every Refined world-surface consumer splices. */
export const WORLD_STYLE_SURFACE_DECLARATIONS = `
        uniform vec4 uWsAerial;       // rgb haze colour, a strength
        uniform vec4 uWsAerialParams; // x clear yd, y density, z base height, w height falloff`;

/** The painterly ground palette (balance, then a saturation pull). */
const PALETTE_GLSL = `
        vec3 wocWsPalette(vec3 c) {
          c *= ${v3(REFINED_PALETTE.balance)};
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          return mix(vec3(l), c, ${f(REFINED_PALETTE.saturation)});
        }`;

/** The aerial perspective term, spliced immediately before <fog_fragment> so
 *  the scene fog still owns the true rim. Zero inside the clear radius, capped
 *  at REFINED_AERIAL_MAX; the height arm thickens valley air. */
function aerialGlsl(pos: string, heightAware: boolean): string {
  return `
        #ifdef USE_FOG
        {
          float wocWsD = max(distance(cameraPosition, ${pos}) - uWsAerialParams.x, 0.0);
          float wocWsA = 1.0 - exp(-wocWsD * uWsAerialParams.y);
          ${
            heightAware
              ? `wocWsA *= 0.55 + 0.45 * exp(-max(${pos}.y - uWsAerialParams.z, 0.0) * uWsAerialParams.w);`
              : 'wocWsA *= 0.775;'
          }
          wocWsA = min(wocWsA * min(uWsAerial.a, ${f(REFINED_AERIAL_MAX)}), ${f(REFINED_AERIAL_MAX)});
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uWsAerial.rgb, 0.55), wocWsA);
        }
        #endif
        #include <fog_fragment>`;
}

/** The Refined splat ground: variant grass, gravel, steep rock, shore mud,
 *  distance breakup and the palette, folded into the composed `alb` right
 *  before the snow mix. Mirrors refinedBlendWeights. */
export function refinedSplatGlsl(p: RefinedTerrainProfile): string {
  const b = REFINED_BLEND;
  const e = REFINED_EARTH;
  const lumaW = 'vec3(0.2126, 0.7152, 0.0722)';
  return `
        // ---- World Style Refined (world_style_glsl.ts) ----
        {
          vec3 wocWsTint = mix(vec3(1.0), clamp(vColor.rgb * 2.0, 0.0, 2.0), 0.35);
          float wocWsDist = distance(cameraPosition.xz, vWPos.xz);
          float wocWsVar = ${
            p.noiseTaps
              ? 'mix(texture2D(uMacro, vWPos.xz * 0.021 + vec2(0.31, 0.77)).r, texture2D(uMacro, vWPos.xz * 0.083 + vec2(0.57, 0.13)).r, 0.3)'
              : 'macro2'
          };
          if ( uWsLayers > 0.5 && wocHasGrass && wocHW.x > 0.01 ) {
            // Dry meadow variant: the Grass004 photo as a luminance DETAIL
            // ratio over the matched Classic grass tone, tinted straw gold.
            float wocWsVarW = wocHW.x * smoothstep(${f(b.variantLo)}, ${f(b.variantHi)}, wocWsVar) * ${f(b.variantMax)};
            if ( wocWsVarW > 0.002 ) {
              vec2 wocWsGuv = vec2(tuv.y, -tuv.x) * 0.8 + 0.19;
              float wocWsGl = dot(WOC_ALB(wocWsGuv, ${f(REFINED_LAYER_GRASS_B)}), ${lumaW});
              float wocWsGm = dot(textureLod(uAlb, vec3(wocWsGuv, ${f(REFINED_LAYER_GRASS_B)}), 12.0).rgb, ${lumaW});
              float wocWsGd = clamp(wocWsGl / max(wocWsGm, 1e-3), 0.6, 1.45);
              alb = mix(alb, alb * ${v3(REFINED_PALETTE.dryGrass)} * wocWsGd, wocWsVarW);
            }
          }
          if ( uWsLayers > 0.5 && wocHasDirt && wocHW.y > 0.01 ) {
            float wocWsGrN = ${p.noiseTaps ? 'texture2D(uMacro, vWPos.xz * 0.19 + vec2(0.71, 0.29)).r' : '0.5'};
            float wocWsGrW = wocHW.y * min(${f(b.gravelMax)},
              pathEdge * ${f(b.gravelEdge)} + (1.0 - pathEdge) * ${f(b.gravelCore)}
              + smoothstep(0.55, 0.85, wocWsGrN) * ${f(b.gravelNoise)}) * (1.0 - vExtra.x);
            if ( wocWsGrW > 0.002 ) {
              // Gravel takes the trail's own earth tone, so a road reads as
              // packed brown grit with stones in it, never a grey strip.
              vec3 wocWsGr = WOC_ALB(tuv * 1.35 + vec2(0.37, 0.11), ${f(REFINED_LAYER_GRAVEL)})
                * ${v3(REFINED_PALETTE.gravelWarm)} * wocWsTint;
              alb = mix(alb, wocWsGr, wocWsGrW);
            }
          }
          ${
            p.steepRock
              ? `if ( wocHasRock ) {
            // Steep faces the splat weights left as turf turn to rock; rockAlb
            // is already wall-projected, so cliffs do not stretch.
            float wocWsSt = (wocHW.x + wocHW.y)
              * smoothstep(${f(b.steepHi)}, ${f(b.steepLo)}, an.y) * ${f(b.steepMax)};
            alb = mix(alb, rockAlb * wocWsTint, wocWsSt);
          }`
              : ''
          }
          // Damp band just above the waterline: darker, warmer soil under the
          // turf (with the mud photo on the rich tiers).
          float wocWsShore = (wocHW.x + wocHW.y) * (1.0 - smoothstep(
            ${f(WATER_LEVEL + b.shoreNear)}, ${f(WATER_LEVEL + b.shoreFar)}, vWPos.y))
            * ${f(b.shoreMax)} * (1.0 - vExtra.y);
          if ( wocWsShore > 0.002 ) {
            vec3 wocWsDamp = ${
              p.shoreMud
                ? `mix(alb * ${v3(REFINED_PALETTE.dampShore)}, WOC_ALB(tuv * 0.8, WOC_L_MUD) * wocWsTint, 0.5)`
                : `alb * ${v3(REFINED_PALETTE.dampShore)}`
            };
            alb = mix(alb, wocWsDamp, wocWsShore);
          }
          ${
            p.macroBreakup
              ? `// Distance macro breakup: a slow value and hue swing that only
          // opens past the near field, so far hillsides never show one tile.
          float wocWsFar = smoothstep(45.0, 170.0, wocWsDist);
          float wocWsM = ${p.noiseTaps ? 'texture2D(uMacro, vWPos.xz * 0.0017 + vec2(0.41, 0.09)).r' : 'macro2'};
          alb *= mix(vec3(1.0), mix(vec3(0.86, 0.89, 0.85), vec3(1.1, 1.07, 0.98), wocWsM), wocWsFar * 0.85);`
              : ''
          }
          // Storybook earth: per-layer tints (sunlit meadow floor, ochre
          // packed earth, cream sand, soft warm rock) and a detail soften,
          // then the trail shoulder greens over into the meadow.
          {
            float wocWsSum = max(dot(wocHW, vec4(1.0)), 1e-3);
            vec3 wocWsEarth = (${v3(e.grass)} * wocHW.x + ${v3(e.dirt)} * wocHW.y
              + ${v3(e.rock)} * wocHW.z + ${v3(e.sand)} * wocHW.w) / wocWsSum;
            float wocWsEl = dot(alb, ${lumaW});
            float wocWsSoftK = mix(1.0, ${f(e.soften)}, clamp((wocHW.y + wocHW.z) / wocWsSum, 0.0, 1.0));
            alb *= wocWsEarth * ((${f(e.softenPivot)} + (wocWsEl - ${f(e.softenPivot)}) * wocWsSoftK) / max(wocWsEl, 1e-3));
            alb = mix(alb, vec3(dot(alb, ${lumaW})) * ${v3(e.pathGreenTint)},
              clamp(pathEdge * wocHW.y * ${f(e.pathGreen)}, 0.0, 1.0));
          }
          alb = wocWsPalette(alb);
        }
        // snow cover on the peaks/rim, by baked per-vertex weight`;
}

/** Apply the Refined arm to a compiled splat terrain shader (after its own
 *  Classic onBeforeCompile ran). */
export function patchRefinedSplatShader(
  sh: { fragmentShader: string },
  p: RefinedTerrainProfile,
): void {
  let frag = replaceOnce(
    sh.fragmentShader,
    '#include <common>',
    `#include <common>${WORLD_STYLE_SURFACE_DECLARATIONS}
        uniform float uWsLayers;${PALETTE_GLSL}`,
    'splat common',
  );
  frag = replaceOnce(
    frag,
    '        // snow cover on the peaks/rim, by baked per-vertex weight',
    refinedSplatGlsl(p),
    'splat snow',
  );
  frag = replaceOnce(
    frag,
    '#include <fog_fragment>',
    aerialGlsl('vWPos', p.aerialHeight),
    'splat fog',
  );
  sh.fragmentShader = frag;
}

/** The Low tier's Lambert ground: the palette on the lit colour (zero taps)
 *  and the distance-only aerial arm. */
export function patchRefinedLambertShader(sh: { fragmentShader: string }): void {
  let frag = replaceOnce(
    sh.fragmentShader,
    '#include <common>',
    `#include <common>${WORLD_STYLE_SURFACE_DECLARATIONS}${PALETTE_GLSL}`,
    'lambert common',
  );
  frag = replaceOnce(
    frag,
    '#include <fog_fragment>',
    `gl_FragColor.rgb = wocWsPalette(gl_FragColor.rgb);${aerialGlsl('vWocWPos', false)}`,
    'lambert fog',
  );
  sh.fragmentShader = frag;
}

/** The far vista tiles: the identical aerial term on their own world-position
 *  varying, so the detail-horizon handoff draws no ring. */
export function patchRefinedFarTerrainShader(
  sh: { vertexShader: string; fragmentShader: string },
  heightAware: boolean,
): void {
  sh.vertexShader = replaceOnce(
    sh.vertexShader,
    '#include <common>',
    '#include <common>\nvarying vec3 vWsWPos;',
    'far common',
  );
  sh.vertexShader = replaceOnce(
    sh.vertexShader,
    '#include <begin_vertex>',
    '#include <begin_vertex>\n        vWsWPos = (modelMatrix * vec4(position, 1.0)).xyz;',
    'far begin_vertex',
  );
  let frag = replaceOnce(
    sh.fragmentShader,
    '#include <common>',
    `#include <common>\nvarying vec3 vWsWPos;${WORLD_STYLE_SURFACE_DECLARATIONS}${PALETTE_GLSL}`,
    'far frag common',
  );
  frag = replaceOnce(
    frag,
    '#include <fog_fragment>',
    `gl_FragColor.rgb = wocWsPalette(gl_FragColor.rgb);${aerialGlsl('vWsWPos', heightAware)}`,
    'far fog',
  );
  sh.fragmentShader = frag;
}

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------

export const WORLD_STYLE_SKY_DECLARATIONS = `
  uniform vec3 uWsSkyZenith;
  uniform vec3 uWsSkyHorizon;
  uniform vec3 uWsSunGlow;
  uniform vec4 uWsCloudLit;   // rgb lit colour, a coverage
  uniform vec4 uWsCloudShade; // rgb shade colour, a opacity
  uniform vec4 uWsAerial;
  uniform vec2 uWsCloudDrift; // dome-plane offset (time times drift)
`;

/** The Refined sky: a gradient blend with a sun glow lobe, a drifting noise
 *  cloud layer, and a widened horizon haze matched to the ground's aerial
 *  colour. Lands after the day/night multiply and before the stars, so the
 *  stars still draw over the night gradient. */
const REFINED_SKY_GLSL = `
    // ---- World Style Refined sky (world_style_glsl.ts) ----
    {
      float wsUp = clamp(dir.y, 0.0, 1.0);
      vec3 wsGrad = mix(uWsSkyHorizon, uWsSkyZenith, pow(wsUp, 0.55));
      // A CHROMA grade, luminance kept: the gradient re-colours the sky the
      // HDRI already paints (its clouds and brightness survive), so the IBL
      // the renderer prefilters from this dome keeps its energy.
      float wsSkyL = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float wsGradL = max(dot(wsGrad, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      c = mix(c, wsGrad * (wsSkyL / wsGradL), 0.38 * smoothstep(-0.05, 0.08, dir.y));
      float wsSun = max(dot(dir, normalize(uSunDirLive)), 0.0);
      c += uWsSunGlow * (pow(wsSun, 6.0) * 0.35 + pow(wsSun, 48.0) * 0.65)
        * smoothstep(-0.2, 0.05, uSunDirLive.y);
      // Cloud layer: billowy painted cumulus on the dome plane, drifting
      // downwind. A domain warp rounds the fbm into puffs, a second density
      // read nudged toward the sun lights the sun-facing rims and shades the
      // far bellies, and the edges stay soft. Faded out toward the horizon
      // (where the haze band owns the sky) and below it.
      if (dir.y > 0.02) {
        vec2 wsP = dir.xz / (dir.y + 0.12) * 1.35 + uWsCloudDrift;
        vec2 wsW = vec2(noise2(wsP * 0.9 + 4.7), noise2(wsP * 0.9 + 9.2)) - 0.5;
        vec2 wsQ = wsP + wsW * 0.9;
        float wsN = noise2(wsQ * 1.5) * 0.56 + noise2(wsQ * 3.4 + 7.1) * 0.27
          + noise2(wsQ * 7.6 + 3.3) * 0.12 + noise2(wsQ * 15.0 + 1.7) * 0.05;
        vec2 wsSunXZ = uSunDirLive.xz / max(length(uSunDirLive.xz), 1e-3);
        vec2 wsQs = wsQ + wsSunXZ * 0.12;
        float wsNs = noise2(wsQs * 1.5) * 0.56 + noise2(wsQs * 3.4 + 7.1) * 0.27
          + noise2(wsQs * 7.6 + 3.3) * 0.12;
        float wsTh = 1.0 - uWsCloudLit.a;
        float wsCov = smoothstep(wsTh, wsTh + 0.16, wsN);
        float wsThick = smoothstep(wsTh + 0.04, wsTh + 0.42, wsN);
        // denser toward the sun means this texel sits on the shaded side
        float wsShadeT = clamp((wsNs - wsN) * 5.0 + 0.35, 0.0, 1.0) * wsThick;
        vec3 wsCloud = mix(uWsCloudLit.rgb, uWsCloudShade.rgb, wsShadeT * 0.75);
        // silver-gold rim on the thin sun-facing edges
        wsCloud += uWsSunGlow * (1.0 - wsThick) * (0.35 + pow(wsSun, 4.0) * 0.8);
        c = mix(c, wsCloud, wsCov * uWsCloudShade.a * smoothstep(0.02, 0.22, dir.y));
      }
    }
`;

const REFINED_SKY_HAZE_GLSL = `
    // Refined horizon haze: the same air colour the ground's aerial term
    // fades into, so far hills and the sky meet in one blue-grey band.
    c = mix(mix(uFog, uWsAerial.rgb, 0.55), c, mix(1.0, smoothstep(0.0, 0.24, dir.y), uWsAerial.a * 0.8));
`;

/** Splice the Refined arm into the dome fragment (`skyFrag` output). */
export function withRefinedSky(frag: string): string {
  let out = replaceOnce(
    frag,
    '  uniform sampler2D uSkyA;',
    `${WORLD_STYLE_SKY_DECLARATIONS}  uniform sampler2D uSkyA;`,
    'sky uniforms',
  );
  out = replaceOnce(
    out,
    '    // The sun and moon discs are billboard sprites',
    `${REFINED_SKY_GLSL}    // The sun and moon discs are billboard sprites`,
    'sky clouds',
  );
  out = replaceOnce(
    out,
    '    c = mix(uFog, c, smoothstep(0.1, 0.36, dir.y));\n',
    `    c = mix(uFog, c, smoothstep(0.1, 0.36, dir.y));\n${REFINED_SKY_HAZE_GLSL}`,
    'sky haze',
  );
  return out;
}

// ---------------------------------------------------------------------------
// Output grade
// ---------------------------------------------------------------------------

/** Splice the per-time-of-day grade into the output grade fragment: an
 *  exposure lift before tone mapping, then a gain, lift and saturation step
 *  after the stock grade's white balance. */
export function withWorldGrade(frag: string): string {
  let out = replaceOnce(
    frag,
    '  uniform float uSpirit;',
    `  uniform float uSpirit;
  uniform vec4 uWsGradeGain; // rgb gain, a saturation
  uniform vec4 uWsGradeLift; // rgb lift, a exposure`,
    'grade uniforms',
  );
  out = replaceOnce(
    out,
    '    outputColor.rgb = sanitizeFinite(outputColor.rgb);\n',
    '    outputColor.rgb = sanitizeFinite(outputColor.rgb) * uWsGradeLift.a;\n',
    'grade exposure',
  );
  out = replaceOnce(
    out,
    '    c = mix(c, c * c * (3.0 - 2.0 * c), 0.23);',
    `    c = max(c * uWsGradeGain.rgb + uWsGradeLift.rgb, vec3(0.0));
    {
      float wsL = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(wsL), c, uWsGradeGain.a);
    }
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.23);`,
    'grade body',
  );
  return out;
}
