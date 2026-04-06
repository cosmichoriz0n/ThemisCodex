import LoginForm from "@/components/auth/LoginForm";

// Never statically prerender — Firebase client SDK must run on the client
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign In — IMIS" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">IMIS</h1>
          <p className="text-sm text-gray-500 mt-1">Inventory Management Information System</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
