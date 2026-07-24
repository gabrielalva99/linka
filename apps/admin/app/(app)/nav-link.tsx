"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md bg-surface-2 px-3 py-2 text-sm font-medium"
          : "rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2"
      }
    >
      {label}
    </Link>
  );
}
