import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from './ui';

type Project = { id: string; name?: string; code?: string };

export function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
}) {
  const c = useThemeColors();
  if (!projects.length) {
    return (
      <Text style={{ color: c.muted, marginBottom: 12 }}>No projects available</Text>
    );
  }
  return (
    <View style={{ marginBottom: 12, gap: 8 }}>
      <Text style={{ color: c.muted, fontWeight: '600', marginBottom: 4 }}>
        Project
      </Text>
      {projects.map((p) => {
        const selected = p.id === value;
        return (
          <Pressable
            key={p.id}
            onPress={() => onChange(p.id)}
            style={{
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: selected ? c.accent : c.border,
              backgroundColor: selected ? c.accentSoft : c.surface,
            }}
          >
            <Text style={{ color: c.ink, fontWeight: selected ? '800' : '600' }}>
              {p.name || p.code || p.id}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
