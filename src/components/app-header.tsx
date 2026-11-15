"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { NpLogo } from "@/components/np-logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/", label: "New Entry" },
  { href: "/history", label: "History" },
  { href: "/dashboard", label: "Dashboard" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <NpLogo size={28} />
          <nav className="flex items-center gap-0.5 rounded-xl bg-muted p-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-sm font-medium transition-all sm:px-3",
                  pathname === l.href
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        {/* Sign out lives on the Settings page (Account). */}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn(pathname === "/settings" && "bg-muted text-foreground")}
        >
          <Link href="/settings" aria-label="Settings" aria-current={pathname === "/settings" ? "page" : undefined}>
            <Settings className="size-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
