export type UserRole = "OWNER" | "ACCOUNTANT" | "FINANCE" | "TAX_AGENT";

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  createdAt: string;
};
