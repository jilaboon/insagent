"use client";

import Link from "next/link";
import { STUDIO_VARIANTS } from "./_shared/mock-queue";

/**
 * Studio — aesthetic preview gallery.
 * Each tile gives a glance at one UI variant before you click into it.
 * This page itself is deliberately minimal — it should recede and let
 * the variants speak.
 */
export default function StudioIndexPage() {
  return (
    <div className="-m-8 min-h-screen bg-neutral-950 p-0 text-neutral-100">
      {/* Masthead */}
      <div className="border-b border-neutral-800 px-10 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
              InsAgent · Studio
            </p>
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-white">
              ארבעה ניסויים באסתטיקה
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-400">
              אותם נתונים, ארבעה עולמות חזותיים שונים. לחצו על הכרטיס כדי להיכנס.
              המטרה: לצאת מהקופסה של ״אפליקציה שנראית כמו AI״.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs text-neutral-400 underline-offset-4 hover:text-white hover:underline"
          >
            חזרה לדשבורד ←
          </Link>
        </div>
      </div>

      {/* 4 variant tiles */}
      <div className="grid grid-cols-1 gap-px bg-neutral-800 md:grid-cols-2">
        {STUDIO_VARIANTS.map((variant) => (
          <VariantTile key={variant.slug} variant={variant} />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-800 px-10 py-6 text-[11px] uppercase tracking-[0.2em] text-neutral-600">
        בחרו אסתטיקה ·  ניסוי עיצובי · InsAgent
      </div>
    </div>
  );
}

function VariantTile({
  variant,
}: {
  variant: (typeof STUDIO_VARIANTS)[number];
}) {
  const [bg, text, accent] = variant.palette;

  // Each tile previews in its own aesthetic using the palette
  return (
    <Link
      href={`/studio/${variant.slug}`}
      className="group relative overflow-hidden transition-transform duration-300"
      style={{ backgroundColor: bg, color: text }}
    >
      <div className="relative flex min-h-[360px] flex-col justify-between p-10">
        {/* Top row — label + arrow */}
        <div className="flex items-start justify-between">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.3em] opacity-60"
            style={{ color: text }}
          >
            № {variant.slug.toUpperCase()}
          </span>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            className="opacity-30 transition-all duration-300 group-hover:-translate-x-2 group-hover:opacity-100"
            style={{ color: text }}
            aria-hidden="true"
          >
            <path
              d="M19 12H5m7 7l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Middle — title + tagline */}
        <div>
          <div
            className="text-sm font-medium opacity-60"
            style={{ color: text }}
          >
            {variant.title}
          </div>
          <h2
            className="mt-2 text-5xl font-bold leading-tight tracking-tight"
            style={{ color: text, fontFamily: getFontForVariant(variant.slug) }}
          >
            {variant.titleHe}
          </h2>
          <p
            className="mt-4 max-w-xs text-sm leading-relaxed opacity-75"
            style={{ color: text }}
          >
            {variant.taglineHe}
          </p>
          <p
            className="mt-1 font-mono text-[11px] uppercase tracking-wider opacity-45"
            style={{ color: text }}
          >
            {variant.tagline}
          </p>
        </div>

        {/* Bottom — palette swatches */}
        <div className="flex items-center gap-3">
          {variant.palette.map((color, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-6 w-6 rounded-full border border-black/10"
                style={{ backgroundColor: color }}
              />
              <span
                className="font-mono text-[10px] tracking-wider opacity-55"
                style={{ color: text }}
              >
                {color}
              </span>
            </div>
          ))}
        </div>

        {/* Accent flourish — animated stripe that reveals on hover */}
        <div
          className="absolute bottom-0 left-0 h-1 w-0 transition-all duration-500 group-hover:w-full"
          style={{ backgroundColor: accent }}
        />
      </div>
    </Link>
  );
}

function getFontForVariant(slug: string): string {
  switch (slug) {
    case "editorial":
      return `'Frank Ruhl Libre', serif`;
    case "atelier":
      return `'Frank Ruhl Libre', serif`;
    case "terminal":
      return `'JetBrains Mono', monospace`;
    case "prism":
      return `Heebo, sans-serif`;
    default:
      return `Heebo, sans-serif`;
  }
}
