/** @jsxImportSource nativewind */
import { Image } from "expo-image";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ElementType,
  type ReactNode,
  type Ref,
} from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Mask,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
  Symbol as SvgSymbol,
  TSpan,
  Text as SvgText,
  Use,
} from "react-native-svg";
import {
  gridLayout,
  mergeTextClasses,
  nativeClassName,
  pressStates,
  scrollDirection,
  splitTextClasses,
  resolveDisabled,
  textStateClasses,
} from "./classes.js";
import { useAssetUrl, useNativeNavigate } from "./navigation.js";
import { nativeStyle } from "./style.js";
import { TextClassProvider, useInheritedTextClasses } from "./text-context.js";

/** The element attributes web handlers read from event.target. */
type EventTarget = { value?: string; checked?: boolean; name?: string; id?: string; type?: string };

/** The subset of a DOM event that web handlers commonly read. */
export type WebEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
  defaultPrevented: boolean;
  target: EventTarget;
  currentTarget: EventTarget;
  key?: string;
};

const webEvent = (target: WebEvent["target"] = {}, key?: string): WebEvent => {
  const event: WebEvent = {
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    stopPropagation: () => undefined,
    target,
    currentTarget: target,
    ...(key === undefined ? {} : { key }),
  };
  return event;
};

type Handler = (event: WebEvent) => void;

/** Like a DOM input, the event target carries the element's name, id and type. */
const targetAttributes = (props: Record<string, unknown>): EventTarget => ({
  ...(typeof props.name === "string" ? { name: props.name } : {}),
  ...(typeof props.id === "string" ? { id: props.id } : {}),
  ...(typeof props.type === "string" ? { type: props.type } : {}),
});

/** Props web elements commonly receive. Unknown attributes are accepted and ignored. */
export type WebProps = {
  className?: string;
  style?: unknown;
  children?: ReactNode;
  onClick?: Handler;
  hidden?: boolean;
  role?: string;
  title?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "data-testid"?: string;
  ref?: Ref<unknown>;
  [attribute: string]: unknown;
};

const isDisabled = (props: WebProps) =>
  props.disabled === true || props['aria-disabled'] === true || props['aria-disabled'] === 'true';

const accessibility = (props: WebProps) => ({
  ...(props["aria-label"] === undefined
    ? {}
    : { accessibilityLabel: props["aria-label"] }),
  ...(props["aria-hidden"] === true || props["aria-hidden"] === "true"
    ? {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      }
    : {}),
  ...(props["data-testid"] === undefined
    ? {}
    : { testID: props["data-testid"] }),
});

const InlineMarker = Symbol.for("native-readiness.inline");

/** True inside running text, where links must stay Text to flow inline. */
const InsideTextContext = createContext(false);

const isInline = (child: ReactNode): boolean => {
  if (child === null || child === undefined || typeof child === "boolean")
    return true;
  if (typeof child === "string" || typeof child === "number") return true;
  if (!isValidElement(child)) return false;
  const type: unknown = child.type;
  return typeof type === "function" && Reflect.get(type, InlineMarker) === true;
};

const markInline = <T extends object>(component: T): T =>
  Object.assign(component, { [InlineMarker]: true });

/**
 * Web code passes DOM refs; on native the same ref receives the React Native instance
 * (enough for focus() and measure()). The element type cannot be known statically.
 */
const nativeRef = <T,>(ref: unknown) => ref as Ref<T> | undefined;

/**
 * Bare strings cannot sit inside a View. Runs of inline content become one Text so that
 * "Hello <b>you</b>" stays on one line; other children are left as they are.
 */
const isTextLike = (child: ReactNode) =>
  typeof child === "string" || typeof child === "number";

const renderChildren = (children: ReactNode, textClass: string) => {
  // Children.toArray is only used to inspect; the original children are rendered so React's
  // element bookkeeping stays on the elements it created.
  const list = Children.toArray(children);
  if (list.length === 0) return null;
  if (!list.some(isTextLike)) return children;
  if (list.every(isInline)) {
    return (
      <InsideTextContext.Provider value>
        <Text className={textClass}>{children}</Text>
      </InsideTextContext.Provider>
    );
  }
  return Children.map(children, (child) =>
    isTextLike(child) ? <Text className={textClass}>{child}</Text> : child,
  );
};

const CONTENT_LAYOUT =
  /^(flex|inline-flex|grid|gap-|gap-x-|gap-y-|space-[xy]-|items-|justify-|content-|p-|px-|py-|pt-|pr-|pb-|pl-|ps-|pe-|flex-(row|col|wrap))/;

const splitScrollClasses = (className: string) => {
  const tokens = className.split(/\s+/).filter(Boolean);
  const isLayout = (token: string) =>
    CONTENT_LAYOUT.test(token.slice(token.lastIndexOf(":") + 1));
  return {
    outer: tokens.filter((token) => !isLayout(token)).join(" "),
    content: tokens.filter(isLayout).join(" "),
  };
};

/**
 * Resting and pressed classes for a pressable's box and text, switched on press-in/out.
 * NativeWind's active: styles do not resolve theme colors defined as CSS variables, so the
 * pressed state is tracked here and applied as plain classes.
 */
const usePressClasses = (box: string, text: string) => {
  const [pressed, setPressed] = useState(false);
  const boxStates = pressStates(box);
  const textStates = pressStates(text);
  return {
    box: pressed ? boxStates.pressed : boxStates.rest,
    text: pressed ? textStates.pressed : textStates.rest,
    handlers: { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) },
  };
};

/** Block containers: div, section, main, ul, li, … */
const Box = (props: WebProps) => {
  const { className: rawClassName, children, onClick, hidden, ref } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const inherited = useInheritedTextClasses();
  const { box, text } = splitTextClasses(className);
  const merged = mergeTextClasses(inherited, text);
  const press = usePressClasses(box, merged);
  if (hidden) return null;
  const textClass = onClick ? press.text : textStateClasses(merged);
  const content = renderChildren(children, textClass);
  const style = nativeStyle(props.style);
  // A label on a plain container would make iOS treat the whole subtree as one element, hiding
  // its contents from accessibility; only interactive containers keep it.
  // As on the web, a clickable div is not a button unless its role says so; making it one would
  // also hide any buttons inside it from accessibility.
  const interactive = props.role === 'button' || props.role === 'link' || props.role === 'img';
  const { accessibilityLabel: _label, ...unlabelled } = accessibility(props);
  const shared = { ...(interactive ? accessibility(props) : unlabelled), ...(style ? { style } : {}) };
  const scroll = scrollDirection(className);
  const grid = gridLayout(box);

  let element: ReactNode;
  if (grid) {
    const cells = Children.toArray(content);
    const rows: ReactNode[][] = [];
    for (let index = 0; index < cells.length; index += grid.columns)
      rows.push(cells.slice(index, index + grid.columns));
    element = (
      <View
        ref={nativeRef<View>(ref)}
        className={`${grid.rest} ${grid.rowGap}`}
        {...shared}
      >
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className={`flex-row ${grid.columnGap}`}>
            {Array.from({ length: grid.columns }, (_, column) => (
              <View key={column} className="min-w-0 flex-1">
                {row[column] ?? null}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  } else if (scroll) {
    const { outer, content: layout } = splitScrollClasses(box);
    element = (
      <ScrollView
        ref={nativeRef<ScrollView>(ref)}
        horizontal={scroll === "horizontal"}
        className={outer}
        contentContainerClassName={layout}
        {...shared}
      >
        {content}
      </ScrollView>
    );
  } else if (onClick) {
    element = (
      <Pressable
        ref={nativeRef<View>(ref)}
        className={press.box}
        onPress={() => onClick(webEvent())}
        {...press.handlers}
        accessible={interactive}
        {...(interactive ? { accessibilityRole: props.role === 'link' ? ('link' as const) : ('button' as const) } : {})}
        {...shared}
      >
        {content}
      </Pressable>
    );
  } else {
    element = (
      <View ref={nativeRef<View>(ref)} className={box} {...shared}>
        {content}
      </View>
    );
  }
  // Always wrapped, so the tree keeps its shape (and children stay mounted) when text classes change.
  return <TextClassProvider value={textClass}>{element}</TextClassProvider>;
};

/** Inline text: span, p, h1–h6, strong, label, … */
const Span = markInline((props: WebProps) => {
  const { className: rawClassName, children, onClick, hidden, ref } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const inherited = useInheritedTextClasses();
  const merged = mergeTextClasses(inherited, className);
  const press = usePressClasses('', merged);
  if (hidden) return null;
  const textClass = onClick ? press.text : textStateClasses(merged);
  const style = nativeStyle(props.style);
  return (
    <TextClassProvider value={textClass}>
      <InsideTextContext.Provider value>
        <Text
          ref={nativeRef<Text>(ref)}
          className={textClass}
          {...(onClick
            ? { onPress: () => onClick(webEvent()), suppressHighlighting: true, ...press.handlers }
            : {})}
          {...accessibility(props)}
          {...(style ? { style } : {})}
        >
          {children}
        </Text>
      </InsideTextContext.Provider>
    </TextClassProvider>
  );
});

const Br = markInline(() => <Text>{"\n"}</Text>);

const Hr = ({ className }: WebProps) => (
  <View
    className={`h-px w-full bg-current opacity-20 ${nativeClassName(className)}`}
  />
);

type FormContextValue = { submit: () => void };
const FormContext = createContext<FormContextValue | null>(null);

const Form = (props: WebProps) => {
  const { onSubmit, children } = props;
  const submit = () => {
    if (typeof onSubmit === "function") onSubmit(webEvent());
  };
  return (
    <FormContext.Provider value={{ submit }}>
      <Box {...props} onSubmit={undefined}>
        {children}
      </Box>
    </FormContext.Provider>
  );
};

const Button = (props: WebProps) => {
  const {
    className: rawClassName,
    children,
    onClick,
    disabled,
    type,
    hidden,
    ref,
  } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const form = useContext(FormContext);
  const inherited = useInheritedTextClasses();
  const { box, text } = splitTextClasses(className);
  const pressClasses = usePressClasses(box, mergeTextClasses(inherited, text));
  if (hidden) return null;
  const textClass = pressClasses.text;
  const style = nativeStyle(props.style);
  const press = () => {
    if (disabled === true) return;
    const event = webEvent();
    onClick?.(event);
    if (type === "submit" && !event.defaultPrevented) form?.submit();
  };
  return (
    <TextClassProvider value={textClass}>
      <Pressable
        ref={nativeRef<View>(ref)}
        className={pressClasses.box}
        disabled={disabled === true}
        onPress={press}
        {...pressClasses.handlers}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled === true }}
        {...accessibility(props)}
        {...(style ? { style } : {})}
      >
        {renderChildren(children, textClass)}
      </Pressable>
    </TextClassProvider>
  );
};

const isExternal = (href: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");

const Anchor = markInline((props: WebProps) => {
  const { className: rawClassName, children, onClick, href, hidden } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const navigate = useNativeNavigate();
  const inherited = useInheritedTextClasses();
  const insideText = useContext(InsideTextContext);
  const { box, text } = splitTextClasses(className);
  const pressClasses = usePressClasses(insideText ? '' : box, mergeTextClasses(inherited, insideText ? className : text));
  if (hidden) return null;
  const follow = () => {
    const event = webEvent();
    onClick?.(event);
    if (
      event.defaultPrevented ||
      typeof href !== "string" ||
      href === "" ||
      href.startsWith("#")
    )
      return;
    if (isExternal(href)) void Linking.openURL(href);
    else navigate?.(href);
  };
  // Inside running text a link stays Text so it flows inline; elsewhere it behaves like a button.
  if (insideText) {
    return (
      <Text
        className={pressClasses.text}
        onPress={follow}
        {...pressClasses.handlers}
        suppressHighlighting
        accessibilityRole="link"
        {...accessibility(props)}
      >
        {children}
      </Text>
    );
  }
  const textClass = pressClasses.text;
  return (
    <TextClassProvider value={textClass}>
      <Pressable
        className={pressClasses.box}
        onPress={follow}
        {...pressClasses.handlers}
        accessibilityRole="link"
        {...accessibility(props)}
      >
        {renderChildren(children, textClass)}
      </Pressable>
    </TextClassProvider>
  );
});

const KEYBOARD: Record<string, KeyboardTypeOptions> = {
  email: "email-address",
  number: "numeric",
  tel: "phone-pad",
  url: "url",
};

const Input = (props: WebProps) => {
  const {
    className: rawClassName,
    type,
    value,
    defaultValue,
    placeholder,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    disabled,
    readOnly,
    maxLength,
    autoFocus,
    checked,
    hidden,
    ref,
  } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const attributes = targetAttributes(props);
  const form = useContext(FormContext);
  const inherited = useInheritedTextClasses();
  if (hidden || type === "hidden") return null;
  const call = (handler: unknown, event: WebEvent) => {
    if (typeof handler === "function") handler(event);
  };
  if (type === "checkbox" || type === "radio") {
    return (
      <Switch
        value={checked === true}
        disabled={disabled === true}
        onValueChange={(next) => call(onChange, webEvent({ ...attributes, checked: next }))}
        {...accessibility(props)}
      />
    );
  }
  if (type === "file") return <Unsupported tag="input type=file" />;
  return (
    <TextInput
      ref={nativeRef<TextInput>(ref)}
      className={mergeTextClasses(inherited, className)}
      {...(typeof value === "string" || typeof value === "number"
        ? { value: String(value) }
        : {})}
      {...(typeof defaultValue === "string" ? { defaultValue } : {})}
      {...(typeof placeholder === "string" ? { placeholder } : {})}
      {...(typeof maxLength === "number" ? { maxLength } : {})}
      {...(typeof type === "string" && KEYBOARD[type]
        ? { keyboardType: KEYBOARD[type] }
        : {})}
      secureTextEntry={type === "password"}
      autoCapitalize={
        type === "email" || type === "password" || type === "url"
          ? "none"
          : "sentences"
      }
      autoFocus={autoFocus === true}
      editable={disabled !== true && readOnly !== true}
      onChangeText={(text) => call(onChange, webEvent({ ...attributes, value: text }))}
      onBlur={() =>
        call(
          onBlur,
          webEvent({ ...attributes, ...(typeof value === "string" ? { value } : {}) }),
        )
      }
      onFocus={() => call(onFocus, webEvent())}
      onSubmitEditing={() => {
        const event = webEvent({}, "Enter");
        call(onKeyDown, event);
        if (!event.defaultPrevented) form?.submit();
      }}
      {...accessibility(props)}
    />
  );
};

const Textarea = (props: WebProps) => {
  const {
    className: rawClassName,
    value,
    defaultValue,
    placeholder,
    onChange,
    disabled,
    rows,
    hidden,
  } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const inherited = useInheritedTextClasses();
  if (hidden) return null;
  return (
    <TextInput
      multiline
      className={mergeTextClasses(inherited, className)}
      {...(typeof value === "string" ? { value } : {})}
      {...(typeof defaultValue === "string" ? { defaultValue } : {})}
      {...(typeof placeholder === "string" ? { placeholder } : {})}
      {...(typeof rows === "number" ? { numberOfLines: rows } : {})}
      editable={disabled !== true}
      onChangeText={(text) => {
        if (typeof onChange === "function") onChange(webEvent({ ...targetAttributes(props), value: text }));
      }}
      {...accessibility(props)}
    />
  );
};

const CONTENT_FIT: Record<
  string,
  "cover" | "contain" | "fill" | "none" | "scale-down"
> = {
  "object-cover": "cover",
  "object-contain": "contain",
  "object-fill": "fill",
  "object-none": "none",
  "object-scale-down": "scale-down",
};

const Img = (props: WebProps) => {
  const { className: rawClassName, src, alt, width, height, hidden } = props;

  const className = resolveDisabled(nativeClassName(rawClassName), isDisabled(props));
  const assetUrl = useAssetUrl();
  if (hidden || typeof src !== "string" || src === "") return null;
  const fit = (className ?? "")
    .split(/\s+/)
    .map((token) => CONTENT_FIT[token])
    .find(Boolean);
  const size = {
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
  };
  return (
    <Image
      source={{ uri: assetUrl(src) }}
      className={className}
      contentFit={fit ?? "cover"}
      accessibilityLabel={typeof alt === "string" ? alt : undefined}
      {...(Object.keys(size).length > 0 ? { style: size } : {})}
    />
  );
};

/** SVG elements map one-to-one onto react-native-svg; web-only attributes are dropped. */
const svgElement =
  (Element: ElementType) =>
  ({
    xmlns,
    xmlnsXlink,
    "aria-hidden": ariaHidden,
    focusable,
    role,
    children,
    ...rest
  }: WebProps) => <Element {...rest}>{children}</Element>;

const Unsupported = ({ tag }: { tag?: unknown }) =>
  process.env.NODE_ENV === "production" ? null : (
    <View className="border border-dashed border-red-400 p-2">
      <Text className="text-xs text-red-500">{`<${String(tag ?? "element")}> is not supported on native`}</Text>
    </View>
  );

export const H = {
  div: Box,
  span: Span,
  br: Br,
  hr: Hr,
  form: Form,
  button: Button,
  a: Anchor,
  input: Input,
  textarea: Textarea,
  img: Img,
  svg: svgElement(Svg),
  path: svgElement(Path),
  circle: svgElement(Circle),
  rect: svgElement(Rect),
  g: svgElement(G),
  line: svgElement(Line),
  polyline: svgElement(Polyline),
  polygon: svgElement(Polygon),
  ellipse: svgElement(Ellipse),
  defs: svgElement(Defs),
  linearGradient: svgElement(LinearGradient),
  radialGradient: svgElement(RadialGradient),
  stop: svgElement(Stop),
  clipPath: svgElement(ClipPath),
  mask: svgElement(Mask),
  use: svgElement(Use),
  symbol: svgElement(SvgSymbol),
  text: svgElement(SvgText),
  tspan: svgElement(TSpan),
  unsupported: Unsupported,
};

const BOX_TAGS = [
  "div",
  "section",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
  "article",
  "ul",
  "ol",
  "li",
  "figure",
  "fieldset",
  "details",
  "summary",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "menu",
  "dialog",
  "search",
  "address",
  "picture",
  "center",
];
const TEXT_TAGS = [
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "small",
  "label",
  "code",
  "pre",
  "blockquote",
  "figcaption",
  "time",
  "mark",
  "abbr",
  "cite",
  "q",
  "sub",
  "sup",
  "kbd",
  "var",
  "del",
  "ins",
  "legend",
  "output",
];

const TAGS: Record<string, ElementType> = {
  ...Object.fromEntries(BOX_TAGS.map((tag) => [tag, Box])),
  ...Object.fromEntries(TEXT_TAGS.map((tag) => [tag, Span])),
  br: Br,
  hr: Hr,
  form: Form,
  button: Button,
  a: Anchor,
  input: Input,
  textarea: Textarea,
  img: Img,
  svg: H.svg,
  path: H.path,
  circle: H.circle,
  rect: H.rect,
  g: H.g,
  line: H.line,
  polyline: H.polyline,
  polygon: H.polygon,
  ellipse: H.ellipse,
  defs: H.defs,
  linearGradient: H.linearGradient,
  radialGradient: H.radialGradient,
  stop: H.stop,
  clipPath: H.clipPath,
  mask: H.mask,
  use: H.use,
  symbol: H.symbol,
  text: H.text,
  tspan: H.tspan,
};

/** The primitive that renders an HTML tag on native, or the unsupported placeholder. */
export const primitiveFor = (tag: string): ElementType =>
  TAGS[tag] ?? Unsupported;
