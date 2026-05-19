import { describe, expect, it } from "vitest";
import { parsePagination } from "../../../src/http/pagination.js";

describe("parsePagination", () => {
  it("uses defaults when query empty", () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
  });

  it("caps limit at 100", () => {
    expect(parsePagination({ limit: "500" })).toEqual({ limit: 100, offset: 0 });
  });

  it("clamps invalid limit to default", () => {
    expect(parsePagination({ limit: "0" })).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination({ limit: "not-a-number" })).toEqual({ limit: 50, offset: 0 });
  });

  it("parses valid limit and offset", () => {
    expect(parsePagination({ limit: "10", offset: "20" })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it("clamps negative offset to zero", () => {
    expect(parsePagination({ offset: "-5" })).toEqual({ limit: 50, offset: 0 });
  });
});
