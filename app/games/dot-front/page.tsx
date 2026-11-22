import type { Metadata } from "next";
import DotFront from "./client";
import { copy } from "./copy";

export const metadata: Metadata = {
  title: copy.title + " · Xarmy",
  description: copy.description,
};

export default function DotFrontPage() {
  return <DotFront />;
}
