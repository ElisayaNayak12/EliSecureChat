import { useMemo } from "react";

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg" | "xl";
  isOnline?: boolean;
  resolveUrl: (url?: string) => string;
}

export default function Avatar({ name, avatarUrl, size = "md", isOnline, resolveUrl }: AvatarProps) {
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    if (!parts.length) return "U";
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
  }, [name]);

  const sizeClass = `avatar-${size}`;

  return (
    <div className={`avatar-container ${sizeClass}`}>
      {avatarUrl ? (
        <img className={`avatar-img`} src={resolveUrl(avatarUrl)} alt={name} />
      ) : (
        <div className={`avatar-fallback`}>{initials}</div>
      )}
      {isOnline !== undefined && (
        <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
      )}
    </div>
  );
}
