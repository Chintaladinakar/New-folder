import type { Transition, Variants } from 'motion/react';

/** Strong curves; the CSS built-ins are too weak to read as intentional. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

export const enter = (duration = 0.2): Transition => ({ duration, ease: EASE_OUT });
export const exit = (duration = 0.15): Transition => ({ duration, ease: EASE_OUT });
export const drawer: Transition = { duration: 0.3, ease: EASE_DRAWER };
export const spring: Transition = { type: 'spring', duration: 0.5, bounce: 0.15 };
/** Critically damped: things that move on their own, not thrown by a gesture, shouldn't overshoot. */
export const settle: Transition = { type: 'spring', duration: 0.7, bounce: 0 };

/** For imperative animations, which MotionConfig doesn't reach. ThemeProvider keeps the attribute current. */
export const prefersReducedMotion = () => document.documentElement.dataset.reduceMotion === 'true';

/** Modals: centred, so they scale from the middle. */
export const modal: Variants = {
  hidden: { opacity: 0, transform: 'scale(0.96)' },
  visible: { opacity: 1, transform: 'scale(1)', transition: enter(0.2) },
  exit: { opacity: 0, transform: 'scale(0.98)', transition: exit(0.15) },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: enter(0.2) },
  exit: { opacity: 0, transition: exit(0.15) },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, transform: 'translateY(6px)' },
  visible: { opacity: 1, transform: 'translateY(0px)', transition: enter(0.22) },
  exit: { opacity: 0, transform: 'translateY(4px)', transition: exit(0.12) },
};

/** Popovers scale from their trigger; the origin is set on the element. */
export const popover: Variants = {
  hidden: { opacity: 0, transform: 'scale(0.95)' },
  visible: { opacity: 1, transform: 'scale(1)', transition: enter(0.16) },
  exit: { opacity: 0, transform: 'scale(0.97)', transition: exit(0.12) },
};

export const slideUp: Variants = {
  hidden: { transform: 'translateY(100%)' },
  visible: { transform: 'translateY(0%)', transition: drawer },
  exit: { transform: 'translateY(100%)', transition: { duration: 0.22, ease: EASE_DRAWER } },
};

/** Sheets float a little in from the edge, so they travel slightly further than their own width. */
export const sheetRight: Variants = {
  hidden: { transform: 'translateX(110%)' },
  visible: { transform: 'translateX(0%)', transition: drawer },
  exit: { transform: 'translateX(110%)', transition: { duration: 0.22, ease: EASE_DRAWER } },
};

/** Floating elements (the player dock, prompts) rise into place rather than sliding from off-screen. */
export const rise: Variants = {
  hidden: { opacity: 0, transform: 'translateY(16px)' },
  visible: { opacity: 1, transform: 'translateY(0px)', transition: { duration: 0.32, ease: EASE_DRAWER } },
  exit: { opacity: 0, transform: 'translateY(16px)', transition: exit(0.18) },
};

/** The side panel eases in from the edge it's attached to. */
export const panelIn: Variants = {
  hidden: { opacity: 0, transform: 'translateX(24px)' },
  visible: { opacity: 1, transform: 'translateX(0px)', transition: { duration: 0.32, ease: EASE_DRAWER } },
  exit: { opacity: 0, transform: 'translateX(24px)', transition: exit(0.18) },
};

/** Toasts enter and leave through the same edge, so a dismiss swipe reads as obvious. */
export const toast: Variants = {
  hidden: { opacity: 0, transform: 'translateY(-12px) scale(0.97)' },
  visible: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: enter(0.25) },
  exit: { opacity: 0, transform: 'translateY(-8px) scale(0.98)', transition: exit(0.15) },
};
