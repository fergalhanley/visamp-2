import { notFound } from "next/navigation";
import { HdrComparisonClient } from "./comparison-client";

// Never ship this diagnostic page as a publicly available production route.
export default function HdrComparisonPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HdrComparisonClient />;
}
