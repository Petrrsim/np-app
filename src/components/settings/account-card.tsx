"use client";

import { useState } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MIN_PASSWORD = 8;

/** Signed-in account: email, password change and sign out. */
export function AccountCard() {
  const { user, signOut } = useAuth();
  const [changing, setChanging] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setChanging(false);
    setPassword("");
    setConfirm("");
  }

  async function changePassword() {
    if (password.length < MIN_PASSWORD) {
      toast.error(`Use at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password changed");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Account</CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium text-foreground">{user?.email ?? "…"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {changing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void changePassword();
            }}
          >
            <Input
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="New password"
              aria-label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Repeat new password"
              aria-label="Repeat new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving || !password || !confirm}>
                {saving && <Loader2 className="animate-spin" />}
                Save password
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
              <KeyRound />
              Change password
            </Button>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut />
              Sign out
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
