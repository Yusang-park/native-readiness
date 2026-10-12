import { Pressable, Text } from 'react-native';

export function Button({ title }: { title: string }) {
  return (
    <Pressable className="px-4">
      <Text>{title}</Text>
    </Pressable>
  );
}
