// esbuild `define` for every server-side bundle (scripts/build_server.mjs).
// The server bundle is CommonJS, where esbuild lowers `import.meta` to an empty
// object, so a shared src/ module that reads a Vite client build switch at
// module scope (src/early_access_flags.ts) would throw on `import.meta.env`
// before the realm boots. The server is never a Vite build: every VITE_*
// client switch reads as unset there, and realm switches come from process.env
// (server/early_access_flags.ts). Pinned by tests/server_build_define.test.ts.
export const SERVER_BUILD_DEFINE = { 'import.meta.env': '{}' };
