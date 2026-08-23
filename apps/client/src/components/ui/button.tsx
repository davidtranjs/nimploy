import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?:
		| "default"
		| "destructive"
		| "outline"
		| "secondary"
		| "ghost"
		| "link";
	size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant = "default", size = "default", ...props }, ref) => {
		const variantStyles = {
			default:
				"bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs active:scale-[0.99]",
			destructive:
				"bg-red-600 text-white hover:bg-red-700 shadow-xs active:scale-[0.99]",
			outline:
				"border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900 text-slate-700 shadow-2xs",
			secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200/80 shadow-2xs",
			ghost: "hover:bg-slate-100 hover:text-slate-900 text-slate-700",
			link: "text-emerald-600 underline-offset-4 hover:underline",
		};

		const sizeStyles = {
			default: "h-9 px-4 py-2 text-sm",
			sm: "h-8 rounded-md px-3 text-xs",
			lg: "h-10 rounded-md px-8 text-base",
			icon: "h-9 w-9",
		};

		return (
			<button
				ref={ref}
				className={cn(
					"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
					variantStyles[variant],
					sizeStyles[size],
					className,
				)}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button };
