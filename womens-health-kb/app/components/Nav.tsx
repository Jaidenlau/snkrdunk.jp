"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Journey" },
  { href: "/competitors", label: "Competitors" },
  { href: "/chat", label: "Ask" },
  { href: "/review", label: "Review" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-plum-600 text-white font-serif text-lg">V</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Verified Knowledge Base</div>
            <div className="text-[11px] text-muted -mt-0.5">Pregnancy &amp; Postpartum · 4 markets</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-plum-50 text-plum-700" : "text-muted hover:text-ink hover:bg-line/50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
