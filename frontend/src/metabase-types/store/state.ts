import { User } from "metabase-types/api";
import { AdminState } from "./admin";
import { AppState } from "./app";
import { EntitiesState } from "./entities";
import { FormState } from "./forms";
import { QueryBuilderState } from "./qb";
import { SettingsState } from "./settings";
import { SetupState } from "./setup";

export interface State {
  admin: AdminState;
  app: AppState;
  currentUser: User;
  entities: EntitiesState;
  form: FormState;
  qb: QueryBuilderState;
  settings: SettingsState;
  setup: SetupState;
}
