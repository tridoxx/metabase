import { t } from "ttag";

import { Icon } from "metabase/ui";

import { RadioInput, Tab, TabBar } from "./EditorTabs.styled";

type Props = {
  currentTab: string;
  disabledMetadata: boolean;
  onChange: (optionId: string) => void;
};

export function EditorTabs({
  currentTab,
  disabledMetadata,
  onChange,
  ...props
}: Props) {
  return (
    <TabBar {...props}>
      <li>
        <Tab htmlFor="editor-tabs-query" selected={currentTab === "query"}>
          <Icon name="notebook" />
          <RadioInput
            id="editor-tabs-query"
            name="editor-tabs"
            value="query"
            checked={currentTab === "query"}
            onChange={() => {
              onChange("query");
            }}
          />
          <span>{t`Query`}</span>
        </Tab>
      </li>

      <li>
        <Tab
          htmlFor="editor-tabs-metadata"
          selected={currentTab === "metadata"}
          disabled={disabledMetadata}
        >
          <Icon name="notebook" />
          <RadioInput
            id="editor-tabs-metadata"
            name="editor-tabs"
            value="metadata"
            checked={currentTab === "metadata"}
            onChange={() => {
              onChange("metadata");
            }}
            disabled={disabledMetadata}
            data-testid="editor-tabs-metadata"
          />
          <span>{t`Metadata`}</span>
        </Tab>
      </li>
    </TabBar>
  );
}
