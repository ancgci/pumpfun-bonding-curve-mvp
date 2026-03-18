import React from 'react';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface PremiumCardProps {
    title?: string;
    icon?: any;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerClassName?: string;
    draggable?: boolean;
    id?: string;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export const PremiumCard = ({
    title,
    icon: Icon,
    actions,
    children,
    className,
    headerClassName,
    draggable,
    onDragStart,
    onDragOver,
    onDrop
}: PremiumCardProps) => {
    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={cn(
                "bg-card/40 backdrop-blur-md border border-white/5 rounded-3xl lg:rounded-[2rem] p-4 sm:p-6 lg:p-8 flex flex-col shadow-xl transition-all duration-300",
                draggable && "hover:border-primary/20",
                className
            )}
        >
            {(title || Icon || actions || draggable) && (
                <div className={cn("flex justify-between items-center mb-4 lg:mb-6 gap-3", headerClassName)}>
                    <div className="flex items-center gap-3">
                        {draggable && (
                            <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary transition-colors pr-1">
                                <GripVertical className="w-5 h-5" />
                            </div>
                        )}
                        {Icon && (
                            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                                <Icon className="w-5 h-5 text-primary" />
                            </div>
                        )}
                        {title && <h3 className="text-foreground font-semibold text-base lg:text-lg tracking-tight">{title}</h3>}
                    </div>
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                </div>
            )}
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
};
