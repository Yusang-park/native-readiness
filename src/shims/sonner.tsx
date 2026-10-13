/** @jsxImportSource nativewind */
import { useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';
import { H } from '../primitives/primitives.js';

// Native stand-in for sonner. The toast() API is kept; <Toaster /> shows the messages at the top
// of the screen with plain primitives.
type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info' | 'loading';
type ToastOptions = { id?: string | number; description?: ReactNode; duration?: number };
type ToastItem = { id: string | number; type: ToastType; message: ReactNode; description?: ReactNode };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const dismiss = (id?: string | number) => {
  toasts = id === undefined ? [] : toasts.filter((item) => item.id !== id);
  emit();
};

const show = (type: ToastType, message: ReactNode, options: ToastOptions = {}) => {
  const id = options.id ?? nextId++;
  toasts = [...toasts.filter((item) => item.id !== id), { id, type, message, description: options.description }];
  emit();
  const duration = options.duration ?? 4000;
  if (type !== 'loading' && Number.isFinite(duration)) setTimeout(() => dismiss(id), duration);
  return id;
};

type PromiseMessages<T> = {
  loading?: ReactNode;
  success?: ReactNode | ((value: T) => ReactNode);
  error?: ReactNode | ((error: unknown) => ReactNode);
};

const resolveMessage = <V,>(message: ReactNode | ((value: V) => ReactNode), value: V) =>
  typeof message === 'function' ? message(value) : message;

export const toast = Object.assign((message: ReactNode, options?: ToastOptions) => show('default', message, options), {
  success: (message: ReactNode, options?: ToastOptions) => show('success', message, options),
  error: (message: ReactNode, options?: ToastOptions) => show('error', message, options),
  warning: (message: ReactNode, options?: ToastOptions) => show('warning', message, options),
  info: (message: ReactNode, options?: ToastOptions) => show('info', message, options),
  loading: (message: ReactNode, options?: ToastOptions) => show('loading', message, options),
  message: (message: ReactNode, options?: ToastOptions) => show('default', message, options),
  custom: (render: (id: string | number) => ReactNode, options?: ToastOptions) => {
    const id = options?.id ?? nextId++;
    return show('default', render(id), { ...options, id });
  },
  dismiss,
  promise: <T,>(promise: Promise<T> | (() => Promise<T>), messages: PromiseMessages<T>) => {
    const id = show('loading', messages.loading ?? null);
    const pending = typeof promise === 'function' ? promise() : promise;
    pending.then(
      (value) => {
        if (messages.success !== undefined) show('success', resolveMessage(messages.success, value), { id });
        else dismiss(id);
      },
      (error: unknown) => {
        if (messages.error !== undefined) show('error', resolveMessage(messages.error, error), { id });
        else dismiss(id);
      },
    );
    return { unwrap: () => pending };
  },
});

const TONE: Record<ToastType, string> = {
  default: 'bg-white text-gray-900',
  loading: 'bg-white text-gray-900',
  info: 'bg-white text-gray-900',
  success: 'bg-green-50 text-green-800',
  warning: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-800',
};

export function Toaster(_props: Record<string, unknown>) {
  const items = useSyncExternalStore(subscribe, () => toasts, () => toasts);
  if (items.length === 0) return null;
  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 top-12 z-50 items-center gap-2 px-4">
      {items.map((item) => (
        <H.div key={item.id} className={`w-full rounded-lg px-4 py-3 shadow ${TONE[item.type]}`} onClick={() => dismiss(item.id)}>
          <H.span className="text-sm font-semibold">{item.message}</H.span>
          {item.description ? <H.span className="text-sm">{item.description}</H.span> : null}
        </H.div>
      ))}
    </View>
  );
}

export const useSonner = () => ({ toasts: useSyncExternalStore(subscribe, () => toasts, () => toasts) });
export default toast;
