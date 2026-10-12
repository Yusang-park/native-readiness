import fs from 'node:fs';
import path from 'node:path';
import type { AnalyzeOptions } from './types.js';

export const CONFIG_FILE = 'native-readiness.config.json';

export type Config = Omit<AnalyzeOptions, 'root' | 'changedFiles' | 'lastChanged'>;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const loadConfig = (root: string, file?: string): Partial<Config> => {
  const configPath = path.resolve(root, file ?? CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    if (file) throw new Error(`Config file not found: ${configPath}`);
    return {};
  }
  const raw: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error(`${configPath} must contain a JSON object.`);
  const config: Partial<Config> = {};
  for (const key of ['entries', 'platformSuffixes', 'webOnlyPackages', 'nativeSafePackages', 'sharedStatePackages', 'breakpointHooks', 'ignore'] as const) {
    const value: unknown = Reflect.get(raw, key);
    if (value === undefined) continue;
    if (!isStringArray(value)) throw new Error(`"${key}" in ${configPath} must be an array of strings.`);
    config[key] = value;
  }
  const islandMaxImporters: unknown = Reflect.get(raw, 'islandMaxImporters');
  if (typeof islandMaxImporters === 'number') config.islandMaxImporters = islandMaxImporters;
  const layers: unknown = Reflect.get(raw, 'layers');
  if (layers !== undefined) {
    if (typeof layers !== 'object' || layers === null) throw new Error(`"layers" in ${configPath} must be an object.`);
    config.layers = {};
    for (const key of ['platform', 'primitives'] as const) {
      const value: unknown = Reflect.get(layers, key);
      if (value === undefined) continue;
      if (!isStringArray(value)) throw new Error(`"layers.${key}" in ${configPath} must be an array of strings.`);
      config.layers[key] = value;
    }
  }
  const tsconfig: unknown = Reflect.get(raw, 'tsconfig');
  if (typeof tsconfig === 'string') config.tsconfig = tsconfig;
  return config;
};
