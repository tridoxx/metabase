import type { ReactNode } from "react";
import { isValidElement } from "react";
import _ from "underscore";

import type { SelectProps } from "metabase/ui";
import { Box, Group } from "metabase/ui";

const placeholderRegex = /^\{([0-9])+\}$/;
export const addScheduleComponents = (
  str: string,
  components: ReactNode[],
): ReactNode => {
  const segments = str.split(/(?=\{)|(?<=\})/g).filter(part => part.trim());
  const arr = segments.map(segment => {
    const match = segment.match(placeholderRegex);
    return match ? components[parseInt(match[1])] : segment.trim();
  });
  const correctedArray = combineConsecutiveStrings(arr);
  const withBlanks = addBlanks(correctedArray);
  return withBlanks;
};

const addBlanks = (arr: ReactNode[]) => {
  const result: ReactNode[] = [];
  const addBlank = () =>
    result.push(<Box key={`blank-${result.length}`}></Box>);
  for (let c = 0; c < arr.length; c++) {
    const curr = arr[c];
    const next = arr[c + 1];
    const nodeAfterNext = arr[c + 2];
    const isLastItemString = c === arr.length - 1 && typeof curr === "string";
    const isCurrentNodeASelect = isValidElement(curr);
    const isNextNodeASelect = isValidElement(next);
    const isNodeAfterNextASelect = isValidElement(nodeAfterNext);
    if (isLastItemString) {
      if (arr.length === 2) {
        result[result.length - 1] = (
          <Group spacing="md" key={`items-on-one-line`}>
            {result[result.length - 1]}
            {curr}
          </Group>
        );
      } else {
        addBlank();
        result.push(
          <Box key={curr} mt="-.5rem">
            {curr}
          </Box>,
        );
      }
    } else {
      const isFirstItemString = c === 0 && typeof curr !== "string";
      if (isFirstItemString) {
        addBlank();
      }
      if (typeof curr === "string") {
        const wrappedCurr = (
          <Box key={`wrapped-${curr}`} style={{ textAlign: "end" }}>
            {curr}
          </Box>
        );
        result.push(wrappedCurr);
      } else {
        result.push(curr);
      }
    }
    // Insert blank nodes between adjacent Selects unless they can fit on one line
    if (isCurrentNodeASelect && isNextNodeASelect) {
      const canSelectsProbablyFitOnOneLine =
        (curr.props.longestLabel?.length || 5) +
          (next.props.longestLabel?.length || 5) <
        24;
      if (canSelectsProbablyFitOnOneLine) {
        result[result.length - 1] = (
          <Group spacing="xs" key={`selects-on-one-line`}>
            {result[result.length - 1]}
            {next}
          </Group>
        );
        if (isNodeAfterNextASelect) {
          addBlank();
        }
        c++;
      } else {
        addBlank();
      }
    }
  }
  return <>{result}</>;
};

export const combineConsecutiveStrings = (arr: any[]) => {
  return arr.reduce((acc, item) => {
    const lastItem = _.last(acc);
    if (typeof item === "string" && typeof lastItem === "string") {
      acc[acc.length - 1] += ` ${item}`;
    } else {
      acc.push(item);
    }
    return acc;
  }, []);
};

export const getLongestSelectLabel = (data: SelectProps["data"]) =>
  data.reduce<string>((acc, option) => {
    const label = typeof option === "string" ? option : option.label || "";
    return label.length > acc.length ? label : acc;
  }, "");
