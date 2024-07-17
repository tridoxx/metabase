import { useMemo } from "react";
import { t } from "ttag";

import type { Download } from "metabase-types/store";

import StatusLarge from "../StatusLarge";
import { isCompleted, isErrored, isInProgress } from "../utils/downloads";

export interface DownloadsStatusLargeProps {
  hasActiveDownloads: boolean;
  downloads: Download[];
  onDismiss: () => void;
  onCollapse: () => void;
}

export const DownloadsStatusLarge = ({
  hasActiveDownloads,
  downloads,
  onDismiss,
  onCollapse,
}: DownloadsStatusLargeProps) => {
  const status = useMemo(() => {
    return {
      title: getTitle(downloads),
      items: downloads.map(download => ({
        id: download.id,
        title: download.name,
        icon: "download",
        description: getDownloadDescription(download),
        isInProgress: isInProgress(download),
        isCompleted: isCompleted(download),
        isAborted: isErrored(download),
      })),
    };
  }, [downloads]);

  return (
    <StatusLarge
      isActive
      status={status}
      onCollapse={hasActiveDownloads ? onCollapse : undefined}
      onDismiss={hasActiveDownloads ? undefined : onDismiss}
    />
  );
};

const getTitle = (downloads: Download[]): string => {
  const isDone = downloads.every(isCompleted);
  const isError = downloads.some(isErrored);

  if (isError) {
    return t`Download error`;
  } else if (isDone) {
    return t`Done!`;
  } else {
    return t`Downloading…`;
  }
};

const getDownloadDescription = (download: Download): string => {
  const isDone = isCompleted(download);
  const isError = isErrored(download);

  if (isError) {
    return download.error ?? t`Download failed`;
  } else if (isDone) {
    return t`Download completed`;
  } else {
    return "";
  }
};
