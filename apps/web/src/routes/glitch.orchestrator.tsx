// GLITCHY (gl11tchy): fork-owned orchestration layer — file-based route for the orchestrator dashboard
import { createFileRoute, redirect } from "@tanstack/react-router";

import { OrchestratorDashboard } from "../components/glitch/OrchestratorDashboard";

export const Route = createFileRoute("/glitch/orchestrator")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: OrchestratorDashboard,
});
