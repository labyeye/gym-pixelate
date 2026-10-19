// Optional parts of NestGym the owner can switch off in Settings > Modules (same keys as the web app).
// A module missing from Settings.modules counts as ON. Core screens are always available.
import {
  Apple, CalendarDays, Dumbbell, LockKeyhole, Megaphone, Ruler, ShoppingBag, Tag, UserCog, Wallet, Wrench,
} from 'lucide-react-native';

export interface GymModule {
  key: string;
  label: string;
  desc: string;
  icon: any;
  /** navigation route names (see navigation/navConfig.ts) */
  routes: string[];
}

export const MODULES: GymModule[] = [
  { key: 'pos', label: 'Shop / POS', desc: 'Sell supplements, merchandise and day passes at the desk.', icon: ShoppingBag, routes: ['Pos'] },
  { key: 'personalTraining', label: 'Personal training', desc: 'PT packages, sessions and trainer commission.', icon: Dumbbell, routes: ['PersonalTraining', 'Trainers'] },
  { key: 'classes', label: 'Group classes', desc: 'Class schedule, bookings and waitlist.', icon: CalendarDays, routes: ['Classes'] },
  { key: 'workoutDiet', label: 'Workout & diet plans', desc: 'Workout and diet templates for members.', icon: Apple, routes: ['WorkoutDiet'] },
  { key: 'bodyProgress', label: 'Body progress', desc: 'Weight, measurements and progress tracking.', icon: Ruler, routes: ['Measurements'] },
  { key: 'lockers', label: 'Lockers', desc: 'Locker allotment and rent.', icon: LockKeyhole, routes: ['Lockers'] },
  { key: 'coupons', label: 'Coupons & offers', desc: 'Discount codes and offers.', icon: Tag, routes: ['Coupons'] },
  { key: 'expenses', label: 'Expenses', desc: 'Track gym expenses.', icon: Wallet, routes: ['Expenses'] },
  { key: 'staffPayroll', label: 'Staff & payroll', desc: 'Staff attendance and salaries.', icon: UserCog, routes: ['Staff'] },
  { key: 'equipment', label: 'Equipment', desc: 'Equipment list and maintenance tracker.', icon: Wrench, routes: ['Equipment'] },
  { key: 'announcements', label: 'Announcements', desc: 'Broadcast notices to members.', icon: Megaphone, routes: ['Announcements'] },
];

export type ModuleFlags = Record<string, boolean> | null | undefined;

export const moduleOn = (flags: ModuleFlags, key: string) => flags?.[key] !== false;

export const routeEnabled = (flags: ModuleFlags, route: string) => {
  const m = MODULES.find(x => x.routes.includes(route));
  return !m || moduleOn(flags, m.key);
};
