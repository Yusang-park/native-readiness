export type IconName = 'plus' | 'minus';

export function Icon({ name }: { name: IconName }) {
  return <i className={name} />;
}
