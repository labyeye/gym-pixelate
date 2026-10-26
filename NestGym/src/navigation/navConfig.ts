// Mirrors frontend/src/config/navigation.ts (web sidebar) — same groups, same role access.
import {
  Apple, BadgeCheck, BarChart3, CalendarDays, ClipboardList, Coins, Crown, Dumbbell, LayoutDashboard, Layers, LockKeyhole, Megaphone,
  Receipt, Ruler, Settings, ShieldCheck, ShoppingBag, Tag, UserCog, Users, Wallet, Wrench,
} from 'lucide-react-native';
import { UserRole } from '../contexts/AuthContext';
import { ModuleFlags, routeEnabled } from '../config/modules';

export interface NavItem { title: string; route: string; icon: any; roles: UserRole[] }
export interface NavGroup { label: string; items: NavItem[] }

const ALL: UserRole[] = ['gym_owner', 'branch_manager', 'receptionist', 'trainer', 'accountant'];
const MANAGERS: UserRole[] = ['gym_owner', 'branch_manager'];
const DESK: UserRole[] = ['gym_owner', 'branch_manager', 'receptionist'];
const COACHES: UserRole[] = ['gym_owner', 'branch_manager', 'trainer'];
const MONEY: UserRole[] = ['gym_owner', 'branch_manager', 'accountant'];

const groups: NavGroup[] = [
  { label: 'Overview', items: [{ title: 'Dashboard', route: 'Dashboard', icon: LayoutDashboard, roles: ALL }] },
  {
    label: 'Members',
    items: [
      { title: 'Members', route: 'Members', icon: Users, roles: [...DESK, 'trainer'] },
      { title: 'Memberships', route: 'Memberships', icon: BadgeCheck, roles: [...DESK, 'trainer'] },
      { title: 'Membership Plans', route: 'Plans', icon: Layers, roles: MANAGERS },
      { title: 'Lockers', route: 'Lockers', icon: LockKeyhole, roles: [...DESK, 'trainer'] },
    ],
  },
  {
    label: 'Training',
    items: [
      { title: 'Group Classes', route: 'Classes', icon: CalendarDays, roles: [...DESK, 'trainer'] },
      { title: 'Personal Training', route: 'PersonalTraining', icon: Dumbbell, roles: [...DESK, 'trainer'] },
      { title: 'Workout & Diet', route: 'WorkoutDiet', icon: Apple, roles: COACHES },
      { title: 'Body Progress', route: 'Measurements', icon: Ruler, roles: [...DESK, 'trainer'] },
      { title: 'Trainers', route: 'Trainers', icon: ClipboardList, roles: [...DESK, 'trainer'] },
    ],
  },
  {
    label: 'Sales & Billing',
    items: [
      { title: 'Invoices & Payments', route: 'Invoices', icon: Receipt, roles: [...DESK, 'accountant'] },
      { title: 'Shop / POS', route: 'Pos', icon: ShoppingBag, roles: [...DESK, 'accountant'] },
      { title: 'Coupons & Offers', route: 'Coupons', icon: Tag, roles: MANAGERS },
    ],
  },
  {
    label: 'Business',
    items: [
      { title: 'Reports & Insights', route: 'Reports', icon: BarChart3, roles: MONEY },
      { title: 'Expenses', route: 'Expenses', icon: Wallet, roles: MONEY },
      { title: 'Staff & Payroll', route: 'Staff', icon: UserCog, roles: [...MANAGERS, 'accountant'] },
      { title: 'Equipment', route: 'Equipment', icon: Wrench, roles: [...MANAGERS, 'trainer'] },
      { title: 'Announcements', route: 'Announcements', icon: Megaphone, roles: MANAGERS },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Subscription', route: 'Subscription', icon: Crown, roles: ['gym_owner'] },
      { title: 'WhatsApp Credits', route: 'Credits', icon: Coins, roles: ['gym_owner', 'branch_manager'] },
      { title: 'Security', route: 'Security', icon: ShieldCheck, roles: ALL },
      { title: 'Settings', route: 'Settings', icon: Settings, roles: ALL },
    ],
  },
];

export const navGroupsForRole = (role: UserRole, modules?: ModuleFlags): NavGroup[] =>
  groups
    .map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(role) && routeEnabled(modules, i.route)) }))
    .filter(g => g.items.length);
export const canOpen = (role: UserRole, route: string, modules?: ModuleFlags) =>
  routeEnabled(modules, route) && groups.some(g => g.items.some(i => i.route === route && i.roles.includes(role)));
