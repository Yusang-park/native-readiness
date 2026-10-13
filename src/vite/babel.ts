import path from 'node:path';
import type { NodePath, PluginAPI, PluginObject, PluginPass, types as BabelTypes } from '@babel/core';
import { expandGlobs } from './glob-files.js';
import { loadViteEnv, type ViteEnv } from './env.js';

export type ViteCompatBabelOptions = {
  /** The web project root that holds the .env files and `/`-prefixed imports. */
  root: string;
  mode?: string;
  envPrefixes?: string[];
  /**
   * Turn `import()` into in-bundle `require()`. On web, DOM islands then never fetch lazy chunks
   * that live outside the native app; on native, Metro's dev lazy bundles resolve paths against
   * the app folder rather than the web root, and release builds do not split anyway.
   * Defaults to true.
   */
  eagerImports?: boolean;
};

const envCache = new Map<string, ViteEnv>();

const isImportMeta = (t: typeof BabelTypes, node: BabelTypes.Node): boolean =>
  t.isMetaProperty(node) && node.meta.name === 'import' && node.property.name === 'meta';

const isImportMetaMember = (t: typeof BabelTypes, node: BabelTypes.Node, name: string) =>
  t.isMemberExpression(node) &&
  isImportMeta(t, node.object) &&
  !node.computed &&
  t.isIdentifier(node.property, { name });

const memberName = (t: typeof BabelTypes, node: BabelTypes.MemberExpression) => {
  if (!node.computed && t.isIdentifier(node.property)) return node.property.name;
  if (t.isStringLiteral(node.property)) return node.property.value;
  return undefined;
};

const stringValues = (t: typeof BabelTypes, node: BabelTypes.Node | undefined) => {
  if (t.isStringLiteral(node)) return [node.value];
  if (t.isArrayExpression(node)) return node.elements.flatMap((element) => (t.isStringLiteral(element) ? [element.value] : []));
  return [];
};

const optionValue = (t: typeof BabelTypes, options: BabelTypes.Node | undefined, key: string) => {
  if (!t.isObjectExpression(options)) return undefined;
  for (const property of options.properties) {
    if (!t.isObjectProperty(property)) continue;
    const name = t.isIdentifier(property.key) ? property.key.name : t.isStringLiteral(property.key) ? property.key.value : undefined;
    if (name !== key) continue;
    if (t.isStringLiteral(property.value) || t.isBooleanLiteral(property.value)) return property.value.value;
  }
  return undefined;
};

/** Babel plugin that gives Metro the Vite-only module features: import.meta.env and import.meta.glob. */
const readOptions = (raw: object): ViteCompatBabelOptions => {
  const root: unknown = Reflect.get(raw, 'root');
  const mode: unknown = Reflect.get(raw, 'mode');
  const envPrefixes: unknown = Reflect.get(raw, 'envPrefixes');
  const eagerImports: unknown = Reflect.get(raw, 'eagerImports');
  if (typeof root !== 'string') throw new Error('native-readiness/babel: the "root" option is required.');
  return {
    root,
    ...(typeof mode === 'string' ? { mode } : {}),
    ...(typeof eagerImports === 'boolean' ? { eagerImports } : {}),
    ...(Array.isArray(envPrefixes) && envPrefixes.every((prefix) => typeof prefix === 'string') ? { envPrefixes } : {}),
  };
};

export default function viteCompatBabel(api: PluginAPI, rawOptions: object): PluginObject<PluginPass> {
  const t = api.types;
  const options = readOptions(rawOptions);
  const root = path.resolve(options.root);
  const mode = options.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const cacheKey = `${root}|${mode}|${(options.envPrefixes ?? []).join(',')}`;
  const env = envCache.get(cacheKey) ?? loadViteEnv(root, mode, options.envPrefixes);
  envCache.set(cacheKey, env);
  let globCount = 0;
  const eagerImports = options.eagerImports !== false;
  const eagerImport = api.template.expression(
    'Promise.resolve().then(() => (m => m && m.__esModule ? m : Object.assign({ default: m }, m))(require(SOURCE)))',
  );

  return {
    name: 'native-readiness-vite-compat',
    pre() {
      globCount = 0;
    },
    visitor: {
      // Newer Babel parsers emit ImportExpression for import(); older ones a CallExpression on Import.
      ImportExpression(nodePath: NodePath<BabelTypes.ImportExpression>) {
        const { source } = nodePath.node;
        if (eagerImports && t.isStringLiteral(source)) {
          nodePath.replaceWith(eagerImport({ SOURCE: t.stringLiteral(source.value) }));
        }
      },
      MemberExpression(nodePath: NodePath<BabelTypes.MemberExpression>) {
        const { node } = nodePath;
        if (isImportMetaMember(t, node.object, 'env')) {
          const name = memberName(t, node);
          if (name === undefined) return;
          const value = env[name];
          nodePath.replaceWith(value === undefined ? t.identifier('undefined') : t.valueToNode(value));
          return;
        }
        if (isImportMetaMember(t, node, 'env')) {
          nodePath.replaceWith(t.valueToNode(env));
        }
      },
      CallExpression(nodePath: NodePath<BabelTypes.CallExpression>, state: PluginPass) {
        const { node } = nodePath;
        const [source] = node.arguments;
        if (eagerImports && t.isImport(node.callee) && t.isStringLiteral(source)) {
          nodePath.replaceWith(eagerImport({ SOURCE: t.stringLiteral(source.value) }));
          return;
        }
        if (!isImportMetaMember(t, node.callee, 'glob')) return;
        const filename = state.filename;
        if (!filename) return;
        const [patternsNode, optionsNode] = node.arguments;
        const keys = expandGlobs(stringValues(t, patternsNode), path.dirname(filename), root);
        const eager = optionValue(t, optionsNode, 'eager') === true;
        const importName = optionValue(t, optionsNode, 'import');
        const rawQuery = optionValue(t, optionsNode, 'query');
        const query = typeof rawQuery === 'string' ? (rawQuery.startsWith('?') ? rawQuery : `?${rawQuery}`) : '';
        const callIndex = globCount++;
        const program = nodePath.findParent((parent) => parent.isProgram());

        const properties = keys.map((key, index) => {
          const specifier = `${key}${query}`;
          if (eager) {
            const local = t.identifier(`__vite_glob_${callIndex}_${index}`);
            const specifierNode =
              typeof importName === 'string'
                ? importName === 'default'
                  ? t.importDefaultSpecifier(local)
                  : t.importSpecifier(local, t.identifier(importName))
                : t.importNamespaceSpecifier(local);
            if (program?.isProgram()) {
              program.unshiftContainer('body', t.importDeclaration([specifierNode], t.stringLiteral(specifier)));
            }
            return t.objectProperty(t.stringLiteral(key), t.identifier(local.name));
          }
          const load: BabelTypes.Expression = t.callExpression(t.import(), [t.stringLiteral(specifier)]);
          const loader =
            typeof importName === 'string'
              ? t.callExpression(t.memberExpression(load, t.identifier('then')), [
                  t.arrowFunctionExpression(
                    [t.identifier('m')],
                    t.memberExpression(t.identifier('m'), t.stringLiteral(importName), true),
                  ),
                ])
              : load;
          return t.objectProperty(t.stringLiteral(key), t.arrowFunctionExpression([], loader));
        });
        nodePath.replaceWith(t.objectExpression(properties));
      },
    },
  };
}
