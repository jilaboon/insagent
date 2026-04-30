"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Eye, EyeOff, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("אימייל או סיסמה שגויים");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("שגיאת התחברות — נסו שוב");
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-full items-center justify-center px-4 py-12"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, rgba(167,139,250,0.12) 0%, rgba(255,255,255,0) 50%), " +
          "radial-gradient(80% 60% at 50% 100%, rgba(240,171,252,0.10) 0%, rgba(255,255,255,0) 60%), " +
          "linear-gradient(180deg, #FAFAF7 0%, #F4F2EE 100%)",
      }}
    >
      <div className="relative w-full max-w-sm">
        {/* Brand block — same vocabulary as the sidebar */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div
            className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{
              background:
                "linear-gradient(135deg, #818CF8 0%, #A78BFA 55%, #F0ABFC 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 22px -6px rgba(167,139,250,0.7)",
            }}
            aria-hidden
          >
            <Target className="h-6 w-6" strokeWidth={2.25} />
          </div>
          <h1
            className="text-3xl font-extrabold leading-none tracking-tight"
            style={{
              backgroundImage:
                "linear-gradient(100deg, #4338CA 0%, #7C3AED 50%, #C026D3 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            זרקור
          </h1>
          <p className="text-center text-xs text-surface-500">
            ממקד את המשרד במה שחשוב עכשיו
          </p>
        </div>

        {/* Login card — prism glass */}
        <Card padding="lg">
          <h2 className="mb-6 text-center text-base font-semibold text-surface-900">
            התחברות למערכת
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-medium text-surface-700"
              >
                אימייל
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                placeholder="email@example.com"
                className="w-full rounded-lg border border-white/80 bg-white/85 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 backdrop-blur-md transition-colors focus:border-violet-400/60 focus:bg-white/95 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium text-surface-700"
              >
                סיסמה
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  placeholder="********"
                  className="w-full rounded-lg border border-white/80 bg-white/85 px-3.5 py-2.5 pl-10 text-sm text-surface-900 placeholder:text-surface-400 backdrop-blur-md transition-colors focus:border-violet-400/60 focus:bg-white/95 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 transition-colors hover:text-violet-700"
                  tabIndex={-1}
                  aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-rose-300/60 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-700 backdrop-blur-md">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מתחבר...
                </>
              ) : (
                "התחבר"
              )}
            </Button>
          </form>
        </Card>

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px] text-surface-400">
          גישה מורשית בלבד
        </p>
      </div>
    </div>
  );
}
