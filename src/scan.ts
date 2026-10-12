import ts from 'typescript';
import { RULES } from './rules.js';
import { splitVariants, unsupportedTailwindTokens } from './tailwind.js';
import type { RuleId } from './types.js';

export type ImportRef = { specifier: string; line: number; column: number };

export type LocalFinding = { rule: RuleId; line: number; column: number; message: string };

export type PropIssue = { name: string; kind: 'function' | 'node'; line: number; column: number };

export type ExportSignature = {
  name: string;
  propsType?: string;
  props?: string[];
};

export type FileScan = {
  imports: ImportRef[];
  findings: LocalFinding[];
  isDomRoot: boolean;
  hasDefaultExport: boolean;
  usesContext: boolean;
  propIssues: PropIssue[];
  exports: ExportSignature[];
};

const DOM_GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location']);
const WEB_ONLY_ELEMENTS = new Set(['iframe', 'canvas', 'video', 'audio', 'object', 'embed']);
const CLASS_ATTRIBUTES = new Set(['className', 'class', 'tw']);
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classnames', 'cx', 'cva', 'tv', 'twMerge', 'twJoin']);
export const DEFAULT_BREAKPOINT_HOOKS = ['useMediaQuery', 'useBreakpoint', 'useBreakpointValue', 'useIsMobile'];
const WIDTH_PROPERTIES = new Set(['innerWidth', 'outerWidth']);
const HOVER_VARIANT = /^(hover|group-hover|peer-hover)$/;
const PRESS_VARIANT = /^(focus|focus-within|focus-visible|group-focus|group-focus-within|peer-focus|active|group-active)$/;
const HIDDEN_UTILITY = /^(opacity-0|invisible|hidden)$/;
const REVEAL_UTILITY = /^(opacity-(?!0$)\d+|visible|block|flex|inline-flex|inline-block|grid|contents)$/;
const HOVER_HANDLERS = ['onMouseEnter', 'onMouseOver'];
const PRESS_HANDLERS = ['onClick', 'onPress', 'onFocus', 'onPointerDown', 'onTouchStart', 'onKeyDown'];
const NODE_TYPE_PATTERN = /\b(ReactNode|ReactElement|JSX\.Element|Ref|RefObject|MutableRefObject|ForwardedRef)\b/;

const isTypeOnlyImport = (node: ts.ImportDeclaration) => node.importClause?.isTypeOnly === true;

const collectStrings = (node: ts.Node, out: ts.Node[]) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head, ...node.templateSpans.map((span) => span.literal));
  }
  ts.forEachChild(node, (child) => collectStrings(child, out));
};

const literalText = (node: ts.Node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)
    ? node.text
    : '';

const collectDeclaredNames = (sourceFile: ts.SourceFile) => {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) {
      if (node.name) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
};

const hasDirective = (sourceFile: ts.SourceFile, directive: string) => {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === directive) return true;
  }
  return false;
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

const findDefaultExport = (sourceFile: ts.SourceFile) => {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) return statement;
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some((element) => element.name.text === 'default')
    ) {
      return statement;
    }
  }
  return undefined;
};

const findLocalType = (sourceFile: ts.SourceFile, name: string) => {
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return statement.type;
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) return statement;
  }
  return undefined;
};

const componentParameter = (sourceFile: ts.SourceFile, exported: ts.Node | undefined) => {
  if (!exported) return undefined;
  if (ts.isFunctionDeclaration(exported)) return exported.parameters[0];
  if (ts.isExportAssignment(exported)) {
    const expression = exported.expression;
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression.parameters[0];
    if (ts.isIdentifier(expression)) {
      for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === expression.text) {
          return statement.parameters[0];
        }
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            const init = declaration.initializer;
            if (
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === expression.text &&
              init &&
              (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
            ) {
              return init.parameters[0];
            }
          }
        }
      }
    }
  }
  return undefined;
};

const propsMembers = (sourceFile: ts.SourceFile, type: ts.TypeNode | undefined) => {
  if (!type) return undefined;
  if (ts.isTypeLiteralNode(type)) return type.members;
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const local = findLocalType(sourceFile, type.typeName.text);
    if (local && (ts.isTypeLiteralNode(local) || ts.isInterfaceDeclaration(local))) return local.members;
  }
  return undefined;
};

const memberName = (member: ts.TypeElement) =>
  member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) ? member.name.text : undefined;

const signatureOf = (sourceFile: ts.SourceFile, name: string, fn: ts.SignatureDeclarationBase | undefined) => {
  const type = fn?.parameters[0]?.type;
  const members = propsMembers(sourceFile, type);
  const signature: ExportSignature = { name };
  if (type && ts.isTypeReferenceNode(type)) signature.propsType = type.typeName.getText(sourceFile);
  if (members) signature.props = members.map(memberName).filter((value) => value !== undefined).sort();
  return signature;
};

const collectExports = (sourceFile: ts.SourceFile): ExportSignature[] => {
  const signatures: ExportSignature[] = [];
  const functionOf = (name: string) => {
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const init = declaration.initializer;
          if (ts.isIdentifier(declaration.name) && declaration.name.text === name && init) {
            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
          }
        }
      }
    }
    return undefined;
  };
  for (const statement of sourceFile.statements) {
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement) && exported) {
      signatures.push(signatureOf(sourceFile, isDefault ? 'default' : (statement.name?.text ?? 'default'), statement));
    } else if (ts.isClassDeclaration(statement) && exported) {
      signatures.push({ name: isDefault ? 'default' : (statement.name?.text ?? 'default') });
    } else if (ts.isVariableStatement(statement) && exported) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        signatures.push(signatureOf(sourceFile, declaration.name.text, functionOf(declaration.name.text)));
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const target = ts.isIdentifier(statement.expression) ? functionOf(statement.expression.text) : undefined;
      signatures.push(signatureOf(sourceFile, 'default', target));
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (!statement.exportClause) signatures.push({ name: `* from ${statement.moduleSpecifier?.getText(sourceFile) ?? ''}` });
      else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) signatures.push(signatureOf(sourceFile, element.name.text, functionOf((element.propertyName ?? element.name).text)));
        }
      }
    }
  }
  return signatures.sort((a, b) => a.name.localeCompare(b.name));
};

const collectPropIssues = (sourceFile: ts.SourceFile, exported: ts.Node | undefined): PropIssue[] => {
  const parameter = componentParameter(sourceFile, exported);
  const members = propsMembers(sourceFile, parameter?.type);
  if (!members) return [];
  return members.flatMap((member): PropIssue[] => {
    if (!member.name || !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))) return [];
    const name = member.name.text;
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));
    const position = { line: line + 1, column: character + 1 };
    if (ts.isMethodSignature(member)) return [{ name, kind: 'function', ...position }];
    if (!ts.isPropertySignature(member) || !member.type) return [];
    if (ts.isFunctionTypeNode(member.type)) return [{ name, kind: 'function', ...position }];
    if (name === 'children' || name === 'ref' || NODE_TYPE_PATTERN.test(member.type.getText(sourceFile))) {
      return [{ name, kind: 'node', ...position }];
    }
    return [];
  });
};

export const scanFile = (
  fileName: string,
  text: string,
  options: { breakpointHooks?: string[] } = {},
): FileScan => {
  const breakpointHooks = new Set(options.breakpointHooks ?? DEFAULT_BREAKPOINT_HOOKS);
  const kind = /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const declared = collectDeclaredNames(sourceFile);
  const imports: ImportRef[] = [];
  const findings: LocalFinding[] = [];
  const domTags = new Map<string, number>();
  let firstDomTag: ts.Node | undefined;
  const twTokens: string[] = [];
  let firstTwNode: ts.Node | undefined;
  const seenGlobals = new Set<string>();
  let usesContext = false;
  let importMetaReported = false;
  const breakpoints: string[] = [];
  let firstBreakpoint: ts.Node | undefined;
  const reveals: string[] = [];
  let firstReveal: ts.Node | undefined;
  const noteBreakpoint = (node: ts.Node, label: string) => {
    firstBreakpoint ??= node;
    if (!breakpoints.includes(label)) breakpoints.push(label);
  };

  const position = (node: ts.Node) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: line + 1, column: character + 1 };
  };
  const report = (rule: RuleId, node: ts.Node, message: string) =>
    findings.push({ rule, ...position(node), message });
  const addImport = (specifier: ts.StringLiteralLike) =>
    imports.push({ specifier: specifier.text, ...position(specifier) });
  const addClassStrings = (node: ts.Node) => {
    const strings: ts.Node[] = [];
    collectStrings(node, strings);
    for (const stringNode of strings) {
      const classList = literalText(stringNode).split(/\s+/).filter(Boolean);
      const variantsOf = (token: string) => splitVariants(token).slice(0, -1);
      const utilityOf = (token: string) => splitVariants(token).pop() ?? '';
      const hasPress = classList.some((token) => variantsOf(token).some((variant) => PRESS_VARIANT.test(variant)));
      const startsHidden = classList.some((token) => variantsOf(token).length === 0 && HIDDEN_UTILITY.test(token));
      const hoverReveals = classList.filter(
        (token) =>
          variantsOf(token).some((variant) => HOVER_VARIANT.test(variant)) && REVEAL_UTILITY.test(utilityOf(token)),
      );
      if (startsHidden && !hasPress && hoverReveals.length > 0) {
        firstReveal ??= stringNode;
        reveals.push(...hoverReveals);
      }
      const tokens = unsupportedTailwindTokens(classList.join(' '));
      if (tokens.length === 0) continue;
      firstTwNode ??= stringNode;
      twTokens.push(...tokens);
    }
  };

  const visitTag = (tagName: ts.JsxTagNameExpression, attributes: ts.JsxAttributes) => {
    const tag = tagName.getText(sourceFile);
    const names = attributes.properties.flatMap((attribute) =>
      ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) ? [attribute.name.text] : [],
    );
    const hoverHandlers = names.filter((name) => HOVER_HANDLERS.includes(name));
    if (hoverHandlers.length > 0 && !names.some((name) => PRESS_HANDLERS.includes(name))) {
      report('hover-only', tagName, `<${tag}> reacts to ${hoverHandlers.join(', ')} with no press or focus handler.`);
    }
    if (!ts.isIdentifier(tagName) || !/^[a-z]/.test(tagName.text)) return;
    if (WEB_ONLY_ELEMENTS.has(tag)) {
      report('web-only-element', tagName, `<${tag}> has no native counterpart.`);
    } else {
      firstDomTag ??= tagName;
      domTags.set(tag, (domTags.get(tag) ?? 0) + 1);
    }
    for (const attribute of attributes.properties) {
      if (ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && /^contenteditable$/i.test(attribute.name.text)) {
        report('content-editable', attribute, `<${tag} contentEditable> needs a browser.`);
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !isTypeOnlyImport(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addImport(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      const [first] = node.arguments;
      const isImportCall = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isImportCall || isRequire) && first && ts.isStringLiteralLike(first)) addImport(first);
      if (ts.isIdentifier(node.expression) && CLASS_HELPERS.has(node.expression.text)) {
        node.arguments.forEach(addClassStrings);
      }
      const callee = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : undefined;
      if (callee === 'matchMedia' || (callee !== undefined && breakpointHooks.has(callee))) {
        noteBreakpoint(node, `${callee}()`);
      }
      if (
        (ts.isIdentifier(node.expression) && node.expression.text === 'useContext') ||
        (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'useContext')
      ) {
        usesContext = true;
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      visitTag(node.tagName, node.attributes);
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === 'dangerouslySetInnerHTML') {
        report('dangerous-html', node, 'dangerouslySetInnerHTML renders raw HTML.');
      }
      if (CLASS_ATTRIBUTES.has(node.name.text) && node.initializer) addClassStrings(node.initializer);
    }
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      DOM_GLOBALS.has(node.expression.text) &&
      !declared.has(node.expression.text) &&
      !seenGlobals.has(node.expression.text)
    ) {
      seenGlobals.add(node.expression.text);
      report('dom-global', node, `Reads the browser global \`${node.expression.text}\`.`);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      WIDTH_PROPERTIES.has(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'window'
    ) {
      noteBreakpoint(node, `window.${node.name.text}`);
    }
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && !importMetaReported) {
      importMetaReported = true;
      report('import-meta', node, `\`${node.getText(sourceFile)}\` is not available under Metro.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (firstDomTag) {
    const tags = [...domTags.entries()].map(([tag, count]) => (count > 1 ? `${tag} x${count}` : tag)).join(', ');
    report('dom-element', firstDomTag, `Intrinsic elements: ${tags}.`);
  }
  if (firstTwNode) {
    report('tw-unsupported', firstTwNode, `Unsupported classes: ${[...new Set(twTokens)].join(', ')}.`);
  }

  if (firstBreakpoint) {
    report('js-breakpoint', firstBreakpoint, `Layout reads the width in JavaScript: ${breakpoints.join(', ')}.`);
  }
  if (firstReveal) {
    report('hover-only', firstReveal, `Revealed only on hover: ${[...new Set(reveals)].join(', ')}.`);
  }

  const defaultExport = findDefaultExport(sourceFile);
  return {
    imports,
    findings: findings.sort((a, b) => a.line - b.line || a.column - b.column),
    isDomRoot: hasDirective(sourceFile, 'use dom'),
    hasDefaultExport: defaultExport !== undefined,
    usesContext,
    propIssues: collectPropIssues(sourceFile, defaultExport),
    exports: collectExports(sourceFile),
  };
};

export const ruleImpact = (rule: RuleId) => RULES[rule].impact;
