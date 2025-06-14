import { t, Trans } from "@lingui/macro";
import { Button } from "@reactive-resume/ui";

export const DangerZoneSettings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold leading-relaxed tracking-tight">{t`Danger Zone`}</h3>
        <p className="leading-relaxed opacity-75">
          <Trans>
            In local mode, account data is stored locally on your device. To reset your data, you
            can delete the local database file.
          </Trans>
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h4 className="text-lg font-semibold">{t`Reset Local Data`}</h4>
          <p className="mt-2 text-sm opacity-75">
            {t`To reset all data, delete the 'local-resume.db' file in the application directory.`}
          </p>
        </div>

        <div className="flex items-center self-center">
          <Button disabled variant="outline">
            {t`Local Mode - Manual Reset Required`}
          </Button>
        </div>
      </div>
    </div>
  );
};
