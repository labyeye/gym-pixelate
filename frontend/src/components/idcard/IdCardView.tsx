import type { CSSProperties } from "react";
import {
  FONT_STACKS,
  cardDims,
  fieldValue,
  qrValue,
  type IdCardTemplate,
  type IdCompany,
  type IdEl,
} from "@/lib/idCard";

/** Absolute URL for an uploaded file path (print windows have no base URL, so relative paths would break). */
export function assetUrl(path?: string): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const origin =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, "") ||
    window.location.origin;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

interface Props {
  template: IdCardTemplate;
  side: "front" | "back";
  employee: any;
  company: IdCompany;
  /** QR images keyed by the text they encode (built ahead of time, so this stays a pure render). */
  qrMap?: Record<string, string>;
}

const gradientOf = (a: string, b: string, angle: number) =>
  `linear-gradient(${angle}deg, ${a}, ${b})`;

/** CSS background for one side: an optional image on top of a solid colour or a two-colour gradient. */
const sideBackground = (s: { bg: string; bg2?: string; bgAngle?: number; bgImage?: string }) => {
  const layers: string[] = [];
  if (s.bgImage) layers.push(`url("${assetUrl(s.bgImage)}") center / cover no-repeat`);
  layers.push(s.bg2 ? gradientOf(s.bg, s.bg2, s.bgAngle ?? 135) : s.bg);
  return layers.join(", ");
};

const initials = (emp: any) =>
  (emp?.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "ID";

const borderOf = (el: IdEl) =>
  el.borderWidth > 0 ? `${el.borderWidth}mm solid ${el.borderColor}` : undefined;

function ElementBody({
  el,
  employee,
  company,
  qrMap,
}: {
  el: IdEl;
  employee: any;
  company: IdCompany;
  qrMap?: Record<string, string>;
}) {
  const text: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent:
      el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
    textAlign: el.align,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    fontFamily: FONT_STACKS[el.font],
    fontSize: `${el.size}pt`,
    lineHeight: 1.15,
    color: el.color,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textTransform: el.upper ? "uppercase" : "none",
    letterSpacing: el.spacing ? `${el.spacing}em` : undefined,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  if (el.kind === "text") return <div style={text}>{el.text}</div>;

  if (el.kind === "field") {
    const v = fieldValue(el.field, employee, company);
    return <div style={text}>{v ? `${el.prefix}${v}` : ""}</div>;
  }

  if (el.kind === "photo") {
    const radius =
      el.shape === "circle" ? "50%" : el.shape === "rounded" ? `${el.radius}%` : 0;
    const border = borderOf(el);
    const src = assetUrl(employee?.photo);
    return src ? (
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: radius, display: "block", border, boxSizing: "border-box" }}
      />
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius,
          border,
          boxSizing: "border-box",
          background: "#e2e8f0",
          color: "#64748b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_STACKS.sans,
          fontWeight: 700,
          fontSize: "14pt",
        }}
      >
        {initials(employee)}
      </div>
    );
  }

  if (el.kind === "logo") {
    return company.logoUrl ? (
      <img
        src={company.logoUrl}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    ) : null;
  }

  if (el.kind === "qr") {
    const v = qrValue(el, employee, company);
    const src = qrMap?.[v];
    return src ? (
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", imageRendering: "pixelated" }}
      />
    ) : null;
  }

  if (el.kind === "image") {
    const r =
      el.shape === "circle" ? "50%" : el.shape === "rounded" ? `${el.radius}%` : 0;
    const src = assetUrl(el.src);
    return src ? (
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: el.fit, borderRadius: r, display: "block", border: borderOf(el), boxSizing: "border-box" }}
      />
    ) : null;
  }

  // shape
  const radius =
    el.shape === "circle" ? "50%" : el.shape === "rounded" ? `${el.radius}%` : 0;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: el.fill2 ? gradientOf(el.fill, el.fill2, el.angle) : el.fill,
        borderRadius: radius,
        border: borderOf(el),
        boxSizing: "border-box",
      }}
    />
  );
}

/** One side of an ID card at its real size (mm). Pure: the same markup is used for the preview and for printing. */
export function IdCardView({ template, side, employee, company, qrMap }: Props) {
  const { w, h } = cardDims(template);
  const s = side === "front" ? template.front : template.back;
  return (
    <div
      style={{
        position: "relative",
        width: `${w}mm`,
        height: `${h}mm`,
        background: sideBackground(s),
        borderRadius: `${template.cornerRadius}mm`,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {s.elements
        .filter((el) => el.visible)
        .map((el) => (
          <div
            key={el.id}
            style={{
              position: "absolute",
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
              opacity: el.opacity,
              transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
            }}
          >
            <ElementBody el={el} employee={employee} company={company} qrMap={qrMap} />
          </div>
        ))}
    </div>
  );
}
