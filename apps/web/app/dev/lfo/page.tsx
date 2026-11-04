import { notFound } from "next/navigation";
import { LfoDemo } from "./lfo-demo";

export default function LfoDemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LfoDemo />;
}
