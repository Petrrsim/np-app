import type { Metadata } from "next";
import Link from "next/link";
import { NpLogo } from "@/components/np-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Privacy · NP App" };

/** Public page (outside the auth gate) — linked from the Google OAuth consent screen for the Drive backup. */
export default function PrivacyPage() {
  return (
    <main className="flex flex-1 justify-center p-4 sm:py-10">
      <Card className="w-full max-w-xl">
        <CardHeader className="items-center text-center">
          <NpLogo size={48} />
          <CardTitle className="mt-2">Privacy policy</CardTitle>
          <p className="text-sm text-muted-foreground">NP App · updated 18 Nov 2026</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
          <p>
            NP App is a private, single-user diary. It has no public sign-up and is used only by its
            owner.
          </p>
          <section className="flex flex-col gap-1">
            <h2 className="font-semibold">What is stored</h2>
            <p>
              Diary logs (mood, energy, flow, success, sleep, activities, people, markers and notes) are
              stored in the app&apos;s own database. Notes are encrypted at rest.
            </p>
          </section>
          <section className="flex flex-col gap-1">
            <h2 className="font-semibold">Google Drive access</h2>
            <p>
              The app&apos;s scheduled backup uses Google&apos;s <code>drive.file</code> permission: it can
              only create and update the backup files it made itself, in the owner&apos;s own Google
              Drive. It cannot see, read or change any other file. Notes in the backup are encrypted
              with a passphrase only the owner knows.
            </p>
          </section>
          <section className="flex flex-col gap-1">
            <h2 className="font-semibold">Sharing</h2>
            <p>
              No data is sold, shared with third parties, or used for advertising or analytics. Google
              user data is used only to store the owner&apos;s backup.
            </p>
          </section>
          <section className="flex flex-col gap-1">
            <h2 className="font-semibold">Removing access</h2>
            <p>
              Drive access can be revoked at any time at{" "}
              <a className="underline" href="https://myaccount.google.com/permissions">
                myaccount.google.com/permissions
              </a>
              ; the backup files can be deleted from Drive like any other file.
            </p>
          </section>
          <Link href="/" className="self-center text-muted-foreground underline">
            Back to the app
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
