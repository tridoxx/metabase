import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";

import type { TooltipProps } from "metabase/core/components/Tooltip/Tooltip";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  variant?: "default" | "brand" | "brandBold";
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  tooltip?: string | TooltipProps;
  activeClassName?: string;
  activeStyle?: CSSProperties;
  onlyActiveOnIndex?: boolean;
  /** margin-inline-start */
  ms?: string;
  /** margin-inline-end */
  me?: string;
  /** padding-inline-start */
  ps?: string;
  /** padding-inline-end */
  pe?: string;
  /** alias for margin-inline-start, short for "Margin-Left but Direction-sensitive", */
  mld?: string;
  /** alias for margin-inline-end, short for "Margin-Right but Direction-sensitive", */
  mrd?: string;
  /** alias for padding-inline-start, short for "Padding-Left but Direction-sensitive", */
  pld?: string;
  /** alias for padding-inline-end, short for "Padding-Right but Direction-sensitive", */
  prd?: string;
}
