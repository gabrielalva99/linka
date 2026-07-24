import Link from "next/link";
import { DEVICE_TYPE, DEVICE_TYPE_TABS, type DeviceType } from "@linka/shared";
import { getMessages } from "@/lib/i18n";

/** Abas por tipo de aparelho — a frota mistura celular, TV e notebook. */
export function TypeTabs({
  active,
  counts,
}: {
  active: DeviceType | null;
  counts: Record<string, number>;
}) {
  const t = getMessages();
  const tabs: { key: DeviceType | null; label: string; count: number }[] = [
    { key: null, label: t.fleet.all, count: Object.values(counts).reduce((a, b) => a + b, 0) },
    ...DEVICE_TYPE.map((ty) => ({
      key: ty as DeviceType | null,
      label: DEVICE_TYPE_TABS[ty],
      count: counts[ty] ?? 0,
    })),
  ];

  return (
    <nav className="mt-6 flex flex-wrap gap-1 border-b border-line">
      {tabs
        // Some os tipos que ninguém usa, para a barra não virar poluição.
        .filter((tab) => tab.key === null || tab.count > 0 || tab.key === active)
        .map((tab) => {
          const on = tab.key === active;
          return (
            <Link
              key={tab.key ?? "all"}
              href={tab.key ? `/frota?tipo=${tab.key}` : "/frota"}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                on
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-muted">{tab.count}</span>
            </Link>
          );
        })}
    </nav>
  );
}
