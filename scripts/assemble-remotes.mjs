import { cpSync, existsSync, mkdirSync } from 'node:fs';

const remotes = ['home', 'list', 'grid', 'search'];
const targetRoot = 'dist/host-app/browser';

for (const remote of remotes) {
  const src = `dist/${remote}/browser`;
  const dest = `${targetRoot}/${remote}`;
  if (!existsSync(src)) {
    throw new Error(`Missing build output for remote "${remote}" at ${src}`);
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

console.log(`Copied ${remotes.length} remote(s) into ${targetRoot}`);
