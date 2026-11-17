import type { Metadata } from "next";
import { ExploreExperience } from "@/components/explore/explore-experience";

export const metadata: Metadata = {
  title: "Explore · LIFEFORM",
  description: "A living world that moves with your measured pulse and breathing.",
};

// Server Component shell; the world, readings and controls are Client Components.
export default function ExplorePage() {
  return <ExploreExperience />;
}
