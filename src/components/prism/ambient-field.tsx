/**
 * AmbientField
 * -------------
 * Fixed-ish, pointer-events-none ambient background used inside the main
 * dashboard content area (NOT the sidebar). It renders:
 *
 *   - 4 large blurred radial-gradient "blobs" (indigo, violet, cyan, rose)
 *     each on its own drift animation at different speeds
 *   - a very faint noise/grain overlay (inline SVG data URI)
 *   - a conic-gradient lens flare in one corner
 *
 * It must be rendered INSIDE a `relative overflow-hidden` wrapper so the
 * blur haze is clipped to the main content area and never bleeds across
 * the sidebar.
 *
 * Motion respects `prefers-reduced-motion` via the globals.css rules
 * that target `[data-prism-motion]`.
 */

// Very small SVG noise — inlined once, base64-encoded so we don't need a
// network roundtrip. 3% opacity on an `overlay` blend keeps it subliminal.
const NOISE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>
       <filter id='n'>
         <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>
         <feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.7 0'/>
       </filter>
       <rect width='100%' height='100%' filter='url(#n)'/>
     </svg>`
  );

export function AmbientField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Base tint — extremely soft wash, sits below the blobs. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(238,242,255,0.9) 0%, rgba(251,247,255,0.85) 45%, rgba(255,241,249,0.9) 100%)",
        }}
      />

      {/* Blob field — blurred, saturated, blend-mode: screen so the
          colors layer additively without washing the UI above. */}
      <div
        className="absolute -inset-[10%]"
        style={{
          filter: "blur(70px) saturate(1.15)",
          opacity: 0.85,
        }}
      >
        {/* Indigo — top-right, slowest */}
        <div
          data-prism-motion="blob"
          className="absolute rounded-full"
          style={{
            top: "-8%",
            right: "-6%",
            width: "48rem",
            height: "48rem",
            mixBlendMode: "screen",
            willChange: "transform",
            background:
              "radial-gradient(circle at 30% 30%, #818CF8 0%, rgba(129,140,248,0.45) 40%, transparent 70%)",
            animation: "prism-float-a 22s ease-in-out infinite",
          }}
        />
        {/* Violet — left, medium */}
        <div
          data-prism-motion="blob"
          className="absolute rounded-full"
          style={{
            top: "18%",
            left: "-10%",
            width: "42rem",
            height: "42rem",
            mixBlendMode: "screen",
            willChange: "transform",
            background:
              "radial-gradient(circle at 60% 40%, #A78BFA 0%, rgba(167,139,250,0.45) 40%, transparent 70%)",
            animation: "prism-float-b 28s ease-in-out infinite",
          }}
        />
        {/* Cyan — bottom-right, slowest-but-wider */}
        <div
          data-prism-motion="blob"
          className="absolute rounded-full"
          style={{
            bottom: "-12%",
            right: "12%",
            width: "38rem",
            height: "38rem",
            mixBlendMode: "screen",
            willChange: "transform",
            background:
              "radial-gradient(circle at 50% 50%, #22D3EE 0%, rgba(34,211,238,0.35) 40%, transparent 70%)",
            animation: "prism-float-c 32s ease-in-out infinite",
          }}
        />
        {/* Rose — bottom-left, drifts opposite */}
        <div
          data-prism-motion="blob"
          className="absolute rounded-full"
          style={{
            bottom: "10%",
            left: "20%",
            width: "30rem",
            height: "30rem",
            mixBlendMode: "screen",
            willChange: "transform",
            background:
              "radial-gradient(circle at 40% 60%, #F0ABFC 0%, rgba(240,171,252,0.35) 40%, transparent 70%)",
            animation: "prism-float-d 36s ease-in-out infinite reverse",
          }}
        />
      </div>

      {/* Lens flare — corner conic-gradient, barely visible. Sits in the
          TOP-LEFT of the content area (which in this RTL app is the
          "far" corner from the sidebar). */}
      <div
        data-prism-motion="flare"
        className="absolute rounded-full"
        style={{
          top: "3rem",
          left: "4rem",
          width: "18rem",
          height: "18rem",
          filter: "blur(36px)",
          mixBlendMode: "screen",
          opacity: 0.55,
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%), " +
            "conic-gradient(from 220deg, rgba(240,171,252,0.35), rgba(129,140,248,0.25), rgba(34,211,238,0.2), rgba(240,171,252,0.35))",
          WebkitMaskImage:
            "radial-gradient(closest-side, black, transparent 75%)",
          maskImage:
            "radial-gradient(closest-side, black, transparent 75%)",
          animation: "prism-breathe-soft 14s ease-in-out infinite",
        }}
      />

      {/* Noise — very low-opacity grain so flat glass surfaces don't
          look plastic. Uses `overlay` blend for subtle texture. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${NOISE_SVG}")`,
          backgroundSize: "220px 220px",
          opacity: 0.03,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}
