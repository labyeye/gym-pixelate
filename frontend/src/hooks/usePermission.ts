import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/gym";

type CrudOp = "create" | "read" | "update" | "delete";

const MANAGER_ROLES: UserRole[] = ["gym_owner", "branch_manager"];

export function usePermission() {
  const { user } = useAuth();

  function can(_resource: string, op: CrudOp): boolean {
    if (!user) return false;
    if (user.role === "gym_owner") return true;
    if (op === "read") return true;
    return MANAGER_ROLES.includes(user.role);
  }

  return { can };
}
