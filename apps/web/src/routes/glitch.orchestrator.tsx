// GLITCHY (gl11tchy): fork-owned orchestration layer — file-based route for the orchestrator dashboard
import { createFileRoute } from "@tanstack/react-router";

import { OrchestratorDashboard } from "../components/glitch/OrchestratorDashboard";

export const Route = createFileRoute("/glitch/orchestrator")({
  component: OrchestratorDashboard,
});
