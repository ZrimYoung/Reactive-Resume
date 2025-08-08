import { t, Trans } from "@lingui/macro";
import { Book, EnvelopeSimpleOpen, GithubLogo, HandHeart } from "@phosphor-icons/react";
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";

import { SectionIcon } from "../shared/section-icon";

const DonateCard = () => (
  <Card className="space-y-4 bg-info text-info-foreground">
    <CardContent className="space-y-2">
      <CardTitle>{t`Support the app by donating what you can!`}</CardTitle>
      <CardDescription className="space-y-2">
        <Trans>
          <p>
            I built Reactive Resume mostly by myself during my spare time, with a lot of help from
            other great open-source contributors.
          </p>
          <p>
            If you like the app and want to support keeping it free forever, please donate whatever
            you can afford to give.
          </p>
        </Trans>
      </CardDescription>
    </CardContent>
    <CardFooter>
      <a
        href="https://opencollective.com/reactive-resume"
        className={cn(buttonVariants({ size: "sm" }))}
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        <HandHeart size={14} weight="bold" className="mr-2" />
        <span className="line-clamp-1">{t`Donate to Reactive Resume`}</span>
      </a>
    </CardFooter>
  </Card>
);

const IssuesCard = () => (
  <Card className="space-y-4">
    <CardContent className="space-y-2">
      <CardTitle>{t`Found a bug, or have a new feature idea?`}</CardTitle>
      <CardDescription className="space-y-2">
        <Trans>
          <p>I'm sure the app is not perfect, but I'd like for it to be.</p>
          <p>
            If you faced any issues while creating your resume, or have an idea that would help you
            and other users in creating your resume more easily, drop an issue on the repository or
            send me an email about it.
          </p>
        </Trans>
      </CardDescription>
    </CardContent>
    <CardFooter className="flex-row-reverse gap-x-2">
      <a
        href="https://github.com/AmruthPillai/Reactive-Resume/issues/new/choose"
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        <GithubLogo size={14} weight="bold" className="mr-2" />
        <span>{t`Raise an issue`}</span>
      </a>
      <a
        href="mailto:hello@amruthpillai.com?subject=Reactive Resume Feedback"
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        <EnvelopeSimpleOpen size={14} weight="bold" className="mr-2" />
        <span>{t`Email me`}</span>
      </a>
    </CardFooter>
  </Card>
);

const DocumentationCard = () => (
  <Card className="space-y-4">
    <CardContent className="space-y-2">
      <CardTitle>{t`Don't know where to start? Click on the docs!`}</CardTitle>
      <CardDescription className="space-y-2">
        <Trans>
          <p>
            The community has spent a lot of time writing the documentation for Reactive Resume,
            which I'm sure would help you get on board with the application.
          </p>
          <p>
            There are a lot of examples to get you started, and a lot of features that you might not
            know about that would help you build the perfect resume.
          </p>
        </Trans>
      </CardDescription>
    </CardContent>
    <CardFooter>
      <a
        href="https://docs.rxresu.me/"
        className={cn(buttonVariants({ size: "sm" }))}
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        <Book size={14} weight="bold" className="mr-2" />
        <span>{t`Documentation`}</span>
      </a>
    </CardFooter>
  </Card>
);

export const InformationSection = () => {
  return null;
};
