import React from "react";
import { Button } from "./button";
import type { ButtonProps } from "./button";

type DangerButtonProps = Omit<ButtonProps, 'variant'>;

export function DangerButton({ children, ...props }: DangerButtonProps) {
  return <Button variant="destructive" {...props}>{children}</Button>;
}
