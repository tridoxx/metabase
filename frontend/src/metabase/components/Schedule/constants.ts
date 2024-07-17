import { c, t } from "ttag";
import { times } from "underscore";

import { has24HourModeSetting } from "metabase/lib/time";
import type { ScheduleDayType } from "metabase-types/api";

export const minutes = times(60, n => ({
  label: n.toString(),
  value: n.toString(),
}));

export const getHours = () => {
  const localizedHours = [
    c("A time on a 24-hour clock").t`0:00`,
    c("A time").t`1:00`,
    c("A time").t`2:00`,
    c("A time").t`3:00`,
    c("A time").t`4:00`,
    c("A time").t`5:00`,
    c("A time").t`6:00`,
    c("A time").t`7:00`,
    c("A time").t`8:00`,
    c("A time").t`9:00`,
    c("A time").t`10:00`,
    c("A time").t`11:00`,
    c("A time").t`12:00`,
    c("A time on a 24-hour clock").t`13:00`,
    c("A time on a 24-hour clock").t`14:00`,
    c("A time on a 24-hour clock").t`15:00`,
    c("A time on a 24-hour clock").t`16:00`,
    c("A time on a 24-hour clock").t`17:00`,
    c("A time on a 24-hour clock").t`18:00`,
    c("A time on a 24-hour clock").t`19:00`,
    c("A time on a 24-hour clock").t`20:00`,
    c("A time on a 24-hour clock").t`21:00`,
    c("A time on a 24-hour clock").t`22:00`,
    c("A time on a 24-hour clock").t`23:00`,
  ];
  const isClock24Hour = has24HourModeSetting();
  return times(isClock24Hour ? 24 : 12, n => ({
    label: localizedHours[n],
    value: `${n}`,
  }));
};

export type Weekday = {
  label: string;
  value: ScheduleDayType;
};

/** These strings are created in a function, rather than in module scope, so that ttag is not called until the locale is set */
export const getScheduleStrings = () => {
  const scheduleOptionNames = {
    // The context is needed because 'hourly' can be an adjective ('hourly rate') or adverb ('update hourly'). Same with 'daily', 'weekly', and 'monthly'.
    hourly: c("adverb").t`hourly`,
    daily: c("adverb").t`daily`,
    weekly: c("adverb").t`weekly`,
    monthly: c("adverb").t`monthly`,
  };

  const weekdays: Weekday[] = [
    { label: t`Sunday`, value: "sun" },
    { label: t`Monday`, value: "mon" },
    { label: t`Tuesday`, value: "tue" },
    { label: t`Wednesday`, value: "wed" },
    { label: t`Thursday`, value: "thu" },
    { label: t`Friday`, value: "fri" },
    { label: t`Saturday`, value: "sat" },
  ];

  const weekdayOfMonthOptions = [
    { label: t`calendar day`, value: "calendar-day" },
    ...weekdays,
  ];

  const amAndPM = [
    { label: c("As in 9:00 AM").t`AM`, value: "0" },
    { label: c("As in 9:00 PM").t`PM`, value: "1" },
  ];

  const frames = [
    {
      label: c("Appears in contexts like 'Monthly on the first Monday'")
        .t`first`,
      value: "first",
    },
    {
      label: c("Appears in contexts like 'Monthly on the last Monday'").t`last`,
      value: "last",
    },
    {
      label: c(
        "This is a noun meaning 'the fifteenth of the month', not an adjective. It appears in the phrase 'Monthly on the 15th'",
      ).t`15th`,
      value: "mid",
    },
  ];
  return {
    scheduleOptionNames,
    weekdays,
    weekdayOfMonthOptions,
    amAndPM,
    frames,
  };
};

export const defaultDay = "mon";
export const defaultHour = 8;

export enum Cron {
  AllValues = "*",
  NoSpecificValue = "?",
  NoSpecificValue_Escaped = "\\?",
}
