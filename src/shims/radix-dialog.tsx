/** @jsxImportSource nativewind */
import { H, type WebProps } from '../primitives/primitives.js';
import { Nothing, OverlayClose, OverlayLayer, OverlayRoot, OverlayTrigger, Passthrough } from './overlay.js';

// Native stand-in for @radix-ui/react-dialog. Content renders centered in a native modal layer,
// which supplies its own backdrop, so Overlay renders nothing.
export const Root = OverlayRoot;
export const Trigger = OverlayTrigger;
export const Close = OverlayClose;
export const Portal = Passthrough;
export const Overlay = Nothing;
export const Content = (props: WebProps) => <OverlayLayer {...props} placement="center" />;
export const Title = (props: WebProps) => <H.span {...props} />;
export const Description = (props: WebProps) => <H.span {...props} />;
