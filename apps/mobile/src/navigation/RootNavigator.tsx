import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, useColorScheme } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Loader } from '../components/ui';
import { colors } from '../theme';
import { LoginScreen } from '../screens/LoginScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { WorkerHomeScreen } from '../screens/WorkerHomeScreen';
import { SupervisorHomeScreen } from '../screens/SupervisorHomeScreen';
import { VoiceScreen } from '../screens/VoiceScreen';
import { IncidentsScreen } from '../screens/IncidentsScreen';
import { MaterialsScreen } from '../screens/MaterialsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { SummaryScreen } from '../screens/SummaryScreen';
import { AudioPoCScreen } from '../screens/AudioPoCScreen';
import { BlockersScreen } from '../screens/BlockersScreen';
import { TasksManageScreen } from '../screens/TasksManageScreen';
import { WorkforceScreen } from '../screens/WorkforceScreen';
import { WorkerDetailScreen } from '../screens/WorkerDetailScreen';
import { CreateIncidentScreen } from '../screens/CreateIncidentScreen';
import { CreateMaterialScreen } from '../screens/CreateMaterialScreen';
import { CreateBlockerScreen } from '../screens/CreateBlockerScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return (
    <Text style={{ color, fontSize: focused ? 12 : 11, fontWeight: focused ? '800' : '600' }}>
      {label}
    </Text>
  );
}

function WorkerTabs() {
  const c = useColorScheme() === 'dark' ? colors.dark : colors.light;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
      }}
    >
      <Tab.Screen name="Home" component={WorkerHomeScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Home" focused={focused} color={color} /> }} />
      <Tab.Screen name="Voice" component={VoiceScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Mic" focused={focused} color={color} /> }} />
      <Tab.Screen name="Incidents" component={IncidentsScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Alert" focused={focused} color={color} /> }} />
      <Tab.Screen name="Materials" component={MaterialsScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Mat" focused={focused} color={color} /> }} />
      <Tab.Screen name="BlockersTab" component={BlockersScreen} options={{ title: 'Blockers', tabBarIcon: ({ focused, color }) => <TabIcon label="Block" focused={focused} color={color} /> }} />
      <Tab.Screen name="Alerts" component={NotificationsScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Bell" focused={focused} color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Me" focused={focused} color={color} /> }} />
    </Tab.Navigator>
  );
}

function SupervisorTabs() {
  const c = useColorScheme() === 'dark' ? colors.dark : colors.light;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
      }}
    >
      <Tab.Screen name="Home" component={SupervisorHomeScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Site" focused={focused} color={color} /> }} />
      <Tab.Screen name="Tasks" component={TasksManageScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Tasks" focused={focused} color={color} /> }} />
      <Tab.Screen name="Workforce" component={WorkforceScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Team" focused={focused} color={color} /> }} />
      <Tab.Screen name="Voice" component={VoiceScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Mic" focused={focused} color={color} /> }} />
      <Tab.Screen name="Incidents" component={IncidentsScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Alert" focused={focused} color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ focused, color }) => <TabIcon label="Me" focused={focused} color={color} /> }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading, onboarded } = useAuth();
  const scheme = useColorScheme();

  if (loading) return <Loader />;

  return (
    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack.Navigator>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : !onboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={user.role === 'SUPERVISOR' ? SupervisorTabs : WorkerTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task' }} />
            <Stack.Screen name="Blockers" component={BlockersScreen} options={{ title: 'Blockers' }} />
            <Stack.Screen name="CreateIncident" component={CreateIncidentScreen} options={{ title: 'New incident' }} />
            <Stack.Screen name="CreateMaterial" component={CreateMaterialScreen} options={{ title: 'Material request' }} />
            <Stack.Screen name="CreateBlocker" component={CreateBlockerScreen} options={{ title: 'Report blocker' }} />
            <Stack.Screen name="Materials" component={MaterialsScreen} options={{ title: 'Materials' }} />
            <Stack.Screen name="Alerts" component={NotificationsScreen} options={{ title: 'Notifications' }} />
            {user.role === 'SUPERVISOR' && (
              <>
                <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Daily summary' }} />
                <Stack.Screen name="WorkerDetail" component={WorkerDetailScreen} options={{ title: 'Worker' }} />
              </>
            )}
            {__DEV__ && (
              <Stack.Screen name="AudioPoC" component={AudioPoCScreen} options={{ title: 'Audio PoC' }} />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}