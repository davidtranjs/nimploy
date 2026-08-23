import { ChevronRight } from "lucide-react";
import React from "react";

export interface BreadcrumbItem {
	label: string;
	onClick?: () => void;
}

interface BreadcrumbProps {
	items: BreadcrumbItem[];
	className?: string;
}

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
	return (
		<nav
			aria-label="Breadcrumb"
			className={`flex items-center gap-1.5 text-xs text-slate-500 font-medium ${className}`}
		>
			{items.map((item, index) => {
				const isLast = index === items.length - 1;
				return (
					<React.Fragment key={index}>
						{index > 0 && (
							<ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
						)}
						{item.onClick && !isLast ? (
							<button
								type="button"
								onClick={item.onClick}
								className="hover:text-slate-900 hover:underline transition-colors cursor-pointer truncate max-w-[200px]"
								title={item.label}
							>
								{item.label}
							</button>
						) : (
							<span
								className={`truncate max-w-[240px] ${isLast ? "text-slate-900 font-semibold" : ""}`}
								title={item.label}
							>
								{item.label}
							</span>
						)}
					</React.Fragment>
				);
			})}
		</nav>
	);
}
