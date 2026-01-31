'use client';

import React, {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { XIcon } from 'lucide-react';
import {
  motion,
  AnimatePresence,
  MotionConfig,
  Transition,
  Variant,
} from 'motion/react';
import { createPortal } from 'react-dom';
import { RemoveScroll } from 'react-remove-scroll';

import useClickOutside from '@/hooks/useClickOutside';
import { cn } from '@/lib/utils';

export type MorphingDialogContextType = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  uniqueId: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  contentElement: HTMLDivElement | null;
  setContentElement: React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;
};

const MorphingDialogContext =
  React.createContext<MorphingDialogContextType | null>(null);

function useMorphingDialog() {
  const context = useContext(MorphingDialogContext);
  if (!context) {
    throw new Error(
      'useMorphingDialog must be used within a MorphingDialogProvider'
    );
  }
  return context;
}

export type MorphingDialogProviderProps = {
  children: React.ReactNode;
  transition?: Transition;
  onOpenChange?: (isOpen: boolean) => void;
  defaultOpen?: boolean;
};

function MorphingDialogProvider({
  children,
  transition,
  onOpenChange,
  defaultOpen = false,
}: MorphingDialogProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const uniqueId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null!);
  const contentRef = useRef<HTMLDivElement>(null!);

  // Call onOpenChange callback when isOpen changes (after render)
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const contextValue = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      uniqueId,
      triggerRef,
      contentRef,
      contentElement,
      setContentElement,
    }),
    [isOpen, contentElement]
  );

  return (
    <MorphingDialogContext.Provider value={contextValue}>
      <MotionConfig transition={transition}>{children}</MotionConfig>
    </MorphingDialogContext.Provider>
  );
}

export type MorphingDialogProps = {
  children: React.ReactNode;
  transition?: Transition;
  onOpenChange?: (isOpen: boolean) => void;
  defaultOpen?: boolean;
};

function MorphingDialog({ children, transition, onOpenChange, defaultOpen }: MorphingDialogProps) {
  return (
    <MorphingDialogProvider onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <MotionConfig transition={transition}>{children}</MotionConfig>
    </MorphingDialogProvider>
  );
}

export type MorphingDialogTriggerProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  triggerRef?: React.RefObject<HTMLButtonElement>;
};

function MorphingDialogTrigger({
  children,
  className,
  style,
  triggerRef,
}: MorphingDialogTriggerProps) {
  const { setIsOpen, isOpen, uniqueId } = useMorphingDialog();

  const handleClick = useCallback(() => {
    setIsOpen(!isOpen);
  }, [isOpen, setIsOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(!isOpen);
      }
    },
    [isOpen, setIsOpen]
  );

  return (
    <motion.button
      ref={triggerRef}
      layoutId={`dialog-${uniqueId}`}
      className={cn('relative cursor-pointer', className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={style}
      aria-haspopup='dialog'
      aria-expanded={isOpen}
      aria-controls={`motion-ui-morphing-dialog-content-${uniqueId}`}
      aria-label={`Open dialog ${uniqueId}`}
    >
      {children}
    </motion.button>
  );
}

export type MorphingDialogContentProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

function MorphingDialogContent({
  children,
  className,
  style,
}: MorphingDialogContentProps) {
  const { setIsOpen, isOpen, uniqueId, triggerRef, contentRef, setContentElement } = useMorphingDialog();
  // Use contentRef from context so RemoveScroll can allow scrolling inside this element
  const containerRef = contentRef;
  const [firstFocusableElement, setFirstFocusableElement] =
    useState<HTMLElement | null>(null);
  const [lastFocusableElement, setLastFocusableElement] =
    useState<HTMLElement | null>(null);

  // Register the content element for RemoveScroll shards
  useEffect(() => {
    if (containerRef.current) {
      setContentElement(containerRef.current);
    }
    return () => {
      setContentElement(null);
    };
  }, [setContentElement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
      if (event.key === 'Tab') {
        if (!firstFocusableElement || !lastFocusableElement) return;

        if (event.shiftKey) {
          if (document.activeElement === firstFocusableElement) {
            event.preventDefault();
            lastFocusableElement.focus();
          }
        } else {
          if (document.activeElement === lastFocusableElement) {
            event.preventDefault();
            firstFocusableElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setIsOpen, firstFocusableElement, lastFocusableElement]);

  useEffect(() => {
    if (isOpen) {
      // Note: overflow-hidden is now handled by RemoveScroll in MorphingDialogContainer
      const focusableElements = containerRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements && focusableElements.length > 0) {
        setFirstFocusableElement(focusableElements[0] as HTMLElement);
        setLastFocusableElement(
          focusableElements[focusableElements.length - 1] as HTMLElement
        );
        (focusableElements[0] as HTMLElement).focus();
      }
    } else {
      triggerRef.current?.focus();
    }
  }, [isOpen, triggerRef]);

  useClickOutside(containerRef, () => {
    if (isOpen) {
      setIsOpen(false);
    }
  });

  return (
    <motion.div
      ref={containerRef}
      layoutId={`dialog-${uniqueId}`}
      className={className}
      style={style}
      role='dialog'
      aria-modal='true'
      aria-labelledby={`motion-ui-morphing-dialog-title-${uniqueId}`}
      aria-describedby={`motion-ui-morphing-dialog-description-${uniqueId}`}
    >
      {children}
    </motion.div>
  );
}

export type MorphingDialogContainerProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

function MorphingDialogContainer({ children }: MorphingDialogContainerProps) {
  const { isOpen, uniqueId, contentElement } = useMorphingDialog();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  // Build shards array - only include contentElement if it's available
  const shards = contentElement ? [contentElement] : [];

  return createPortal(
    <AnimatePresence initial={false} mode='sync'>
      {isOpen && (
        <RemoveScroll shards={shards} noIsolation>
          <>
            <motion.div
              key={`backdrop-${uniqueId}`}
              className='fixed inset-0 z-[60] h-full w-full bg-black/20 backdrop-blur-xs'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <div className='fixed inset-0 z-[60] flex items-center justify-center'>
              {children}
            </div>
          </>
        </RemoveScroll>
      )}
    </AnimatePresence>,
    document.body
  );
}

export type MorphingDialogTitleProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

function MorphingDialogTitle({
  children,
  className,
  style,
}: MorphingDialogTitleProps) {
  const { uniqueId } = useMorphingDialog();

  return (
    <motion.div
      layoutId={`dialog-title-container-${uniqueId}`}
      className={className}
      style={style}
      layout
    >
      {children}
    </motion.div>
  );
}

export type MorphingDialogSubtitleProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

function MorphingDialogSubtitle({
  children,
  className,
  style,
}: MorphingDialogSubtitleProps) {
  const { uniqueId } = useMorphingDialog();

  return (
    <motion.div
      layoutId={`dialog-subtitle-container-${uniqueId}`}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export type MorphingDialogDescriptionProps = {
  children: React.ReactNode;
  className?: string;
  disableLayoutAnimation?: boolean;
  variants?: {
    initial: Variant;
    animate: Variant;
    exit: Variant;
  };
};

function MorphingDialogDescription({
  children,
  className,
  variants,
  disableLayoutAnimation,
}: MorphingDialogDescriptionProps) {
  const { uniqueId } = useMorphingDialog();

  return (
    <motion.div
      key={`dialog-description-${uniqueId}`}
      layoutId={
        disableLayoutAnimation
          ? undefined
          : `dialog-description-content-${uniqueId}`
      }
      variants={variants}
      className={className}
      initial='initial'
      animate='animate'
      exit='exit'
      id={`dialog-description-${uniqueId}`}
    >
      {children}
    </motion.div>
  );
}

export type MorphingDialogImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
};

function MorphingDialogImage({
  src,
  alt,
  className,
  style,
}: MorphingDialogImageProps) {
  const { uniqueId } = useMorphingDialog();

  return (
    <motion.img
      src={src}
      alt={alt}
      className={cn(className)}
      layoutId={`dialog-img-${uniqueId}`}
      style={style}
    />
  );
}

export type MorphingDialogCloseProps = {
  children?: React.ReactNode;
  className?: string;
  variants?: {
    initial: Variant;
    animate: Variant;
    exit: Variant;
  };
};

function MorphingDialogClose({
  children,
  className,
  variants,
}: MorphingDialogCloseProps) {
  const { setIsOpen, uniqueId } = useMorphingDialog();

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  return (
    <motion.button
      onClick={handleClose}
      type='button'
      aria-label='Close dialog'
      key={`dialog-close-${uniqueId}`}
      className={cn('absolute top-6 right-6', className)}
      initial='initial'
      animate='animate'
      exit='exit'
      variants={variants}
    >
      {children || <XIcon size={24} />}
    </motion.button>
  );
}

export {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogClose,
  MorphingDialogTitle,
  MorphingDialogSubtitle,
  MorphingDialogDescription,
  MorphingDialogImage,
};
