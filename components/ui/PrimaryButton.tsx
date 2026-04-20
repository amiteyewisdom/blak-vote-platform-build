import React from "react";
import { Button } from "./button";
import type { ButtonProps } from "./button";

type PrimaryButtonProps = Omit<ButtonProps, 'variant'>;

export function PrimaryButton({ children, ...props }: PrimaryButtonProps) {
  return <Button variant="default" {...props}>{children}</Button>;
}
