// @ts-nocheck — Variants-Typen von motion sind zu strikt für `ease: "easeInOut"`
import { useId } from 'react';
import { motion } from 'motion/react';

export function BrainAnimation() {
  const gradientId = useId();

  // Abstraktes neuronales Netz: pulsierende Knoten auf Gradient-Bahnen.
  const pathVariants: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: { duration: 3, ease: "easeInOut" as const, repeat: Infinity, repeatType: "reverse" as const }
    }
  };

  const dotVariants: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: [0.8, 1.25, 0.8],
      opacity: [0.4, 1, 0.4],
      transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const }
    }
  };

  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <motion.div
        animate={{ opacity: [0.25, 0.5, 0.25], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" as const }}
        className="absolute inset-0 rounded-full blur-2xl -z-10"
        style={{ background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)' }}
      />
      <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>

        {/* Linke Hemisphäre */}
        <motion.path
          d="M 50 15 C 30 15 15 25 15 45 C 15 60 25 75 40 85 C 45 88 50 85 50 85"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          variants={pathVariants}
          initial="hidden"
          animate="visible"
        />

        {/* Rechte Hemisphäre */}
        <motion.path
          d="M 50 15 C 70 15 85 25 85 45 C 85 60 75 75 60 85 C 55 88 50 85 50 85"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          variants={pathVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.5 }}
        />

        {/* Innere Faltungen links */}
        <motion.path
          d="M 45 25 C 35 25 25 35 30 50 C 35 60 45 65 45 65"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          variants={pathVariants}
          initial="hidden"
          animate="visible"
        />

        {/* Innere Faltungen rechts */}
        <motion.path
          d="M 55 25 C 65 25 75 35 70 50 C 65 60 55 65 55 65"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          variants={pathVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.8 }}
        />

        {/* Frontale Schleifen */}
        <motion.path
          d="M 25 35 C 20 40 20 50 25 55"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          variants={pathVariants}
          initial="hidden"
          animate="visible"
        />
        <motion.path
          d="M 75 35 C 80 40 80 50 75 55"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          variants={pathVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        />

        {/* Synapsen-Knoten */}
        <motion.circle cx="30" cy="50" r="3" fill="var(--accent)" variants={dotVariants} initial="hidden" animate="visible" />
        <motion.circle cx="70" cy="50" r="3" fill="var(--accent-2)" variants={dotVariants} initial="hidden" animate="visible" style={{ animationDelay: '1s' }} />
        <motion.circle cx="45" cy="65" r="2.5" fill="var(--accent)" variants={dotVariants} initial="hidden" animate="visible" style={{ animationDelay: '0.5s' }} />
        <motion.circle cx="55" cy="65" r="2.5" fill="var(--accent-2)" variants={dotVariants} initial="hidden" animate="visible" style={{ animationDelay: '1.5s' }} />
        <motion.circle cx="50" cy="20" r="3" fill="var(--accent)" variants={dotVariants} initial="hidden" animate="visible" style={{ animationDelay: '0.2s' }} />
      </svg>
    </div>
  );
}
