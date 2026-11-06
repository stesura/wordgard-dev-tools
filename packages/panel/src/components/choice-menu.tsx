import type { ReactNode } from "react";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

export type Choice<T> = { value: T; label: string; icon: ReactNode };

type ChoiceProps<T> = {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
};

/** A labelled group of choices in a menu, the current one checked. */
export const ChoiceGroup = <T extends string>({
  label,
  value,
  choices,
  onChange,
}: ChoiceProps<T>) => (
  <DropdownMenuGroup>
    <DropdownMenuLabel>{label}</DropdownMenuLabel>
    <DropdownMenuRadioGroup
      value={value}
      onValueChange={(next) => {
        const found = choices.find((choice) => choice.value == next);
        if (found) onChange(found.value);
      }}
    >
      {choices.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.value}
          value={choice.value}
          closeOnClick
          className="text-xs"
        >
          {choice.icon}
          {choice.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  </DropdownMenuGroup>
);

/** An icon button opening a menu of choices, the current one checked. */
export const ChoiceMenu = <T extends string>({
  label,
  value,
  choices,
  onChange,
}: ChoiceProps<T>) => {
  const current = choices.find((choice) => choice.value == value);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${label}: ${current?.label ?? value}`}
                />
              }
            />
          }
        >
          {current?.icon}
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto">
        <ChoiceGroup label={label} value={value} choices={choices} onChange={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
