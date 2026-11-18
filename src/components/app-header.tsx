"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanSearch, Settings, type LucideIcon } from "lucide-react";
import { NpLogo } from "@/components/np-logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// `short` / `Icon` replace the label on phones, where four full labels don't fit.
const links: { href: string; label: string; short?: string; Icon?: LucideIcon }[] = [
  { href: "/", label: "New Entry", short: "New" },
  { href: "/history", label: "History" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/detective", label: "Detective", Icon: ScanSearch },
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
                aria-label={l.label}
                className={cn(
                  "flex min-h-7 items-center rounded-lg px-2.5 py-1 text-sm font-medium transition-all sm:px-3",
                  pathname === l.href
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.Icon ? (
                  <>
                    <l.Icon className="size-4 sm:hidden" aria-hidden />
                    <span className="hidden sm:inline">{l.label}</span>
                  </>
                ) : l.short ? (
                  <>
                    <span className="sm:hidden">{l.short}</span>
                    <span className="hidden sm:inline">{l.label}</span>
                  </>
                ) : (
                  l.label
                )}
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
