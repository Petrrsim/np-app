import { AuthGate } from "@/components/auth-gate";
import { AppHeader } from "@/components/app-header";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-full flex-1 flex-col">
        <AppHeader />
        {children}
      </div>
    </AuthGate>
  );
}
