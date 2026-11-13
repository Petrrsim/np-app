"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { NpLogo } from "@/components/np-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("simunek.petr@yahoo.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <NpLogo size={56} />
          <CardTitle className="mt-2">NP App</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to your diary</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
