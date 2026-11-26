import type { ComponentPropsWithoutRef } from "react";
import { ControlGlyph } from "../controller/ControlGlyph";
import "./secondaryTabRow.css";

/** Secondary fields share the same trigger hints and active underline across game menus. */
export function SecondaryTabRow({ children, className = "", ...props }: ComponentPropsWithoutRef<"nav">) {
  return <nav {...props} role="tablist" className={`menu-secondary-tabs ${className}`}>
    <span className="menu-secondary-hint" aria-hidden="true"><ControlGlyph controller="LT" keyboard="1" /></span>
    {children}
    <span className="menu-secondary-hint" aria-hidden="true"><ControlGlyph controller="RT" keyboard="3" /></span>
  </nav>;
}
