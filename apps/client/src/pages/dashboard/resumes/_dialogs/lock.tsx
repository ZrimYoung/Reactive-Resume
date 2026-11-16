import { t } from "@lingui/macro";
import type { ResumeDto } from "@reactive-resume/dto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@reactive-resume/ui";

import { toast } from "@/client/hooks/use-toast";
import { useLockResume } from "@/client/services/resume/lock";
import { useDialog } from "@/client/stores/dialog";

export const LockDialog = () => {
  const { isOpen, mode, payload, close } = useDialog<ResumeDto>("lock");

  const isLockMode = mode === "create";
  const isUnlockMode = mode === "update";

  const { lockResume, loading } = useLockResume();

  const onSubmit = async () => {
    if (!payload.item) return;

    try {
      await lockResume({ id: payload.item.id, set: isLockMode, updatedAt: payload.item.updatedAt });
      close();
    } catch {
      toast({
        variant: "error",
        title: t`The lock could not be changed. Open the resume to review any unsaved changes.`,
      });
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isLockMode && t`Are you sure you want to lock this resume?`}
            {isUnlockMode && t`Are you sure you want to unlock this resume?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isLockMode &&
              t`Locking a resume will prevent any further changes to it. This is useful when you have already shared your resume with someone and you don't want to accidentally make any changes to it.`}
            {isUnlockMode && t`Unlocking a resume will allow you to make changes to it again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction variant="info" disabled={loading} onClick={onSubmit}>
            {isLockMode && t`Lock`}
            {isUnlockMode && t`Unlock`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
