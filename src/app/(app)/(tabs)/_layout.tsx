import { Tabs } from 'expo-router';
import { Dumbbell, History, House, ListOrdered, Menu } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';

const iconColor = (focused: boolean) => (focused ? colors.primary : colors.textMuted);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 70,
          paddingTop: 7,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ focused }) => <House color={iconColor(focused)} size={23} /> }}
      />
      <Tabs.Screen
        name="history/index"
        options={{ title: 'History', tabBarIcon: ({ focused }) => <History color={iconColor(focused)} size={23} /> }}
      />
      <Tabs.Screen
        name="workouts/index"
        options={{ title: 'Workouts', tabBarIcon: ({ focused }) => <ListOrdered color={iconColor(focused)} size={23} /> }}
      />
      <Tabs.Screen
        name="exercises/index"
        options={{ title: 'Exercises', tabBarIcon: ({ focused }) => <Dumbbell color={iconColor(focused)} size={23} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ focused }) => <Menu color={iconColor(focused)} size={23} /> }}
      />
    </Tabs>
  );
}
