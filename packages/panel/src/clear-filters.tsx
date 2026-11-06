import { Button } from "#components/ui/button";

/** Resets a view's filters: shown only while some are on, amber so a filtered view stands out. */
export const ClearFilters = ({ onClick }: { onClick: () => void }) => (
  <Button
    variant="ghost"
    size="xs"
    onClick={onClick}
    className="h-5 shrink-0 cursor-pointer bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900 dark:bg-amber-400/15 dark:text-amber-300 dark:hover:bg-amber-400/25 dark:hover:text-amber-200"
  >
    Clear filters
  </Button>
);
