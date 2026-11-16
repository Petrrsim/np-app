import { EntryForm } from "@/components/entry-form";

export default function NewEntryPage() {
  return (
    // Phones: exactly one screen tall (small viewport = Safari toolbars shown) so Save stays in view;
    // the Note box absorbs the leftover height. Taller content (an open picker) just scrolls.
    <main className="flex flex-1 justify-center px-4 py-6 max-sm:min-h-[calc(100svh-3.5rem-1px)] max-sm:flex-none max-sm:py-3">
      <EntryForm />
    </main>
  );
}
