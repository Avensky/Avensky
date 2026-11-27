import type { ReactNode } from "react";
import "./menuLoadingStatus.css";

export function MenuLoadingStatus({ children }: { children: ReactNode }) {
  return <span className="menu-loading-status" role="status">{children}</span>;
}
