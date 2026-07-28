import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Circle radius chosen so the circumference is ~100, letting strokeDasharray use the score directly as a percentage.
const SCORE_RING_RADIUS = 15.9155;

const SCORE_EXPLANATION =
  "AI-estimated match score based on skill overlap, seniority fit, role relevance, industry alignment, and salary fit with your resume.";

export function ScoreRing({ score, className }: { score: number; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "relative inline-flex size-6 shrink-0 cursor-default items-center justify-center",
              className
            )}
            aria-label={`Score ${score} out of 100`}
          />
        }
      >
        <svg aria-hidden="true" viewBox="0 0 36 36" className="-rotate-90 size-full">
          <circle
            cx="18"
            cy="18"
            r={SCORE_RING_RADIUS}
            fill="none"
            strokeWidth="3"
            className="stroke-muted"
          />
          <circle
            cx="18"
            cy="18"
            r={SCORE_RING_RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${score}, 100`}
            className="stroke-primary"
          />
        </svg>
        <span className="absolute font-semibold text-[10px] text-primary tabular-nums">
          {score}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-balance">{SCORE_EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}
