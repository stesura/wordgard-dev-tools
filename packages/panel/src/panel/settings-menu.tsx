import { ArrowUpRightIcon, Cog6ToothIcon, ComputerDesktopIcon, MoonIcon, SunIcon } from "#icons";
import { useStore } from "@nanostores/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "#components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#components/ui/tooltip";
import { usePanelSettings } from "#components/panel-settings";
import type { ThemeChoice, ThemeStore } from "#stores/theme.ts";
import { type Choice, ChoiceMenu } from "#components/choice-menu";

const themes: Choice<ThemeChoice>[] = [
  { value: "system", label: "System", icon: <ComputerDesktopIcon /> },
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

export const ThemeMenu = ({ theme }: { theme: ThemeStore }) => {
  const { choice } = useSyncExternalStore(theme.subscribe, theme.get);
  return <ChoiceMenu label="Theme" value={choice} choices={themes} onChange={theme.set} />;
};

const REPOSITORY = "https://github.com/stesura/wordgard-dev-tools";

/** The panel's settings; `extra`: more groups, first (the in-page dock's reopen button). */
export const SettingsMenu = ({ extra }: { extra?: ReactNode }) => {
  const { guidesShown } = usePanelSettings();
  const shown = useStore(guidesShown);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="Settings" />}
            />
          }
        >
          <Cog6ToothIcon />
        </TooltipTrigger>
        <TooltipContent side="top">Settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto">
        {extra && (
          <>
            {extra}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuCheckboxItem
          checked={shown}
          onCheckedChange={(on) => guidesShown.set(on)}
          closeOnClick
          className="text-xs"
        >
          Display guidances
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<a href={REPOSITORY} target="_blank" rel="noreferrer" />}
          className="text-xs"
        >
          GitHub repository
          <ArrowUpRightIcon className="ml-auto size-3 text-muted-foreground" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
