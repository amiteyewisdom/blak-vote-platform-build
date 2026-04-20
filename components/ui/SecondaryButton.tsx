import React from "react";
import { Button } from "./button";
import type { ButtonProps } from "./button";

type SecondaryButtonProps = Omit<ButtonProps, 'variant'>;

export function SecondaryButton({ children, ...props }: SecondaryButtonProps) {
  return <Button variant="secondary" {...props}>{children}</Button>;
}
