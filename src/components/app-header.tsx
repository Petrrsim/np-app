"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NpLogo } from "@/components/np-logo";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/", label: "New Entry" },
  { href: "/history", label: "History" },
];

export function AppHeader() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <NpLogo size={28} />
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                  pathname === l.href ? "bg-accent text-foreground" : "text-muted-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="Sign out">
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
