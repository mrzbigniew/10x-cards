import { useGeneration } from "@/components/hooks/useGeneration";
import { GenerationFlow } from "@/components/generation/GenerationFlow";

export function GenerationFlowPage() {
  const generation = useGeneration();
  return <GenerationFlow {...generation} />;
}
