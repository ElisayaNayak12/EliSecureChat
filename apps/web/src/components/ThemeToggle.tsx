import { SunIcon, MoonIcon } from "./Icons";

interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      className="theme-toggle-btn"
      onClick={onToggle}
      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
      aria-label="Toggle theme"
    >
      {theme === "light" ? <MoonIcon size={20} /> : <SunIcon size={20} />}
    </button>
  );
}
