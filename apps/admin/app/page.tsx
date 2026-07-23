import { getMessages } from "@/lib/i18n";

export default function Home() {
  const t = getMessages();

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-3.5 w-3.5 rounded-full bg-primary" />
          <span className="text-2xl font-bold tracking-tight">{t.app.name}</span>
          <span className="ml-auto text-xs text-muted">{t.home.subtitle}</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">{t.app.tagline}</p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          {t.home.phase}
        </div>
      </div>
    </main>
  );
}
