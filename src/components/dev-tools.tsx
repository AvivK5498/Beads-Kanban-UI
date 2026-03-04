"use client";

import { useState, useEffect } from "react";

import dynamic from "next/dynamic";

const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false }
);

export function DevTools() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const explicitlyEnabled = process.env.NEXT_PUBLIC_AGENTATION === "1";
    const isDev =
      process.env.NODE_ENV === "development" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (explicitlyEnabled || isDev) {
      setShow(true);
    }
  }, []);

  if (!show) return null;
  return <Agentation />;
}
