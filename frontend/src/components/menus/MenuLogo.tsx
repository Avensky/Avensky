export function MenuLogo({ compact = false }: { compact?: boolean }) {
  return <img src="/images/logo.svg" alt={compact ? "" : "Avensky"}
    className={compact ? "menu-logo menu-logo--header" : "menu-logo"} draggable={false} />;
}
