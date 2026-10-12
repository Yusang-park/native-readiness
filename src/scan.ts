import ts from 'typescript';
import { RULES } from './rules.js';
import { unsupportedTailwindTokens } from './tailwind.js';
import type { RuleId } from './types.js';

export type ImportRef = { specifier: string; line: number; column: number };

export type LocalFinding = { rule: RuleId; line: number; column: number; message: string };

export type PropIssue = { name: string; kind: 'function' | 'node'; line: number; column: number };

export type FileScan = {
  imports: ImportRef[];
  findings: LocalFinding[];
  isDomRoot: boolean;
  hasDefaultExport: boolean;
  usesContext: boolean;
  propIssues: PropIssue[];
};

const DOM_GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location']);
const WEB_ONLY_ELEMENTS = new Set(['iframe', 'canvas', 'video', 'audio', 'object', 'embed']);
const CLASS_ATTRIBUTES = new Set(['className', 'class', 'tw']);
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classnames', 'cx', 'cva', 'tv', 'twMerge', 'twJoin']);
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

const collectPropIssues = (sourceFile: ts.SourceFile, exported: ts.Node | undefined): PropIssue[] => {
  const parameter = componentParameter(sourceFile, exported);
  if (!parameter?.type) return [];
  let members: ts.NodeArray<ts.TypeElement> | undefined;
  if (ts.isTypeLiteralNode(parameter.type)) members = parameter.type.members;
  if (ts.isTypeReferenceNode(parameter.type) && ts.isIdentifier(parameter.type.typeName)) {
    const local = findLocalType(sourceFile, parameter.type.typeName.text);
    if (local && (ts.isTypeLiteralNode(local) || ts.isInterfaceDeclaration(local))) members = local.members;
  }
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

export const scanFile = (fileName: string, text: string): FileScan => {
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
      const tokens = unsupportedTailwindTokens(literalText(stringNode));
      if (tokens.length === 0) continue;
      firstTwNode ??= stringNode;
      twTokens.push(...tokens);
    }
  };

  const visitTag = (tagName: ts.JsxTagNameExpression, attributes: ts.JsxAttributes) => {
    if (!ts.isIdentifier(tagName) || !/^[a-z]/.test(tagName.text)) return;
    const tag = tagName.text;
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

  const defaultExport = findDefaultExport(sourceFile);
  return {
    imports,
    findings: findings.sort((a, b) => a.line - b.line || a.column - b.column),
    isDomRoot: hasDirective(sourceFile, 'use dom'),
    hasDefaultExport: defaultExport !== undefined,
    usesContext,
    propIssues: collectPropIssues(sourceFile, defaultExport),
  };
};

export const ruleImpact = (rule: RuleId) => RULES[rule].impact;
