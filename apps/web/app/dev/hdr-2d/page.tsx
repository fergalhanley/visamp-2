import { notFound } from "next/navigation";
import { Hdr2DComparisonClient } from "./comparison-client";

export default function Hdr2DComparisonPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Hdr2DComparisonClient />;
}
