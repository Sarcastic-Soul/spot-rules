import {
  useHeaderTitle,
  useHeaderActions,
} from "@agent-native/toolkit/app-shell";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { NotificationsBell } from "@agent-native/toolkit/app/notifications";

import { MobileAppBar } from "./MobileAppBar";

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const title = useHeaderTitle();
  const actions = useHeaderActions();

  return (
    <MobileAppBar
      className="md:ps-4"
      onOpenNavigation={onOpenMobileSidebar}
      title={title}
      actions={
        <>
          {actions}
          <NotificationsBell
            emptyTitle="No updates yet"
            emptyDescription="Run the morning check to get a summary of your spots here."
          />
          <AgentToggleButton />
        </>
      }
    />
  );
}
