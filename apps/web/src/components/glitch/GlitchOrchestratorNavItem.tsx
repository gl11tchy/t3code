// GLITCHY (gl11tchy): fork-owned orchestration layer — sidebar nav entry to the orchestrator
import { useNavigate } from "@tanstack/react-router";
import { BoxesIcon } from "lucide-react";
import { useCallback } from "react";

import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { ORCHESTRATOR_ROUTE_PATH } from "./orchestrator.logic";

export function GlitchOrchestratorNavItem() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: ORCHESTRATOR_ROUTE_PATH });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="sm"
        className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        onClick={handleClick}
      >
        <BoxesIcon className="size-3.5" />
        <span className="text-xs">Orchestrator</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
