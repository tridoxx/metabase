import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import type {
  BreakoutChartColumns,
  CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import type { RowValue, SingleSeries } from "metabase-types/api";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  sumMetric,
  getDatasetKey,
  getJoinedCardsDataset,
  replaceValues,
  getDatasetExtents,
  applyVisualizationSettingsDataTransformations,
  applySquareRootScaling,
  sortDataset,
} from "./dataset";
import type {
  DataKey,
  LegacySeriesSettingsObjectKey,
  SeriesModel,
} from "./types";

const createMockSeriesModel = (
  dataKey: DataKey,
  columnIndex: number = 1,
): SeriesModel => ({
  dataKey,
  name: `name for ${dataKey}`,
  color: "red",
  legacySeriesSettingsObjectKey: { card: { _seriesKey: dataKey } },
  vizSettingsKey: dataKey,
  column: createMockColumn({ name: dataKey }),
  columnIndex,
});

const createMockComputedVisualizationSettings = (
  opts: Partial<ComputedVisualizationSettings> = {},
) => {
  return createMockVisualizationSettings({
    series: () => ({}),
    ...opts,
  });
};

describe("dataset transform functions", () => {
  describe("sumMetric", () => {
    it("should return the sum when both arguments are numbers", () => {
      expect(sumMetric(3, 7)).toBe(10);
    });

    it("should return the left number when right is not a number", () => {
      expect(sumMetric(5, null)).toBe(5);
    });

    it("should return the right number when left is not a number", () => {
      expect(sumMetric(null, 5)).toBe(5);
    });

    it("should return null when neither left nor right is a number", () => {
      expect(sumMetric(null, null)).toBeNull();
    });
  });

  describe("getDatasetKey", () => {
    const column = createMockColumn({ name: "count" });

    it("should return the column name if cardId and breakoutValue are undefined", () => {
      expect(getDatasetKey(column, undefined)).toBe("null:count");
    });

    it("should return the cardId concatenated with column name if cardId is provided and breakoutValue is undefined", () => {
      expect(getDatasetKey(column, 1)).toBe("1:count");
    });

    it("should return the breakoutValue concatenated with column name if breakoutValue is provided and cardId is undefined", () => {
      expect(getDatasetKey(column, undefined, "breakoutValue")).toBe(
        "null:count:breakoutValue",
      );
    });

    it("should return the cardId, breakoutValue and column name concatenated if all are provided", () => {
      expect(getDatasetKey(column, 1, "breakoutValue")).toBe(
        "1:count:breakoutValue",
      );
    });

    it("should handle different types of breakout values correctly", () => {
      expect(getDatasetKey(column, 1, "stringValue")).toBe(
        "1:count:stringValue",
      );
      expect(getDatasetKey(column, 1, 123)).toBe("1:count:123");
      expect(getDatasetKey(column, 1, true)).toBe("1:count:true");
      expect(getDatasetKey(column, 1, null)).toBe("1:count:null");
    });
  });

  describe("getJoinedCardsDataset", () => {
    const columns1: CartesianChartColumns = {
      dimension: { index: 0, column: createMockColumn({ name: "month" }) },
      metrics: [
        {
          index: 2,
          column: createMockColumn({
            name: "count",
            base_type: "type/Integer",
          }),
        },
      ],
    };

    const columns2: BreakoutChartColumns = {
      dimension: { index: 0, column: createMockColumn({ name: "also_month" }) },
      metric: {
        index: 2,
        column: createMockColumn({
          name: "count",
          base_type: "type/Integer",
        }),
      },
      breakout: { index: 1, column: createMockColumn({ name: "type" }) },
    };

    const rawSeries1: SingleSeries = {
      card: createMockCard({ id: 1 }),
      data: createMockDatasetData({
        rows: [
          [1, "category1", 200],
          [2, "category1", 300],
          [3, "category2", 400],
          [3, "category3", 500],
        ],
        cols: [
          columns1.dimension.column,
          createMockColumn({ name: "category" }),
          columns1.metrics[0].column,
        ],
      }),
    };

    const rawSeries2: SingleSeries = {
      card: createMockCard({ id: 2 }),
      data: createMockDatasetData({
        rows: [
          [1, "type1", 100],
          [2, "type1", 200],
          [3, "type2", 300],
          [3, "type3", 400],
        ],
        cols: [
          columns2.dimension.column,
          columns2.breakout.column,
          columns2.metric.column,
        ],
      }),
    };

    it("should sum metrics by the specified dimension", () => {
      const result = getJoinedCardsDataset([rawSeries1], [columns1]);
      expect(result).toStrictEqual([
        {
          [X_AXIS_DATA_KEY]: 1,
          "1:category": "category1",
          "1:month": 1,
          "1:count": 200,
        },
        {
          [X_AXIS_DATA_KEY]: 2,
          "1:category": "category1",
          "1:month": 2,
          "1:count": 300,
        },
        {
          [X_AXIS_DATA_KEY]: 3,
          "1:category": "category3",
          "1:month": 3,
          "1:count": 900,
        },
      ]);
    });

    it("should handle breakout column if provided", () => {
      const result = getJoinedCardsDataset([rawSeries2], [columns2]);
      expect(result).toStrictEqual([
        {
          [X_AXIS_DATA_KEY]: 1,
          "2:also_month:type1": 1,
          "2:count:type1": 100,
          "2:type:type1": "type1",
        },
        {
          [X_AXIS_DATA_KEY]: 2,
          "2:also_month:type1": 2,
          "2:count:type1": 200,
          "2:type:type1": "type1",
        },
        {
          [X_AXIS_DATA_KEY]: 3,
          "2:also_month:type2": 3,
          "2:also_month:type3": 3,
          "2:count:type2": 300,
          "2:count:type3": 400,
          "2:type:type2": "type2",
          "2:type:type3": "type3",
        },
      ]);
    });

    it("should join multiple rawSeries (combined cards) by their dimension columns", () => {
      const result = getJoinedCardsDataset(
        [rawSeries1, rawSeries2],
        [columns1, columns2],
      );
      expect(result).toStrictEqual([
        {
          [X_AXIS_DATA_KEY]: 1,
          "1:category": "category1",
          "1:month": 1,
          "1:count": 200,
          "2:also_month:type1": 1,
          "2:count:type1": 100,
          "2:type:type1": "type1",
        },
        {
          [X_AXIS_DATA_KEY]: 2,
          "1:category": "category1",
          "1:month": 2,
          "1:count": 300,
          "2:also_month:type1": 2,
          "2:count:type1": 200,
          "2:type:type1": "type1",
        },
        {
          [X_AXIS_DATA_KEY]: 3,
          "1:category": "category3",
          "1:month": 3,
          "1:count": 900,
          "2:also_month:type2": 3,
          "2:also_month:type3": 3,
          "2:count:type2": 300,
          "2:count:type3": 400,
          "2:type:type2": "type2",
          "2:type:type3": "type3",
        },
      ]);
    });

    it("should handle empty arrays", () => {
      const result = getJoinedCardsDataset([], []);
      expect(result).toEqual([]);
    });
  });

  describe("replaceValues", () => {
    it("should replace missing values with zeros according to the replacer function", () => {
      const dataset: Record<DataKey, RowValue>[] = [
        { key1: null, key2: 2 },
        { key1: 3, key2: null },
      ];
      const replacer = (dataKey: string, value: RowValue) => {
        if (dataKey === "key1") {
          return value;
        }
        return value ?? 0;
      };

      const result = replaceValues(dataset, replacer);

      expect(result).toEqual([
        { key1: null, key2: 2 },
        { key1: 3, key2: 0 },
      ]);
    });
  });

  describe("applyVisualizationSettingsDataTransformations", () => {
    const originalDataset = [
      {
        [X_AXIS_DATA_KEY]: "A",
        dimensionKey: "A",
        series1: 100,
        series2: 200,
        unusedSeries: 100,
      },
      {
        [X_AXIS_DATA_KEY]: "B",
        dimensionKey: "B",
        series1: 300,
        series2: 400,
        unusedSeries: 100,
      },
    ];

    const seriesModels = [
      createMockSeriesModel("series1"),
      createMockSeriesModel("series2"),
    ];

    it("should populate dataset with min numeric values for positive and negative stack totals", () => {
      const result = applyVisualizationSettingsDataTransformations(
        originalDataset,
        seriesModels,
        createMockComputedVisualizationSettings({
          "stackable.stack_type": "stacked",
        }),
      );

      expect(result).toEqual([
        {
          [X_AXIS_DATA_KEY]: "A",
          [POSITIVE_STACK_TOTAL_DATA_KEY]: Number.MIN_VALUE,
          [NEGATIVE_STACK_TOTAL_DATA_KEY]: -Number.MIN_VALUE,
          dimensionKey: "A",
          series1: 100,
          series2: 200,
          unusedSeries: 100,
        },
        {
          [X_AXIS_DATA_KEY]: "B",
          [POSITIVE_STACK_TOTAL_DATA_KEY]: Number.MIN_VALUE,
          [NEGATIVE_STACK_TOTAL_DATA_KEY]: -Number.MIN_VALUE,
          dimensionKey: "B",
          series1: 300,
          series2: 400,
          unusedSeries: 100,
        },
      ]);
    });

    it("should return an array of normalized datasets", () => {
      const result = applyVisualizationSettingsDataTransformations(
        originalDataset,
        seriesModels,
        createMockComputedVisualizationSettings({
          "stackable.stack_type": "normalized",
        }),
      );

      expect(result).toEqual([
        {
          [X_AXIS_DATA_KEY]: "A",
          series1: 1 / 3,
          series2: 2 / 3,
        },
        {
          [X_AXIS_DATA_KEY]: "B",
          series1: 3 / 7,
          series2: 4 / 7,
        },
      ]);
    });

    it("should handle rows with missing values", () => {
      const dataset = [
        {
          [X_AXIS_DATA_KEY]: "A",
          dimensionKey: "A",
          series1: null,
          series2: 200,
        },
      ];

      const result = applyVisualizationSettingsDataTransformations(
        dataset,
        seriesModels,
        createMockComputedVisualizationSettings({
          series: (key: LegacySeriesSettingsObjectKey) => ({
            "line.missing":
              key.card._seriesKey === "series1" ? "zero" : undefined,
          }),
        }),
      );

      expect(result).toEqual([
        {
          [X_AXIS_DATA_KEY]: "A",
          dimensionKey: "A",
          series1: 0,
          series2: 200,
        },
      ]);
    });

    it("should work on empty datasets", () => {
      const result = applyVisualizationSettingsDataTransformations(
        [],
        seriesModels,
        createMockVisualizationSettings({
          series: (key: LegacySeriesSettingsObjectKey) => ({
            "line.missing":
              key.card._seriesKey === "series1" ? "zero" : undefined,
          }),
          "stackable.stack_type": "stacked",
        }),
      );

      expect(result).toEqual([]);
    });
  });

  describe("getDatasetExtents", () => {
    const keys = ["series1", "series2"];

    test("should return correct extents for each series", () => {
      const dataset = [
        { [X_AXIS_DATA_KEY]: 1, series1: -100, series2: 4 },
        { [X_AXIS_DATA_KEY]: 2, series1: 3, series2: 2 },
        { [X_AXIS_DATA_KEY]: 3, series1: 2, series2: 5 },
      ];

      const result = getDatasetExtents(keys, dataset);

      expect(result).toEqual({
        series1: [-100, 3],
        series2: [2, 5],
      });
    });

    test("should ignore non-numeric values", () => {
      const keys = ["series1", "series2"];
      const dataset = [
        { [X_AXIS_DATA_KEY]: 1, series1: 1, series2: null },
        { [X_AXIS_DATA_KEY]: 2, series1: null, series2: 2 },
        { [X_AXIS_DATA_KEY]: 3, series1: 2, series2: null },
      ];

      const result = getDatasetExtents(keys, dataset);

      expect(result).toEqual({
        series1: [1, 2],
        series2: [2, 2],
      });
    });
  });

  describe("getTransformedDataset", () => {
    const seriesKey = "value";
    // const dimensionKey = "date";
    const seriesModels = [createMockSeriesModel("value", 0)];
    // const dimensionModel = createMockDimensionModel("date", 1);

    it("should sort time-series datasets", () => {
      const dataset = [
        { [X_AXIS_DATA_KEY]: "2022-03-01", [seriesKey]: 10 },
        { [X_AXIS_DATA_KEY]: "2022-01-01", [seriesKey]: 5 },
        { [X_AXIS_DATA_KEY]: "2022-02-01", [seriesKey]: 8 },
      ];

      const result = sortDataset(dataset, "timeseries");

      expect(result[0][X_AXIS_DATA_KEY]).toBe("2022-01-01");
      expect(result[1][X_AXIS_DATA_KEY]).toBe("2022-02-01");
      expect(result[2][X_AXIS_DATA_KEY]).toBe("2022-03-01");
    });

    it.each(["linear", "pow", "log"] as const)(
      "should sort numeric datasets",
      xAxisScale => {
        const dataset = [
          { [X_AXIS_DATA_KEY]: 1000, [seriesKey]: 10 },
          { [X_AXIS_DATA_KEY]: 1, [seriesKey]: 5 },
          { [X_AXIS_DATA_KEY]: 5, [seriesKey]: 8 },
        ];

        const result = sortDataset(dataset, xAxisScale);

        expect(result[0][X_AXIS_DATA_KEY]).toBe(1);
        expect(result[1][X_AXIS_DATA_KEY]).toBe(5);
        expect(result[2][X_AXIS_DATA_KEY]).toBe(1000);
      },
    );

    it("handles empty datasets without errors", () => {
      expect(() =>
        applyVisualizationSettingsDataTransformations(
          [],
          seriesModels,
          createMockComputedVisualizationSettings(),
        ),
      ).not.toThrow();
    });
  });
});

describe("applySquareRootScaling", () => {
  it("should apply square root scaling to numeric values", () => {
    expect(applySquareRootScaling(0)).toBe(0);
    expect(applySquareRootScaling(1)).toBe(1);
    expect(applySquareRootScaling(16)).toBe(4);
  });

  it("should preserve numeric values sign", () => {
    expect(applySquareRootScaling(-1)).toBe(-1);
    expect(applySquareRootScaling(-16)).toBe(-4);
  });

  it("should return other types unchanged", () => {
    expect(applySquareRootScaling(null)).toBe(null);
    expect(applySquareRootScaling("foo")).toBe("foo");
    expect(applySquareRootScaling(true)).toBe(true);
  });
});