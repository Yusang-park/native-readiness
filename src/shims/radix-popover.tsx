/** @jsxImportSource nativewind */
import type { WebProps } from '../primitives/primitives.js';
import { Nothing, OverlayClose, OverlayLayer, OverlayRoot, OverlayTrigger, Passthrough } from './overlay.js';

// Native stand-in for @radix-ui/react-popover. Content opens as a sheet above the screen
// instead of anchoring to the trigger.
export const Root = OverlayRoot;
export const Trigger = OverlayTrigger;
export const Close = OverlayClose;
export const Anchor = Passthrough;
export const Portal = Passthrough;
export const Arrow = Nothing;
export const Content = (props: WebProps) => <OverlayLayer {...props} placement="bottom" />;
