import type { Metadata } from "next";
import { CreateExperience } from "@/components/create/create-experience";

export const metadata: Metadata = {
  title: "Create · LIFEFORM",
  description: "Music generated on your computer from your measured pulse and breathing.",
};

// Server Component shell; audio and measurements are Client Components.
export default function CreatePage() {
  return <CreateExperience />;
}
