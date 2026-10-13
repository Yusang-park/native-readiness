// NativeWind adds `className` to React Native's core components.
import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface ScrollViewProps {
    contentContainerClassName?: string;
  }
}
