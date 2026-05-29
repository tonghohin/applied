"use client";

import { type HTMLMotionProps, motion } from "motion/react";

export function Reveal({ ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      {...props}
    />
  );
}
