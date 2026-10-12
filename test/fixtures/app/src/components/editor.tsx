'use dom';

import { useSheetStore } from '@/stores/sheet-store';

type EditorProps = {
  value: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
};

export default function Editor({ value, onChange }: EditorProps) {
  const title = useSheetStore();
  return <div contentEditable onInput={() => onChange(value)}>{title}</div>;
}
