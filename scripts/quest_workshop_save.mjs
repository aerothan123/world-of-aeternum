// Quest Workshop save worker: the dev server's /__quest_editor/save endpoint
// (vite.config.ts questEditorSavePlugin) hands this script the POST body on
// stdin and reads one JSON verdict on stdout. It bundles the TypeScript save
// pipeline (src/quest_editor/workshop_save.ts, which re-validates the set with
// the same pure core the page runs, over the live content tables) with esbuild
// per call, exactly like the i18n builders, so every save sees the CURRENT
// generated module and tables rather than a dev-server module graph that may be
// stale after the previous save rewrote them.
//
// Never writes anything: the endpoint owns the file write and the artifact
// regeneration. Usage: echo '{"quests":[]}' | node scripts/quest_workshop_save.mjs

import * as esbuild from 'esbuild';

const root = process.cwd();

async function loadPipeline() {
  const build = await esbuild.build({
    stdin: {
      contents: "export { prepareWorkshopSave } from './src/quest_editor/workshop_save';",
      resolveDir: root,
      sourcefile: 'quest-workshop-save-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString('base64')}`;
  return import(dataUrl);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const [body, { prepareWorkshopSave }] = await Promise.all([readStdin(), loadPipeline()]);
process.stdout.write(JSON.stringify(prepareWorkshopSave(body)));
