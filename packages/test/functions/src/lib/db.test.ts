import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  cancellationCodes,
  decodePageToken,
  encodePageToken,
  getClient,
  getItem,
  putItem,
  queryAll,
  queryPage,
} from "@movie-date/functions/lib/db";
import { ValidationError } from "@movie-date/functions/lib/errors";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

const dynamo = mockClient(getClient());

beforeEach(() => {
  dynamo.reset();
});

describe("getItem", () => {
  it("asks for a consistent read only when told to", async () => {
    dynamo.on(GetCommand).resolves({});
    await getItem({ pk: "a", sk: "b" });
    await getItem({ pk: "a", sk: "b" }, { consistent: true });
    const [plain, consistent] = dynamo.commandCalls(GetCommand);
    expect(plain?.args[0].input.ConsistentRead).toBeUndefined();
    expect(consistent?.args[0].input.ConsistentRead).toBe(true);
  });
});

describe("putItem", () => {
  it("adds the not-exists condition when asked", async () => {
    dynamo.on(PutCommand).resolves({});
    await putItem({ pk: "a", sk: "b" }, { ifNotExists: true });
    expect(dynamo.commandCalls(PutCommand)[0]?.args[0].input.ConditionExpression).toBe(
      "attribute_not_exists(pk)",
    );
  });
});

describe("queryAll", () => {
  it("follows continuation keys", async () => {
    dynamo
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ pk: "p", sk: "1" }], LastEvaluatedKey: { pk: "p", sk: "1" } })
      .resolvesOnce({ Items: [{ pk: "p", sk: "2" }] });
    const items = await queryAll("p", { skPrefix: "S" });
    expect(items.map((item) => item.sk)).toEqual(["1", "2"]);
  });
});

describe("queryPage", () => {
  it("round-trips the continuation key through an opaque token", async () => {
    const lastKey = { pk: "p", sk: "1" };
    dynamo
      .on(QueryCommand)
      .resolvesOnce({ Items: [lastKey], LastEvaluatedKey: lastKey })
      .resolvesOnce({ Items: [] });
    const first = await queryPage("p", { limit: 1, descending: true });
    expect(first.nextToken).not.toBeNull();

    const second = await queryPage("p", { limit: 1, nextToken: first.nextToken });
    expect(second.nextToken).toBeNull();
    expect(dynamo.commandCalls(QueryCommand)[1]?.args[0].input.ExclusiveStartKey).toEqual(lastKey);
  });
});

describe("decodePageToken", () => {
  it("refuses a token from another partition", () => {
    const token = encodePageToken({ pk: "ROOM#other", sk: "1" });
    expect(() => decodePageToken(token, "ROOM#mine")).toThrow(ValidationError);
  });

  it("refuses garbage", () => {
    expect(() => decodePageToken("!!not-json", "p")).toThrow(ValidationError);
  });
});

describe("cancellationCodes", () => {
  it("reads per-item codes from a cancelled transaction", () => {
    const error = Object.assign(new Error("cancelled"), {
      name: "TransactionCanceledException",
      CancellationReasons: [{ Code: "None" }, { Code: "ConditionalCheckFailed" }],
    });
    expect(cancellationCodes(error)).toEqual(["None", "ConditionalCheckFailed"]);
  });

  it("is empty for other errors", () => {
    expect(cancellationCodes(new Error("nope"))).toEqual([]);
  });
});
