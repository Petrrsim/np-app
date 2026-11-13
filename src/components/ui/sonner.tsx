"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-md border border-border bg-card text-card-foreground shadow-lg",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
