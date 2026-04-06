import type { Role } from "./auth";

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  password: string;
  role: Role;
  forcePasswordReset?: boolean;
}

export interface UpdateUserRoleRequest {
  role: Role;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
