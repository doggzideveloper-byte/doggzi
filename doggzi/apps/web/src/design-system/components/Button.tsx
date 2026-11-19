import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "green" | "greenInk" | "pink" | "ink" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";
interface Common { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }

export const buttonClass = ({ variant = "primary", size = "md", block }: Common, extra?: string) =>
  [s.btn, s[variant], s[size], block && s.block, extra].filter(Boolean).join(" ");

/** Sticker button (signature move 2: lift 2px / shadow 6px on hover, press down 4px / shadow 0). */
export const Button = forwardRef<HTMLButtonElement, Common & ButtonHTMLAttributes<HTMLButtonElement>>(function Button(
  { variant, size, block, className, type = "button", ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />;
});

export function ButtonLink({ variant, size, block, className, ...rest }: Common & LinkProps) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...rest} />;
}

export function ButtonA({ variant, size, block, className, ...rest }: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={buttonClass({ variant, size, block }, className)} {...rest} />;
}
