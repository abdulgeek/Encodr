"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { useAuth } from "@/lib/client/auth-context";

// Provided as-is. It calls useAuth().login() — which you implement in lib/client/auth-context.tsx.
export default function SignInPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "demo@encodr.dev", password: "" },
  });

  useEffect(() => {
    if (ready && user) router.replace("/jobs");
  }, [ready, user, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      router.replace("/jobs");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Login failed");
    }
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">🎬 Encodr</h1>
      <p className="mb-6 text-sm text-neutral-500">Sign in to manage your encode jobs.</p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            {...register("email")}
            type="email"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            autoComplete="username"
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            {...register("password")}
            type="password"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            autoComplete="current-password"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-neutral-400">
        Demo login: demo@encodr.dev / password123
      </p>
    </div>
  );
}
