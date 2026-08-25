import { fileURLToPath } from 'node:url';

/**
 * Absolute path of the bundled SQL migrations. Resolved relative to this
 * module so it works from `src/` (dev, tsx, vitest) and from `dist/`
 * (published) alike — both sit one level below the package root.
 */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
