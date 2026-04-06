import UserForm from "@/components/admin/UserForm";

export const metadata = { title: "New User — IMIS Admin" };

export default function NewUserPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Create User Account</h1>
      <UserForm mode="create" />
    </div>
  );
}
