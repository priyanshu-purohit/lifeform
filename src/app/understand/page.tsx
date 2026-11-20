import type { Metadata } from "next";
import { UnderstandExperience } from "@/components/understand/understand-experience";

export const metadata: Metadata = {
  title: "Understand · LIFEFORM",
  description: "Your measured pulse and breathing, past sessions, and how they compare.",
};

// Server Component shell; storage and charts are Client Components.
export default function UnderstandPage() {
  return <UnderstandExperience />;
}
