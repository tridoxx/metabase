import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  createQuestion,
  visitQuestion,
  withDatabase,
  queryQADB,
  onlyOnOSS,
  describeEE,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describeEE("query validator", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("bad field reference", () => {
    setupQuestionWithBadFieldReference();
    cy.get("@questionId").then(questionId => visitQuestion(questionId));
  });

  it("bad source table", () => {
    setupQuestionWithBadSourceTable();
    cy.get("@questionId").then(questionId => visitQuestion(questionId));
  });

  it("bad db reference", () => {
    setupQuestionWithBadDb();
    cy.get("@questionId").then(questionId => visitQuestion(questionId));
  });
});

describe("OSS", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore();
    cy.signInAsAdmin();
  });

  it("should not be present in OSS", () => {
    cy.visit("/admin/troubleshooting");
    cy.findByTestId("admin-layout-sidebar").should(
      "not.contain",
      "Query Validator",
    );
  });
});

const setupQuestionWithBadFieldReference = () => {
  createQuestion(
    {
      name: "Orders with bad field ref",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", 25, { "temporal-unit": "year" }]],
      },
      display: "line",
    },
    {
      wrapId: true,
    },
  );
};

const setupQuestionWithBadSourceTable = () => {
  withDatabase(2, ({ FEEDBACK_ID }) => {
    createQuestion(
      {
        name: "Orders with bad source table",
        query: {
          "source-table": FEEDBACK_ID,
        },
        database: 2,
        display: "table",
      },
      {
        wrapId: true,
      },
    );
  });

  queryQADB("DROP TABLE FEEDBACK");
};

const setupQuestionWithBadDb = () => {
  withDatabase(2, ({ FEEDBACK_ID }) => {
    createQuestion(
      {
        name: "Orders with bad source table",
        query: {
          "source-table": FEEDBACK_ID,
        },
        database: 2,
        display: "table",
      },
      {
        wrapId: true,
      },
    );
  });

  cy.request("DELETE", "/api/database/2");
};
