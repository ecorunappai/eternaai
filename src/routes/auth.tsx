import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Eterna AI" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav({ to: "/" });
  }, [user, loading, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) {
      toast.error((res.error as Error).message ?? "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/15 backdrop-blur">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-lg font-semibold">Eterna AI</div>
            <div className="text-[11px] uppercase tracking-widest opacity-80">Digital Protection</div>
          </div>
        </div>
        <div className="space-y-6">
          <h1 className="font-display text-4xl font-semibold leading-tight">Own it. Protect it. Defend it.</h1>
          <p className="text-white/80 max-w-md">AI-powered enforcement across 12+ platforms. Content fingerprinting, identity verification, and automated takedowns in one dashboard.</p>
          <ul className="space-y-2 text-sm text-white/80">
            <li>✓ SHA-256 + perceptual content fingerprints</li>
            <li>✓ Immutable ownership certificates</li>
            <li>✓ AI co-pilot for DMCA & legal drafting</li>
          </ul>
        </div>
        <div className="text-xs text-white/60">Trusted by creators, public figures and enterprise brands.</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-semibold text-foreground">{mode === "signin" ? "Welcome back" : "Create your vault"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to your Eterna AI workspace." : "Start protecting your content in minutes."}</p>
          </div>

          <button onClick={google} disabled={busy} className="w-full h-11 rounded-lg border border-input bg-card text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.27c0-.74-.07-1.45-.2-2.13H12v4.03h5.9a5.06 5.06 0 0 1-2.19 3.32v2.76h3.54c2.07-1.91 3.25-4.72 3.25-7.98z"/><path fill="#34A853" d="M12 23c2.94 0 5.4-.97 7.21-2.64l-3.54-2.76c-.98.66-2.24 1.04-3.67 1.04-2.82 0-5.21-1.9-6.07-4.46H2.27v2.85A10.99 10.99 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.93 14.18a6.62 6.62 0 0 1 0-4.36V6.97H2.27a11 11 0 0 0 0 10.06l3.66-2.85z"/><path fill="#EA4335" d="M12 5.38c1.6 0 3.03.55 4.16 1.62l3.13-3.13C17.4 2.09 14.95 1 12 1A10.99 10.99 0 0 0 2.27 6.97l3.66 2.85C6.79 7.28 9.18 5.38 12 5.38z"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            <div className="flex-1 h-px bg-border" />or<div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
            )}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6} className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
            <button type="submit" disabled={busy} className="w-full h-11 rounded-lg text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: "var(--gradient-violet)" }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to Eterna?" : "Have an account?"}{" "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="font-medium text-primary hover:underline">
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
