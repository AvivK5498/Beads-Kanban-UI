import Image from "next/image";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

import styles from "./roiui-card.module.css";

const cardVariants = cva(styles.card, {
  variants: {
    variant: {
      default: "",
      lift: styles.cardLift,
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

/**
 * Card component for displaying content in a contained layout.
 *
 * @param variant - The visual style of the card
 *   - `"default"` - Standard card appearance
 *   - `"lift"` - Animated card with hover effects. On hover, the image scales up, content and footer animate with elevation effects
 * @param className - Optional CSS class names
 *
 * @example
 * ```tsx
 * // Standard card
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *   </CardHeader>
 *   <CardContent>Content goes here</CardContent>
 * </Card>
 *
 * // Lift variant with hover animations
 * <Card variant="lift">
 *   <CardImage src="/image.jpg" alt="Image" />
 *   <CardContent>
 *     <CardTitle>Title</CardTitle>
 *   </CardContent>
 *   <CardFooter>Footer content</CardFooter>
 * </Card>
 * ```
 */
function Card({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ variant }), className)} data-slot="card" {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.header, className)} data-slot="card-header" {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.title, className)} data-slot="card-title" {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.description, className)} data-slot="card-description" {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.content, className)} data-slot="card-content" {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.footer, className)} data-slot="card-footer" {...props} />;
}

/**
 * CardImage component for displaying images within a Card. Uses Next Image.
 *
 * @param src - The image source URL
 * @param alt - Alternative text for the image (required for accessibility)
 * @param className - Optional CSS class names
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardImage src="/scene.jpg" alt="Mountain landscape" />
 *   <CardContent>...</CardContent>
 * </Card>
 * ```
 */
function CardImage({
  className,
  src,
  alt,
  ...props
}: {
  className?: string;
  src: string;
  alt: string;
} & Omit<React.ComponentProps<typeof Image>, "src" | "alt" | "width" | "height" | "children">) {
  return (
    <Image
      alt={alt}
      className={cn(styles.image, className)}
      data-slot="card-image"
      height={300}
      src={src}
      width={300}
      {...props}
    />
  );
}

/**
 * CardImageContent component for overlaying content on top of a CardImage.
 * Creates an absolutely positioned overlay with a gradient background for text readability.
 *
 * @param className - Optional CSS class names
 * @param children - Content to display in the overlay (typically text or CTAs)
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardImage src="/scene.jpg" alt="Mountain landscape" />
 *   <CardImageContent>
 *     <h2>Mountain Adventure</h2>
 *     <p>Explore the peaks</p>
 *   </CardImageContent>
 *   <CardContent>...</CardContent>
 * </Card>
 * ```
 */
function CardImageContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.imageContent, className)} data-slot="card-image-content" {...props} />;
}

function CardIcon({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn(styles.icon, className)} data-slot="card-icon" {...props}>
      {children}
    </div>
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.action, className)} data-slot="card-action" {...props} />;
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardIcon,
  CardImage,
  CardImageContent,
  CardTitle,
};
