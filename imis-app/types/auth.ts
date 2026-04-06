export type Role =
  | "inventory_staff"
  | "inventory_manager"
  | "finance_officer"
  | "system_admin"
  | "auditor";

export interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  role: Role;
  is_active: boolean;
  cooperative_id: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
}

export interface FirebaseUserRecord {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  role: Role | null;
  cooperativeId: string | null;
  lastSignInTime: string | null;
  creationTime: string | null;
}
