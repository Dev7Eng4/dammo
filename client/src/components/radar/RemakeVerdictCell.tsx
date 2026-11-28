import { useTranslation } from "react-i18next";
import type { RemakeVerdict } from "../../types/radar";
import { StatusBadge, type StatusTone } from "../ui";

const VERDICT_TONE: Record<RemakeVerdict, StatusTone> = {
  do: "success",
  maybe: "warning",
  skip: "neutral",
};

/** Remake gate verdict (nên làm / có thể làm / không nên làm) with its reasons. */
export function RemakeVerdictCell({
  verdict,
  reasons,
}: {
  verdict: RemakeVerdict;
  reasons: string[];
}) {
  const { t } = useTranslation("radar");
  return (
    <div className="flex min-w-[10rem] max-w-[16rem] flex-col items-start gap-1">
      <StatusBadge tone={VERDICT_TONE[verdict]} label={t(`verdict.${verdict}`)} />
      {reasons.length > 0 ? (
        <p
          className="line-clamp-3 text-[11px] text-muted-foreground"
          title={reasons.join(" · ")}
        >
          {reasons.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
