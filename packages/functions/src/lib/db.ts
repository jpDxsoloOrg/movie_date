import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { ValidationError } from "./errors.js";
import type { TableKey } from "./keys.js";

export type Item = Record<string, unknown> & TableKey;

let documentClient: DynamoDBDocumentClient | undefined;

export function getClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return documentClient;
}

export function tableName(): string {
  const name = process.env.TABLE_NAME;
  if (!name) throw new Error("TABLE_NAME is not set");
  return name;
}

export interface GetOptions {
  /** Needed straight after a write, e.g. the tally read that follows a swipe. */
  consistent?: boolean;
}

export async function getItem<T extends Item = Item>(
  key: TableKey,
  options: GetOptions = {},
): Promise<T | undefined> {
  const result = await getClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: key,
      ...(options.consistent ? { ConsistentRead: true } : {}),
    }),
  );
  return result.Item as T | undefined;
}

export interface PutOptions {
  /** Fail with a condition error when the row already exists. */
  ifNotExists?: boolean;
}

export async function putItem(item: Item, options: PutOptions = {}): Promise<void> {
  await getClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
      ...(options.ifNotExists ? { ConditionExpression: "attribute_not_exists(pk)" } : {}),
    }),
  );
}

export interface UpdateOptions {
  updateExpression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
  conditionExpression?: string;
}

export async function updateItem<T extends Item = Item>(
  key: TableKey,
  options: UpdateOptions,
): Promise<T | undefined> {
  const result = await getClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: key,
      UpdateExpression: options.updateExpression,
      ...(options.names ? { ExpressionAttributeNames: options.names } : {}),
      ...(options.values ? { ExpressionAttributeValues: options.values } : {}),
      ...(options.conditionExpression ? { ConditionExpression: options.conditionExpression } : {}),
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes as T | undefined;
}

export async function deleteItem(key: TableKey): Promise<void> {
  await getClient().send(new DeleteCommand({ TableName: tableName(), Key: key }));
}

export type TransactItems = NonNullable<TransactWriteCommandInput["TransactItems"]>;

export async function transactWrite(items: TransactItems): Promise<void> {
  await getClient().send(new TransactWriteCommand({ TransactItems: items }));
}

export interface QueryOptions {
  skPrefix?: string;
  /** Newest first for rows whose sort key leads with a timestamp. */
  descending?: boolean;
  consistent?: boolean;
}

function queryInput(pk: string, options: QueryOptions) {
  return {
    TableName: tableName(),
    KeyConditionExpression: options.skPrefix
      ? "pk = :pk AND begins_with(sk, :sk)"
      : "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": pk,
      ...(options.skPrefix ? { ":sk": options.skPrefix } : {}),
    },
    ...(options.descending ? { ScanIndexForward: false } : {}),
    ...(options.consistent ? { ConsistentRead: true } : {}),
  };
}

/** Every row under a partition or sort-key prefix, following continuation keys. */
export async function queryAll<T extends Item = Item>(
  pk: string,
  options: QueryOptions = {},
): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await getClient().send(
      new QueryCommand({
        ...queryInput(pk, options),
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    items.push(...((result.Items ?? []) as T[]));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export interface PageOptions extends QueryOptions {
  limit: number;
  nextToken?: string | null;
}

export interface ItemPage<T> {
  items: T[];
  nextToken: string | null;
}

export function encodePageToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

/**
 * Tokens come back from the client, so only a key inside the partition being
 * read is accepted. Otherwise a forged token could page through another room.
 */
export function decodePageToken(token: string, pk: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid page token.");
  }
  if (typeof decoded !== "object" || decoded === null || !("pk" in decoded) || decoded.pk !== pk) {
    throw new ValidationError("Invalid page token.");
  }
  return decoded as Record<string, unknown>;
}

export async function queryPage<T extends Item = Item>(
  pk: string,
  options: PageOptions,
): Promise<ItemPage<T>> {
  const result = await getClient().send(
    new QueryCommand({
      ...queryInput(pk, options),
      Limit: options.limit,
      ...(options.nextToken
        ? { ExclusiveStartKey: decodePageToken(options.nextToken, pk) }
        : {}),
    }),
  );
  return {
    items: (result.Items ?? []) as T[],
    nextToken: result.LastEvaluatedKey ? encodePageToken(result.LastEvaluatedKey) : null,
  };
}

export function isConditionFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

export function isTransactionCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "TransactionCanceledException";
}

/** Per-item codes of a cancelled transaction, in the order the items were sent. */
export function cancellationCodes(error: unknown): (string | undefined)[] {
  if (!isTransactionCancelled(error)) return [];
  const reasons = (error as { CancellationReasons?: unknown }).CancellationReasons;
  if (!Array.isArray(reasons)) return [];
  return reasons.map((reason: { Code?: unknown } | null) =>
    typeof reason?.Code === "string" ? reason.Code : undefined,
  );
}
