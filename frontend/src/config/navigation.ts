import React from "react";
import { UserRole } from "@/types/gym";
import { pathEnabled, type ModuleFlags } from "@/config/modules";
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  Settings,
  LucideIcon,
  ClipboardList,
  CreditCard,
  Layers,
  CalendarDays,
  HeartPulse,
  Apple,
  Ruler,
  Receipt,
  ShoppingBag,
  Tag,
  BarChart3,
  Wallet,
  Wrench,
  Megaphone,
  LockKeyhole,
  Crown,
  UserCog,
} from "lucide-react";

export type NavIconComponent =
  LucideIcon | React.ComponentType<{ className?: string }>;

export interface NavItem {
  title: string;
  href: string;
  icon: NavIconComponent;
  roles: UserRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL_ROLES: UserRole[] = [
  "gym_owner",
  "branch_manager",
  "receptionist",
  "trainer",
  "accountant",
];
const MANAGERS: UserRole[] = ["gym_owner", "branch_manager"];
const DESK: UserRole[] = ["gym_owner", "branch_manager", "receptionist"];
const COACHES: UserRole[] = ["gym_owner", "branch_manager", "trainer"];
const MONEY: UserRole[] = ["gym_owner", "branch_manager", "accountant"];

const allGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        roles: ALL_ROLES,
      },
    ],
  },
  {
    label: "Members",
    items: [
      {
        title: "Members",
        href: "/members",
        icon: Users,
        roles: [...DESK, "trainer"],
      },
      {
        title: "Membership Plans",
        href: "/membership-plans",
        icon: Layers,
        roles: MANAGERS,
      },
      {
        title: "Lockers",
        href: "/lockers",
        icon: LockKeyhole,
        roles: [...DESK, "trainer"],
      },
    ],
  },
  {
    label: "Training",
    items: [
      {
        title: "Group Classes",
        href: "/classes",
        icon: CalendarDays,
        roles: [...DESK, "trainer"],
      },
      {
        title: "Personal Training",
        href: "/personal-training",
        icon: Dumbbell,
        roles: [...DESK, "trainer"],
      },
      {
        title: "Workout & Diet",
        href: "/workout-diet",
        icon: Apple,
        roles: COACHES,
      },
      {
        title: "Trainers",
        href: "/trainers",
        icon: ClipboardList,
        roles: [...DESK, "trainer"],
      },
    ],
  },
  {
    label: "Sales & Billing",
    items: [
      {
        title: "Invoices & Payments",
        href: "/invoices",
        icon: Receipt,
        roles: [...DESK, "accountant"],
      },
      {
        title: "Shop / POS",
        href: "/shop",
        icon: ShoppingBag,
        roles: [...DESK, "accountant"],
      },
      {
        title: "Coupons & Offers",
        href: "/coupons",
        icon: Tag,
        roles: MANAGERS,
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        title: "Reports & Insights",
        href: "/reports",
        icon: BarChart3,
        roles: MONEY,
      },
      { title: "Expenses", href: "/expenses", icon: Wallet, roles: MONEY },
      {
        title: "Equipment",
        href: "/equipment",
        icon: Wrench,
        roles: [...MANAGERS, "trainer"],
      },
      {
        title: "Announcements",
        href: "/announcements",
        icon: Megaphone,
        roles: MANAGERS,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Subscription",
        href: "/subscription",
        icon: Crown,
        roles: ["gym_owner"],
      },
      { title: "Settings", href: "/settings", icon: Settings, roles: MANAGERS },
    ],
  },
];

export const navItems: NavItem[] = allGroups.flatMap((g) => g.items);

export function getNavForRole(role: UserRole) {
  return navItems.filter((item) => item.roles.includes(role));
}

export function getNavGroupsForRole(role: UserRole, modules?: ModuleFlags): NavGroup[] {
  return allGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => item.roles.includes(role) && pathEnabled(modules, item.href)),
    }))
    .filter((g) => g.items.length > 0);
}

// kept so older imports of these icons keep resolving
export const _unusedIcons = { CreditCard, HeartPulse };
