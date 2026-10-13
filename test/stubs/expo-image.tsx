import { Image as RNImage } from 'react-native-web';

type Props = { source?: { uri?: string } | string; accessibilityLabel?: string; className?: string };

export const Image = ({ source, accessibilityLabel }: Props) => (
  <RNImage source={typeof source === 'string' ? { uri: source } : source} accessibilityLabel={accessibilityLabel} />
);
