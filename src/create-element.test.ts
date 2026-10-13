import { transformSync } from '@babel/core';
import { describe, expect, it } from 'vitest';
import createElementPlugin from './create-element-babel.js';

const transform = (code: string, sourceType: 'module' | 'script' = 'module') =>
  transformSync(code, { filename: '/x/node_modules/lib/index.js', babelrc: false, configFile: false, sourceType, plugins: [createElementPlugin] })?.code ?? '';

describe('createElement babel plugin', () => {
  it('rewrites React.createElement calls from an ES import', () => {
    const code = transform("import React from 'react';\nexport const A = () => React.createElement('div', null, 'hi');");
    expect(code).toContain('native-readiness/jsx-runtime');
    expect(code).not.toContain('React.createElement(');
  });

  it('rewrites createElement imported by name', () => {
    const code = transform("import { createElement } from 'react';\nexport const A = () => createElement('svg');");
    expect(code).not.toMatch(/[^_]createElement\('svg'\)/);
    expect(code).toContain('native-readiness/jsx-runtime');
  });

  it('rewrites CommonJS output from tsc and Babel', () => {
    const tsc = transform("var React = require('react');\nexports.A = function () { return React.createElement('div'); };", 'script');
    const babel = transform("var _react = _interopRequireDefault(require('react'));\nexports.A = () => _react.default.createElement('span');", 'script');
    expect(tsc).toContain('native-readiness/jsx-runtime');
    expect(babel).toContain('native-readiness/jsx-runtime');
    expect(babel).not.toContain('_react.default.createElement(');
  });

  it('also rewrites NativeWind\'s createInteropElement, which its plugin may have produced first', () => {
    const code = transform("var _ReactNativeCSSInterop = _interopRequireWildcard(require('react-native-css-interop'));\nexports.A = () => _ReactNativeCSSInterop.createInteropElement('div', null);", 'script');
    expect(code).not.toContain('_ReactNativeCSSInterop.createInteropElement(');
    expect(code).toContain('native-readiness/jsx-runtime');
  });

  it('rewrites createInteropElement imported as an ES namespace', () => {
    const code = transform("import * as _ReactNativeCSSInterop from 'react-native-css-interop';\nexport const A = () => _ReactNativeCSSInterop.createInteropElement('div', null);");
    expect(code).not.toContain('_ReactNativeCSSInterop.createInteropElement(');
  });

  it('leaves createElement from other modules alone', () => {
    const code = transform("import { createElement } from 'other';\nexport const A = () => createElement('div');");
    expect(code).not.toContain('native-readiness');
  });
});
