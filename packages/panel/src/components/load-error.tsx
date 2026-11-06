import { Button } from "./ui/button.tsx";

/** A tab's failed load, with a retry. What loaded before stays up under it. */
export const LoadError = ({
  what,
  error,
  onRetry,
}: {
  what: string;
  error: string | null;
  onRetry: () => void;
}) =>
  error == null ? null : (
    <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
      Couldn't load {what}: {error}
      <Button variant="outline" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </p>
  );
