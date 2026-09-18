"use client";
import { track } from "@/lib/analytics/client";

import { useEffect, useState, type RefObject } from "react";
import { CodeEditor } from "@/components/editor/code-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RepairAttempt } from "@/lib/ai/types";
import type { CreditSummary } from "@/lib/billing/server";

export interface GenerationFailure {
  source: string;
  diagnostics: string;
}

interface Props {
  failure: GenerationFailure;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onEdit: () => void;
  onAccept: (source: string) => void;
  onRepair: (attempt: RepairAttempt) => void;
  onCancel: () => void;
}

export function GenerationFailureDialog({
  failure,
  promptRef,
  onEdit,
  onAccept,
  onRepair,
  onCancel,
}: Props) {
  const [source, setSource] = useState(failure.source);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [creditError, setCreditError] = useState(false);
  const hasAttempt = Boolean(failure.source.trim());
  useEffect(() => {
    if (!hasAttempt) return;
    const controller = new AbortController();
    void fetch("/api/billing", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setCredits)
      .catch(() => {
        if (!controller.signal.aborted) setCreditError(true);
      });
    return () => controller.abort();
  }, [hasAttempt]);
  const cost = credits ? (credits.exempt ? 0 : credits.generationCost) : null;
  const canRepair =
    cost !== null &&
    !creditError &&
    !!source.trim() &&
    !!credits &&
    (credits.exempt || credits.available >= cost);
  const actionClass =
    "h-auto min-h-10 w-full min-w-0 whitespace-normal px-3 py-2 text-center";

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onEdit();
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] min-w-0 overflow-y-auto data-[size=default]:max-w-3xl data-[size=default]:sm:max-w-3xl"
        finalFocus={promptRef}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>The generation failed.</AlertDialogTitle>
          <AlertDialogDescription>
            {hasAttempt
              ? "Review the error and code below. You can edit this attempt before accepting it or asking us to fix it."
              : "No code is available from this generation. We’re looking into the issue. Your prompt has been kept so you can try again later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-w-0 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-1 text-xs font-medium">Error details</p>
          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {failure.diagnostics}
          </p>
        </div>
        {hasAttempt ? (
          <>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium">Code attempt</p>
              <div
                className="h-[clamp(8rem,24dvh,18rem)] min-w-0 sm:h-[clamp(10rem,32dvh,22rem)] overflow-hidden rounded-md border"
                aria-label="Code attempt editor"
              >
                <CodeEditor
                  initialValue={failure.source}
                  onChange={setSource}
                  diagnostics={[]}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {creditError
                ? "Credit information is unavailable. You can still edit, accept or cancel for free."
                : cost === null
                  ? "Loading repair cost…"
                  : credits?.exempt
                    ? "Your account is credit-exempt. Try to fix makes one attempt with GPT-6 Astra."
                    : `Try to fix costs ${cost.toLocaleString()} credits for one GPT-6 Astra attempt, charged when it starts, even if it fails. You have ${credits?.available.toLocaleString()} credits.`}
            </p>
            <div className="grid min-w-0 grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-2">
              <AlertDialogAction
                variant="outline"
                className={actionClass}
                onClick={() => { track("generation_recovery_selected", { choice: hasAttempt ? "edit" : "acknowledge" }); onEdit(); }}
              >
                Edit prompt · Free
              </AlertDialogAction>
              <AlertDialogAction
                variant="outline"
                className={actionClass}
                disabled={!source.trim()}
                onClick={() => { track("generation_recovery_selected", { choice: "accept" }); onAccept(source); }}
              >
                Accept code attempt · Free
              </AlertDialogAction>
              <AlertDialogAction
                className={actionClass}
                disabled={!canRepair}
                onClick={() => {
                  if (canRepair && cost !== null) {
                    track("generation_recovery_selected", { choice: "fix" });
                    onRepair({
                      source,
                      diagnostics: failure.diagnostics,
                      expectedCost: cost,
                    });
                  }
                }}
              >
                Try to fix
                {cost !== null ? ` · ${cost.toLocaleString()} credits` : ""}
              </AlertDialogAction>
              <AlertDialogAction
                variant="outline"
                className={actionClass}
                onClick={() => { track("generation_recovery_selected", { choice: "cancel" }); onCancel(); }}
              >
                Cancel prompt · Free
              </AlertDialogAction>
            </div>
          </>
        ) : (
          <div className="flex justify-end border-t pt-4">
            <AlertDialogAction onClick={() => { track("generation_recovery_selected", { choice: hasAttempt ? "edit" : "acknowledge" }); onEdit(); }}>OK</AlertDialogAction>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
