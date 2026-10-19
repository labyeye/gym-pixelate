import React, { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DoorOpen, LayoutDashboard, Menu, Receipt, Users } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { C, FONT } from '../theme';
import TabBounce from '../components/motion/TabBounce';
import Pop from '../components/motion/Pop';
import FadeInUp from '../components/motion/FadeInUp';
import { canOpen } from './navConfig';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MembersScreen from '../screens/MembersScreen';
import MemberProfileScreen from '../screens/MemberProfileScreen';
import FrontDeskScreen from '../screens/FrontDeskScreen';
import InvoicesScreen from '../screens/InvoicesScreen';
import FollowUpsScreen from '../screens/FollowUpsScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import MemberPortalScreen from '../screens/MemberPortalScreen';
import MoreScreen from '../screens/MoreScreen';
import {
  AnnouncementsScreen, CouponsScreen, EnquiriesScreen, EquipmentScreen, ExpensesScreen, LockersScreen, MeasurementsScreen, PlansScreen,
} from '../screens/gym/Resources';
import { StaffScreen, TrainersScreen } from '../screens/gym/TeamScreens';
import { ClassesScreen, PersonalTrainingScreen } from '../screens/gym/TrainingScreens';
import WorkoutDietScreen from '../screens/gym/WorkoutDietScreen';
import PosScreen from '../screens/gym/PosScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Screens reachable from the "More" menu, keyed by the route name in navConfig.
// (Members / FrontDesk / Invoices are bottom tabs, so they are not repeated here.)
const MORE_SCREENS: Record<string, React.ComponentType<any>> = {
  Enquiries: EnquiriesScreen,
  FollowUps: FollowUpsScreen,
  Plans: PlansScreen,
  Lockers: LockersScreen,
  Classes: ClassesScreen,
  PersonalTraining: PersonalTrainingScreen,
  WorkoutDiet: WorkoutDietScreen,
  Measurements: MeasurementsScreen,
  Trainers: TrainersScreen,
  Pos: PosScreen,
  Coupons: CouponsScreen,
  Reports: ReportsScreen,
  Expenses: ExpensesScreen,
  Staff: StaffScreen,
  Equipment: EquipmentScreen,
  Announcements: AnnouncementsScreen,
  Subscription: SubscriptionScreen,
  Settings: SettingsScreen,
};

function Tabs() {
  const { user, modules } = useAuth();
  const role = user!.role;
  const insets = useSafeAreaInsets();
  const tabs: [string, string, any, React.ComponentType<any>][] = [
    ['Dashboard', 'Home', LayoutDashboard, DashboardScreen],
    ...(canOpen(role, 'Members', modules) ? [['Members', 'Members', Users, MembersScreen] as any] : []),
    ...(canOpen(role, 'FrontDesk', modules) ? [['FrontDesk', 'Desk', DoorOpen, FrontDeskScreen] as any] : []),
    ...(canOpen(role, 'Invoices', modules) ? [['Invoices', 'Billing', Receipt, InvoicesScreen] as any] : []),
    ['More', 'More', Menu, MoreScreen],
  ];
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: C.black,
        tabBarActiveBackgroundColor: C.secondary,
        tabBarStyle: {
          borderTopWidth: 2,
          borderTopColor: C.black,
          backgroundColor: C.white,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontFamily: FONT.bold, fontSize: 10, textTransform: 'uppercase' },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      {tabs.map(([name, label, Icon, comp]) => (
        <Tab.Screen
          key={name}
          name={name}
          component={comp}
          options={{ tabBarLabel: label, tabBarIcon: ({ color, focused }) => <TabBounce focused={focused}><Icon size={20} color={color} /></TabBounce> }}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, tenant, modules, isAuthenticated, isLoading } = useAuth();
  // new owners finish the onboarding wizard (gym details -> plan -> pay or trial) before anything else,
  // then see the welcome page once
  const needsOnboarding = isAuthenticated && user?.role === 'gym_owner' && !!tenant && tenant.onboarded === false;
  const wasOnboarding = useRef(false);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (needsOnboarding) wasOnboarding.current = true;
    else if (wasOnboarding.current && isAuthenticated) {
      wasOnboarding.current = false;
      setWelcome(true);
    }
  }, [needsOnboarding, isAuthenticated]);
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F6FF' }}>
        <Pop>
          <Image source={require('../assets/logo_long.png')} style={{ width: 220, height: 80 }} resizeMode="contain" />
        </Pop>
        <FadeInUp delay={300} distance={10}>
          <Text style={{ fontFamily: FONT.bold, marginTop: 6, color: C.black, fontSize: 12, textTransform: 'uppercase' }}>Loading…</Text>
        </FadeInUp>
      </View>
    );
  }
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : needsOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : welcome ? (
          <Stack.Screen name="Welcome">{() => <WelcomeScreen onDone={() => setWelcome(false)} />}</Stack.Screen>
        ) : user!.role === 'member' ? (
          <Stack.Screen name="Portal" component={MemberPortalScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={Tabs} />
            {Object.entries(MORE_SCREENS)
              .filter(([route]) => route === 'Settings' || canOpen(user!.role, route, modules))
              .map(([route, comp]) => (
                <Stack.Screen key={route} name={route} component={comp} />
              ))}
            <Stack.Screen name="MemberProfile" component={MemberProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
