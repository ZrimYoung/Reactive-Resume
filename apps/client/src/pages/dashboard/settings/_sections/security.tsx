import { t, Trans } from "@lingui/macro";

export const SecuritySettings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold leading-relaxed tracking-tight">{t`Security`}</h3>
        <p className="leading-relaxed opacity-75">
          {t`In local mode, authentication and security features are not needed.`}
        </p>
      </div>

      <div className="p-4 rounded-lg bg-muted">
        <h4 className="font-semibold mb-2">{t`Local Mode Information`}</h4>
        <p className="text-sm opacity-75">
          <Trans>
            Since you're running in local mode, password changes and two-factor authentication
            are not available. Your data is stored locally and accessed directly without authentication.
          </Trans>
        </p>
      </div>
    </div>
  );
};
