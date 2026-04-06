"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginValues = z.infer<typeof LoginSchema>;

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/wrong-password": "Incorrect password.",
  "auth/user-not-found": "No account found with this email.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait and try again.",
  "auth/user-disabled": "This account has been deactivated.",
};

export default function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      const credential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const idToken = await credential.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        setServerError(
          data.error === "ACCOUNT_DEACTIVATED"
            ? "Your account has been deactivated. Contact your administrator."
            : "Sign-in failed. Please try again."
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setServerError(FIREBASE_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-xl p-8 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          {...register("email")}
          type="email"
          autoComplete="email"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="you@cooperative.ph"
        />
        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input
          {...register("password")}
          type="password"
          autoComplete="current-password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
      </div>

      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{serverError}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
