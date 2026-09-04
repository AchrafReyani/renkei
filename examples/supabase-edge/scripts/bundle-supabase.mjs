// Bundle the workspace build of renkei-server/supabase into one file, served as
// the gitignored `renkei-local` function, so the example can be exercised against
// unpublished code (see README "Running against the workspace build"). Not needed
// when importing the npm package.
import { mkdirSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const builtins = new Set(builtinModules);
const dir = `${root}supabase/functions/renkei-local`;

mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}/index.ts`,
  [
    '// Local verification against the workspace build (gitignored; see README).',
    "import { serve } from './_bundle.js';",
    '',
    'serve();',
    '',
  ].join('\n'),
);

await esbuild.build({
  entryPoints: [`${root}../../packages/server/dist/supabase.js`],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'esnext',
  mainFields: ['module', 'main'],
  conditions: ['import', 'default'],
  outfile: `${dir}/_bundle.js`,
  logLevel: 'info',
  // A plain file gets none of the Node globals Deno injects into npm: packages:
  // CommonJS dependencies (koa) require() builtins at runtime, oidc-provider uses Buffer and process.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { Buffer as __Buffer } from 'node:buffer';",
      "import __process from 'node:process';",
      "import { setImmediate as __setImmediate, clearImmediate as __clearImmediate } from 'node:timers';",
      'const require = __createRequire(import.meta.url);',
      'globalThis.Buffer ??= __Buffer;',
      'globalThis.process ??= __process;',
      'globalThis.setImmediate ??= __setImmediate;',
      'globalThis.clearImmediate ??= __clearImmediate;',
    ].join('\n'),
  },
  plugins: [
    {
      name: 'node-prefix',
      setup(build) {
        // Deno only accepts Node builtins with the node: prefix.
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path.startsWith('node:')) return { path: args.path, external: true };
          if (builtins.has(args.path)) return { path: `node:${args.path}`, external: true };
          return undefined;
        });
      },
    },
  ],
});
