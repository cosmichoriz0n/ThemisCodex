"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Role } from "@/types/auth";

const ROLES: { value: Role; label: string }[] = [
  { value: "inventory_staff", label: "Inventory Staff" },
  { value: "inventory_manager", label: "Inventory Manager" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "system_admin", label: "System Administrator" },
  { value: "auditor", label: "Auditor" },
];

const CreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(100),
  password: z.string().min(8, "Minimum 8 characters"),
  role: z.enum(["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"]),
});

const EditSchema = z.object({
  role: z.enum(["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"]),
});

type CreateValues = z.infer<typeof CreateSchema>;
type EditValues = z.infer<typeof EditSchema>;

interface UserFormProps {
  mode: "create";
}
interface UserFormEditProps {
  mode: "edit";
  uid: string;
  currentRole: Role | null;
}

export default function UserForm(props: UserFormProps | UserFormEditProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  if (props.mode === "create") {
    const { register, handleSubmit, formState: { errors, isSubmitting } } =
      useForm<CreateValues>({ resolver: zodResolver(CreateSchema) });

    const onSubmit = async (values: CreateValues) => {
      setServerError(null);
      const res = await fetch("/api/admin/users/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        setServerError(data.error ?? "Failed to create user.");
        return;
      }
      router.push("/admin/users");
      router.refresh();
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input {...register("email")} type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input {...register("displayName")} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.displayName && <p className="text-xs text-red-600 mt-1">{errors.displayName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
          <input {...register("password")} type="password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select {...register("role")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select role…</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {errors.role && <p className="text-xs text-red-600 mt-1">{errors.role.message}</p>}
        </div>
        {serverError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{serverError}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? "Creating…" : "Create Account"}
        </button>
      </form>
    );
  }

  // Edit mode — only role change
  const { uid, currentRole } = props;
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<EditValues>({
      resolver: zodResolver(EditSchema),
      defaultValues: { role: currentRole ?? "inventory_staff" },
    });

  const onSubmit = async (values: EditValues) => {
    setServerError(null);
    const res = await fetch(`/api/admin/users/${uid}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = await res.json();
      setServerError(data.error ?? "Failed to update role.");
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-3 items-end">
      <div className="flex-1">
        <select {...register("role")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {errors.role && <p className="text-xs text-red-600 mt-1">{errors.role.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-medium px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
        {isSubmitting ? "Saving…" : "Update Role"}
      </button>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
    </form>
  );
}
