"use client";

import type React from "react";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";

function AlertDialogRoot({ ...props }: AlertDialog.Root.Props) {
  return <AlertDialog.Root {...props} />;
}

function AlertDialogTrigger({ ...props }: AlertDialog.Trigger.Props) {
  return <AlertDialog.Trigger data-slot="alert-dialog-trigger" nativeButton {...props} />;
}

const AlertDialogPortal = AlertDialog.Portal;

function AlertDialogBackdrop({ className, ...props }: AlertDialog.Backdrop.Props) {
  return (
    <AlertDialog.Backdrop
      className={cn(
        "fixed inset-0 z-[var(--dialog-z)] bg-[var(--dialog-overlay)] transition-opacity duration-150",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
      data-slot="alert-dialog-backdrop"
      {...props}
    />
  );
}

const popupStyles = cn(
  "fixed top-1/2 left-1/2 z-[101] grid max-h-[85vh] w-full max-w-[32rem] overflow-y-auto",
  "gap-4 rounded-[var(--radius)] border-none p-6",
  "shadow-[0_0_0_1px_oklch(from_var(--border)_l_c_h_/_0.5),var(--shadow-border-stack)]",
  "-translate-x-1/2 -translate-y-1/2 bg-[var(--mix-card-5-bg)]",
  "transition-all duration-150",
  "data-[starting-style]:-translate-x-1/2 data-[starting-style]:-translate-y-1/2 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
  "data-[ending-style]:-translate-x-1/2 data-[ending-style]:-translate-y-1/2 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
  "max-sm:-translate-y-1/2 max-sm:top-1/2 max-sm:right-4 max-sm:left-4 max-sm:w-[calc(100vw-2rem)] max-sm:max-w-none max-sm:translate-x-0",
  "max-sm:data-[starting-style]:-translate-y-1/2 max-sm:data-[starting-style]:scale-90 max-sm:data-[starting-style]:opacity-0",
  "max-sm:data-[ending-style]:-translate-y-1/2 max-sm:data-[ending-style]:scale-90 max-sm:data-[ending-style]:opacity-0"
);

function AlertDialogPopup({ className, children, ...props }: AlertDialog.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialog.Popup className={cn(popupStyles, className)} data-slot="alert-dialog-popup" {...props}>
        {children}
      </AlertDialog.Popup>
    </AlertDialogPortal>
  );
}

function AlertDialogContent({ className, children, ...props }: AlertDialog.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogBackdrop />
      <AlertDialog.Popup className={cn(popupStyles, className)} data-slot="alert-dialog-popup" {...props}>
        {children}
      </AlertDialog.Popup>
    </AlertDialogPortal>
  );
}

function AlertDialogTitle({ className, ...props }: AlertDialog.Title.Props) {
  return (
    <AlertDialog.Title
      className={cn("m-0 font-semibold text-foreground text-lg leading-none tracking-tight", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: AlertDialog.Description.Props) {
  return (
    <AlertDialog.Description
      className={cn("m-0 text-secondary-foreground text-sm leading-[1.5]", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

function AlertDialogClose({ ...props }: AlertDialog.Close.Props) {
  return <AlertDialog.Close data-slot="alert-dialog-close" nativeButton {...props} />;
}

const AlertDialogOverlay = AlertDialogBackdrop;

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 text-left [&_h2]:m-0 [&_p]:m-0", className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2", "sm:flex-row sm:justify-end", className)}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

export {
  AlertDialogRoot as AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPopup,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
};
