import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { ThemeColors, colors } from '../theme';

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? colors.dark : colors.light;
}

export function Screen({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return <View style={[styles.screen, { backgroundColor: c.bg }]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return <Text style={[styles.title, { color: c.ink }]}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return <Text style={[styles.subtitle, { color: c.muted }]}>{children}</Text>;
}

export function Card({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor: c.accent, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
}) {
  const c = useThemeColors();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.muted, marginBottom: 6, fontSize: 14 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        style={[
          styles.input,
          { color: c.ink, borderColor: c.border, backgroundColor: c.surface },
        ]}
      />
    </View>
  );
}

export function Loader() {
  const c = useThemeColors();
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={c.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 15, marginTop: 6, lineHeight: 22 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});