// Babel plugin for compiled libraries that build DOM elements with React.createElement
// (icon packs, legacy UI kits). It routes those calls through native-readiness's
// createElement, which maps HTML and SVG tags to React Native primitives.
import { addNamed } from '@babel/helper-module-imports';
import type { NodePath, PluginObject, PluginPass, types as BabelTypes } from '@babel/core';

type Babel = { types: typeof BabelTypes };

const SOURCE = 'native-readiness/jsx-runtime';

export default function createElementBabel({ types: t }: Babel): PluginObject<PluginPass & { replacement?: BabelTypes.Identifier }> {
  const isRequireOf = (node: BabelTypes.Node | null | undefined, source: string): boolean =>
    t.isCallExpression(node) &&
    ((t.isIdentifier(node.callee, { name: 'require' }) && t.isStringLiteral(node.arguments[0], { value: source })) ||
      node.arguments.some((argument) => isRequireOf(argument, source)));
  const isReactRequire = (node: BabelTypes.Node | null | undefined) => isRequireOf(node, 'react');

  // NativeWind's own Babel plugin may already have turned createElement into this.
  const isInteropCreate = (path: NodePath, callee: BabelTypes.Node) => {
    if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property, { name: 'createInteropElement' }) || !t.isIdentifier(callee.object)) {
      return false;
    }
    const declaration = path.scope.getBinding(callee.object.name)?.path;
    if (!declaration) return false;
    if (declaration.isImportNamespaceSpecifier() || declaration.isImportDefaultSpecifier()) {
      const parent = declaration.parentPath;
      return parent?.isImportDeclaration() === true && parent.node.source.value === 'react-native-css-interop';
    }
    return declaration.isVariableDeclarator() && isRequireOf(declaration.node.init, 'react-native-css-interop');
  };

  const isReactBinding = (path: NodePath, name: string) => {
    const binding = path.scope.getBinding(name);
    if (!binding) return false;
    const declaration = binding.path;
    if (declaration.isImportDefaultSpecifier() || declaration.isImportNamespaceSpecifier() || declaration.isImportSpecifier()) {
      const parent = declaration.parentPath;
      return parent?.isImportDeclaration() === true && parent.node.source.value === 'react';
    }
    return declaration.isVariableDeclarator() && isReactRequire(declaration.node.init);
  };

  const isReactObject = (path: NodePath, node: BabelTypes.Node): boolean => {
    if (t.isIdentifier(node)) return isReactBinding(path, node.name);
    // `_react.default.createElement` (Babel's interop output)
    return t.isMemberExpression(node) && t.isIdentifier(node.property, { name: 'default' }) && isReactObject(path, node.object);
  };

  const isCreateElement = (path: NodePath, callee: BabelTypes.Node): boolean => {
    if (t.isSequenceExpression(callee)) {
      const last = callee.expressions[callee.expressions.length - 1];
      return last !== undefined && isCreateElement(path, last);
    }
    if (t.isMemberExpression(callee)) {
      return t.isIdentifier(callee.property, { name: 'createElement' }) && !callee.computed && isReactObject(path, callee.object);
    }
    if (t.isIdentifier(callee, { name: 'createElement' })) {
      const binding = path.scope.getBinding('createElement');
      const declaration = binding?.path;
      return (
        declaration?.isImportSpecifier() === true &&
        declaration.parentPath?.isImportDeclaration() === true &&
        declaration.parentPath.node.source.value === 'react'
      );
    }
    return false;
  };

  return {
    name: 'native-readiness-create-element',
    visitor: {
      // Runs at Program entry, ahead of NativeWind's plugin, which rewrites createElement there too.
      Program(program, state) {
        program.traverse({
          CallExpression(path) {
            if (!isCreateElement(path, path.node.callee) && !isInteropCreate(path, path.node.callee)) return;
            state.replacement ??= addNamed(path, 'createElement', SOURCE, { nameHint: 'nativeCreateElement' });
            path.node.callee = t.cloneNode(state.replacement);
          },
        });
      },
    },
  };
}
export { domRenderingPackages, isDomRenderingModule } from './dom-packages.js';
