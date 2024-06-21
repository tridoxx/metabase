import { t } from "ttag";

import { LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_ADMIN_TROUBLESHOOTING } from "metabase/plugins";

import { QueryValidator } from "./components/QueryValidator";

PLUGIN_ADMIN_TROUBLESHOOTING.EXTRA_ROUTES = [
  <Route
    key="query-validator"
    path="query-validator"
    component={QueryValidator}
  />,
];

PLUGIN_ADMIN_TROUBLESHOOTING.GET_EXTRA_NAV = () => [
  <LeftNavPaneItem
    key="query-validator"
    name={t`Query Validator`}
    path="/admin/troubleshooting/query-validator"
  />,
];
