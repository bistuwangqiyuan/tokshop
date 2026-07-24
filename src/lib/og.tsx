import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Shared brand renderer for opengraph-image / twitter-image files.
 * Latin text only: the default ImageResponse font has no CJK glyphs.
 */
export function brandImage(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#09090b",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(16,185,129,0.25), transparent 55%)",
          color: "#fafafa",
          fontSize: 30,
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
          <span style={{ color: "#34d399" }}>Tok</span>
          <span>Shop</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: title.length > 60 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 30,
            color: "#a1a1aa",
            maxWidth: 960,
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
