import { Compass } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Compass className="h-4 w-4" />
      </div>
      {!compact && (
        <span className="font-semibold tracking-tight">
          CodePilot <span className="text-primary">AI</span>
        </span>
      )}
    </div>
  );
}
