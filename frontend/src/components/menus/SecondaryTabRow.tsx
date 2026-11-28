import type { ComponentPropsWithoutRef } from "react";
import { ControlGlyph } from "../controller/ControlGlyph";
import "./secondaryTabRow.css";

/** Secondary fields share the same trigger hints and active underline across game menus. */
export function SecondaryTabRow({ children, className = "", navigation = "triggers", ...props }: ComponentPropsWithoutRef<"nav"> & {
  navigation?: "triggers" | "arrows";
}) {
  return <nav data-controller-row={navigation === "arrows" || undefined} {...props} role="tablist" className={`menu-secondary-tabs ${className}`}>
    {navigation === "triggers" && <span className="menu-secondary-hint" aria-hidden="true"><ControlGlyph controller="LT" keyboard="1" /></span>}
    {children}
    {navigation === "triggers" && <span className="menu-secondary-hint" aria-hidden="true"><ControlGlyph controller="RT" keyboard="3" /></span>}
  </nav>;
}
