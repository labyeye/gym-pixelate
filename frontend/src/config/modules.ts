import {
  CalendarDays,
  Dumbbell,
  Apple,
  Ruler,
  LockKeyhole,
  ShoppingBag,
  Tag,
  Wallet,
  Wrench,
  Megaphone,
  UserPlus,
  UserCog,
  ScanFace,
  type LucideIcon,
} from "lucide-react";

/**
 * Optional parts of NestGym. The owner can switch each one off in Settings > Modules; its menu
 * entries and pages then disappear. Core screens (members, plans, check-in, invoices, reports,
 * subscription, settings) are always on. A module missing from Settings.modules counts as ON.
 */
export interface GymModule {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  paths: string[];
}

export const MODULES: GymModule[] = [
  { key: "pos", label: "Shop / POS", desc: "Sell supplements, merchandise and day passes at the desk.", icon: ShoppingBag, paths: ["/shop"] },
  { key: "personalTraining", label: "Personal training", desc: "PT packages, sessions and trainer commission.", icon: Dumbbell, paths: ["/personal-training", "/trainers"] },
  { key: "classes", label: "Group classes", desc: "Class schedule, bookings and waitlist.", icon: CalendarDays, paths: ["/classes"] },
  { key: "workoutDiet", label: "Workout & diet plans", desc: "Workout and diet templates for members.", icon: Apple, paths: ["/workout-diet"] },
  { key: "bodyProgress", label: "Body progress", desc: "Weight, measurements and progress tracking.", icon: Ruler, paths: ["/progress"] },
  { key: "enquiries", label: "Enquiries & follow-ups", desc: "Lead enquiries, trials and follow-up reminders.", icon: UserPlus, paths: ["/enquiries", "/follow-ups"] },
  { key: "lockers", label: "Lockers", desc: "Locker allotment and rent.", icon: LockKeyhole, paths: ["/lockers"] },
  { key: "coupons", label: "Coupons & offers", desc: "Discount codes and offers.", icon: Tag, paths: ["/coupons"] },
  { key: "expenses", label: "Expenses", desc: "Track gym expenses.", icon: Wallet, paths: ["/expenses"] },
  { key: "staffPayroll", label: "Staff & payroll", desc: "Staff attendance and salaries.", icon: UserCog, paths: ["/staff"] },
  { key: "equipment", label: "Equipment", desc: "Equipment list and maintenance tracker.", icon: Wrench, paths: ["/equipment"] },
  { key: "announcements", label: "Announcements", desc: "Broadcast notices to members.", icon: Megaphone, paths: ["/announcements"] },
  { key: "faceKiosk", label: "Face kiosk", desc: "Face-recognition check-in screen.", icon: ScanFace, paths: ["/attendance/smart-entry"] },
];

export type ModuleFlags = Record<string, boolean> | null | undefined;

export const moduleOn = (flags: ModuleFlags, key: string) => flags?.[key] !== false;

export function moduleOfPath(path: string): GymModule | undefined {
  return MODULES.find((m) => m.paths.some((p) => path === p || path.startsWith(p + "/")));
}

export const pathEnabled = (flags: ModuleFlags, path: string) => {
  const m = moduleOfPath(path);
  return !m || moduleOn(flags, m.key);
};
