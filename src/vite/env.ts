import fs from 'node:fs';
import path from 'node:path';

export type ViteEnv = Record<string, string | boolean>;

const parseEnvFile = (file: string) => {
  const values: Record<string, string> = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
    if (!match?.[1]) continue;
    const raw = (match[2] ?? '').trim();
    const quoted = /^(['"`])([\s\S]*)\1$/.exec(raw);
    values[match[1]] = quoted ? (quoted[2] ?? '') : raw.replace(/\s+#.*$/, '');
  }
  return values;
};

/** Loads env values the way Vite does: .env, .env.local, .env.[mode], .env.[mode].local, later files winning. */
export const loadViteEnv = (root: string, mode: string, prefixes: string[] = ['VITE_']): ViteEnv => {
  const merged = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
    .map((name) => parseEnvFile(path.join(root, name)))
    .reduce<Record<string, string>>((all, values) => ({ ...all, ...values }), {});
  const exposed = Object.fromEntries(
    Object.entries(merged).filter(([key]) => prefixes.some((prefix) => key.startsWith(prefix))),
  );
  return {
    ...exposed,
    MODE: mode,
    DEV: mode !== 'production',
    PROD: mode === 'production',
    SSR: false,
    BASE_URL: '/',
  };
};
