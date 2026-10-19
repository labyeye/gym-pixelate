export type UserRole =
  | "gym_owner"
  | "branch_manager"
  | "receptionist"
  | "trainer"
  | "accountant"
  | "member";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  department?: string;
  employeeId?: string;
  status: "active" | "inactive";
  lastLogin?: string;
}

export const roleLabels: Record<UserRole, string> = {
  gym_owner: "Gym Owner",
  branch_manager: "Branch Manager",
  receptionist: "Receptionist",
  trainer: "Trainer",
  accountant: "Accountant",
  member: "Member",
};

export interface Branch {
  _id?: string;
  id?: string;
  name: string;
  address?: string;
  phone?: string;
  active?: boolean;
}

export interface Member {
  _id?: string;
  id?: string;
  name: string;
  email?: string;
  phone: string;
  gender?: "male" | "female" | "other";
  dob?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  photoUrl?: string;
  faceRegistered?: boolean;
  status: "active" | "inactive" | "expired";
  membershipStatus?: "active" | "expired" | "none";
  createdAt?: string;
}

export type PlanType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "annual"
  | "corporate"
  | "custom";

export interface MembershipPlan {
  _id?: string;
  id?: string;
  name: string;
  type: PlanType;
  durationDays: number;
  price: number;
  gstPercent: number;
  active: boolean;
}

export interface Membership {
  _id?: string;
  id?: string;
  member: string | Member;
  plan: string | MembershipPlan;
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "cancelled";
  amountPaid?: number;
}

export type AttendanceMethod = "face" | "manual" | "qr";

export interface Attendance {
  _id?: string;
  id?: string;
  member: string | Member;
  checkInTime: string;
  checkOutTime?: string;
  method: AttendanceMethod;
  confidence?: number;
}

export interface Invoice {
  _id?: string;
  id?: string;
  invoiceNumber: string;
  member: string | Member;
  membership?: string | Membership;
  amount: number;
  gstAmount: number;
  total: number;
  paymentMethod: "cash" | "card" | "upi" | "netbanking" | "other";
  status: "paid" | "pending" | "cancelled";
  createdAt?: string;
}

export interface TrainerAssignment {
  _id?: string;
  id?: string;
  trainer: string | User;
  member: string | Member;
  assignedAt?: string;
}
