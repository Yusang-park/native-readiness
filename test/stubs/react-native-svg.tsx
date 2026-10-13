import { createElement, type ReactNode } from 'react';

const make = (name: string) => {
  const Component = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement('svg-' + name.toLowerCase(), { 'data-svg': name, ...props }, children);
  Component.displayName = name;
  return Component;
};

export const Svg = make('Svg');
export default Svg;
export const Path = make('Path');
export const Circle = make('Circle');
export const Rect = make('Rect');
export const G = make('G');
export const Line = make('Line');
export const Polyline = make('Polyline');
export const Polygon = make('Polygon');
export const Ellipse = make('Ellipse');
export const Defs = make('Defs');
export const LinearGradient = make('LinearGradient');
export const RadialGradient = make('RadialGradient');
export const Stop = make('Stop');
export const ClipPath = make('ClipPath');
export const Mask = make('Mask');
export const Use = make('Use');
export const Symbol = make('Symbol');
export const Text = make('Text');
export const TSpan = make('TSpan');
