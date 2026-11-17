import { useId } from "react";

/** The EliSecureChat logo: a chat bubble holding the "I love you" sign, with a gold privacy seal. */
export const BUBBLE_PATH =
  "M60 10C88.7 10 111 31.3 111 57.5S88.7 105 60 105c-7.6 0-14.8-1.4-21.3-4.1L17 109.5l6.3-20.6C15 80.4 9 69.5 9 57.5 9 31.3 31.3 10 60 10Z";

export function Hand({ color = "#FFFFFF" }: { color?: string }) {
  return (
    <g fill={color} stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <rect x="46" y="53" width="33" height="29" rx="12.5" stroke="none" />
      <rect x="52" y="74" width="21" height="16" rx="5" stroke="none" />
      <path d="M52.5 60V27.5" strokeWidth="10" fill="none" />
      <path d="M74.5 61.5l2.6-21.5" strokeWidth="8.6" fill="none" />
      <path d="M50 69.5L34.5 63.5" strokeWidth="9.6" fill="none" />
      <path d="M61 56.5v-5M68.6 57v-4.6" strokeWidth="8" fill="none" />
    </g>
  );
}

export function Seal({ ring = "#FFFFFF" }: { ring?: string }) {
  return (
    <g>
      <circle cx="95" cy="22" r="13" fill="#E3C27E" stroke={ring} strokeWidth="3" />
      <rect x="89.5" y="20" width="11" height="9" rx="2.2" fill="#2F4A34" />
      <path d="M91.6 20v-2.6a3.4 3.4 0 0 1 6.8 0V20" fill="none" stroke="#2F4A34" strokeWidth="2.2" />
    </g>
  );
}

type Props = {
  size?: number;
  /** "color" = green bubble, white hand; "light" = white bubble, green hand (for dark or green backgrounds). */
  variant?: "color" | "light";
  seal?: boolean;
  className?: string;
  title?: string;
};

export default function BrandMark({ size = 40, variant = "color", seal = true, className, title = "EliSecureChat" }: Props) {
  const id = useId().replace(/:/g, "");
  const light = variant === "light";
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title}>
      {!light && (
        <defs>
          <radialGradient id={`bm${id}`} cx="30%" cy="22%" r="95%">
            <stop offset="0" stopColor="#7FB069" />
            <stop offset=".55" stopColor="#2F5A37" />
            <stop offset="1" stopColor="#15291C" />
          </radialGradient>
        </defs>
      )}
      <path d={BUBBLE_PATH} fill={light ? "#FFFFFF" : `url(#bm${id})`} />
      {!light && <path d={BUBBLE_PATH} fill="none" stroke="#FFFFFF" strokeOpacity=".14" strokeWidth="1.5" />}
      <Hand color={light ? "#25432D" : "#FFFFFF"} />
      {seal && <Seal ring={light ? "#25432D" : "#FFFFFF"} />}
    </svg>
  );
}

/** "EliSecureChat" with "Secure" in the accent colour. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`brand-wordmark ${className ?? ""}`}>
      Eli<span className="brand-wordmark-accent">Secure</span>Chat
    </span>
  );
}
