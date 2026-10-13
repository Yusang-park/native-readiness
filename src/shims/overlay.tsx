/** @jsxImportSource nativewind */
import { cloneElement, createContext, isValidElement, useContext, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { H, type WebEvent, type WebProps } from '../primitives/primitives.js';

type OverlayState = { open: boolean; setOpen: (open: boolean) => void };

const OverlayContext = createContext<OverlayState>({ open: false, setOpen: () => undefined });

export const useOverlay = () => useContext(OverlayContext);

export type RootProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode };

/** Controlled or uncontrolled open state, the way Radix roots work. */
export const OverlayRoot = ({ open, defaultOpen = false, onOpenChange, children }: RootProps) => {
  const [internal, setInternal] = useState(defaultOpen);
  const value: OverlayState = {
    open: open ?? internal,
    setOpen: (next) => {
      if (open === undefined) setInternal(next);
      onOpenChange?.(next);
    },
  };
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
};

type ActionProps = WebProps & { asChild?: boolean };

const withAction = (action: (state: OverlayState) => void) =>
  function OverlayAction({ asChild, children, onClick, ...props }: ActionProps) {
    const state = useOverlay();
    const run = (event: WebEvent) => {
      onClick?.(event);
      if (!event.defaultPrevented) action(state);
    };
    if (asChild && isValidElement<{ onClick?: (event: WebEvent) => void }>(children)) {
      const childClick = children.props.onClick;
      return cloneElement(children, {
        onClick: (event: WebEvent) => {
          childClick?.(event);
          run(event);
        },
      });
    }
    return (
      <H.button {...props} onClick={run}>
        {children}
      </H.button>
    );
  };

export const OverlayTrigger = withAction((state) => state.setOpen(!state.open));
export const OverlayClose = withAction((state) => state.setOpen(false));

export const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const Nothing = (_props: Record<string, unknown>) => null;

type LayerProps = WebProps & { placement: 'center' | 'bottom' };

/** Overlay content in a top-level native layer; tapping outside closes it. */
export const OverlayLayer = ({ placement, children, className, style }: LayerProps) => {
  const { open, setOpen } = useOverlay();
  if (!open) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => setOpen(false)}>
      <View className={placement === 'center' ? 'flex-1 items-center justify-center p-4' : 'flex-1 justify-end p-4'}>
        <Pressable className="absolute inset-0 bg-black/40" accessibilityLabel="Close" onPress={() => setOpen(false)} />
        <H.div className={className} style={style}>
          {children}
        </H.div>
      </View>
    </Modal>
  );
};
