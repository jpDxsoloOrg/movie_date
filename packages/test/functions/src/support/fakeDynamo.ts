/**
 * An in-memory single table that behaves like DynamoDB where this code depends
 * on it: conditions are really evaluated, transactions are all-or-nothing, and a
 * transaction overlapping another is cancelled with TransactionConflict, which a
 * plain mock can't show. Every call yields to the event loop first, so handlers
 * started with Promise.all genuinely interleave. Only the expression forms this
 * codebase writes are understood; anything else throws.
 */
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DeleteCommandInput,
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
  type TransactWriteCommandInput,
  type UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { getClient, type TransactItems } from "@movie-date/functions/lib/db";
import { mockClient } from "aws-sdk-client-mock";

export type Row = Record<string, unknown> & { pk: string; sk: string };
type Names = Record<string, string> | undefined;
type Values = Record<string, unknown> | undefined;

const MAX_TRANSACTION_ITEMS = 100;

function storeKey(key: Record<string, unknown>): string {
  return `${String(key.pk)}\u0000${String(key.sk)}`;
}

function attribute(token: string, names: Names): string {
  if (!token.startsWith("#")) return token;
  const name = names?.[token];
  if (!name) throw new Error(`Unbound attribute name ${token}`);
  return name;
}

function value(token: string, values: Values): unknown {
  if (!values || !(token in values)) throw new Error(`Unbound value ${token}`);
  return values[token];
}

function passes(expression: string, row: Row | undefined, names: Names, values: Values): boolean {
  return expression.split(/\s+OR\s+/).some((alternative) => allPass(alternative, row, names, values));
}

function allPass(expression: string, row: Row | undefined, names: Names, values: Values): boolean {
  return expression.split(/\s+AND\s+/).every((clause) => {
    const trimmed = clause.trim();
    const existence = /^attribute_(not_)?exists\(([#\w]+)\)$/.exec(trimmed);
    if (existence) {
      const present = row !== undefined && attribute(existence[2] ?? "", names) in row;
      return existence[1] ? !present : present;
    }
    const comparison = /^([#\w]+) (=|>=|<) (:\w+)$/.exec(trimmed);
    if (!comparison) throw new Error(`Unsupported condition: ${trimmed}`);
    const actual = row?.[attribute(comparison[1] ?? "", names)];
    const expected = value(comparison[3] ?? "", values);
    if (comparison[2] === "=") return actual === expected;
    if (comparison[2] === "<") return typeof actual === "number" && actual < (expected as number);
    return typeof actual === "number" && actual >= (expected as number);
  });
}

function applySet(clause: string, row: Row, names: Names, values: Values): void {
  for (const assignment of clause.split(/,\s*(?![^(]*\))/)) {
    const [target = "", source = ""] = assignment.split(/\s*=\s*/);
    const name = attribute(target.trim(), names);
    const increment = /^([#\w]+) \+ (:\w+)$/.exec(source.trim());
    const fallback = /^if_not_exists\(([#\w]+), (:\w+)\)$/.exec(source.trim());
    const fallbackIncrement = /^if_not_exists\(([#\w]+), (:\w+)\) \+ (:\w+)$/.exec(source.trim());
    if (fallbackIncrement) {
      const current =
        row[attribute(fallbackIncrement[1] ?? "", names)] ?? value(fallbackIncrement[2] ?? "", values);
      row[name] = (current as number) + (value(fallbackIncrement[3] ?? "", values) as number);
    } else if (increment) {
      const current = row[attribute(increment[1] ?? "", names)] as number;
      row[name] = current + (value(increment[2] ?? "", values) as number);
    } else if (fallback) {
      row[name] = row[attribute(fallback[1] ?? "", names)] ?? value(fallback[2] ?? "", values);
    } else if (/^:\w+$/.test(source.trim())) {
      row[name] = value(source.trim(), values);
    } else {
      throw new Error(`Unsupported assignment: ${assignment}`);
    }
  }
}

function applyAdd(clause: string, row: Row, names: Names, values: Values): void {
  const [target = "", amount = ""] = clause.trim().split(/\s+/);
  const name = attribute(target, names);
  row[name] = ((row[name] as number | undefined) ?? 0) + (value(amount, values) as number);
}

function applyUpdate(expression: string, row: Row, names: Names, values: Values): void {
  const sections = expression.split(/\b(?=SET |ADD |REMOVE )/).filter((section) => section.trim());
  for (const section of sections) {
    const body = section.slice(4);
    if (section.startsWith("SET ")) applySet(body, row, names, values);
    else if (section.startsWith("ADD ")) applyAdd(body, row, names, values);
    else if (section.startsWith("REMOVE ")) {
      for (const target of section.slice("REMOVE ".length).split(/,\s*/)) {
        delete row[attribute(target.trim(), names)];
      }
    }
    else throw new Error(`Unsupported update: ${expression}`);
  }
}

function conditionFailed(): Error {
  const error = new Error("The conditional request failed");
  error.name = "ConditionalCheckFailedException";
  return error;
}

function cancelled(codes: string[]): Error {
  return Object.assign(new Error(`Transaction cancelled [${codes.join(", ")}]`), {
    name: "TransactionCanceledException",
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

function yieldToOthers(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

type TransactItem = TransactItems[number];

function itemKey(item: TransactItem): Record<string, unknown> {
  const key =
    item.Put?.Item ?? item.Update?.Key ?? item.Delete?.Key ?? item.ConditionCheck?.Key;
  if (!key) throw new Error("Empty transaction item");
  return key;
}

function itemCondition(item: TransactItem) {
  const part = item.Put ?? item.Update ?? item.Delete ?? item.ConditionCheck;
  return {
    expression: part?.ConditionExpression,
    names: part?.ExpressionAttributeNames,
    values: part?.ExpressionAttributeValues,
  };
}

export type TransactionHook = (items: TransactItems) => boolean | Promise<boolean>;

export class FakeDynamo {
  private rows = new Map<string, Row>();
  private held = new Set<string>();
  private hooks: TransactionHook[] = [];
  private client = mockClient(getClient());

  /** Forced cancellations, for exhausting retries. */
  conflictsToForce = 0;
  /** Queries under this sort-key prefix fail, for breaking one step of a flow. */
  failQueriesUnder: string | undefined;
  private afterCommit: ((items: TransactItems) => void) | undefined;

  constructor() {
    this.client.on(GetCommand).callsFake((input: GetCommandInput) => this.get(input));
    this.client.on(PutCommand).callsFake((input: PutCommandInput) => this.put(input));
    this.client.on(UpdateCommand).callsFake((input: UpdateCommandInput) => this.update(input));
    this.client.on(DeleteCommand).callsFake((input: DeleteCommandInput) => this.remove(input));
    this.client.on(QueryCommand).callsFake((input: QueryCommandInput) => this.query(input));
    this.client
      .on(TransactWriteCommand)
      .callsFake((input: TransactWriteCommandInput) => this.transact(input));
  }

  /**
   * Runs before each transaction until it returns true, then is dropped. Lets a
   * test land another request in the exact gap between a read and a write.
   */
  beforeTransaction(hook: TransactionHook): void {
    this.hooks.push(hook);
  }

  /** Called after each committed transaction, to change conditions mid-flow. */
  onCommit(listener: (items: TransactItems) => void): void {
    this.afterCommit = listener;
  }

  /** Makes the next plain writes fail as they would against an item in a transaction. */
  holdItem(key: { pk: string; sk: string }): () => void {
    this.held.add(storeKey(key));
    return () => this.held.delete(storeKey(key));
  }

  seed(row: Row): void {
    this.rows.set(storeKey(row), structuredClone(row));
  }

  find(pk: string, skPrefix = ""): Row[] {
    return [...this.rows.values()]
      .filter((row) => row.pk === pk && row.sk.startsWith(skPrefix))
      .sort((first, second) => (first.sk < second.sk ? -1 : 1));
  }

  findByPkPrefix(pkPrefix: string): Row[] {
    return [...this.rows.values()].filter((row) => row.pk.startsWith(pkPrefix));
  }

  row(pk: string, sk: string): Row | undefined {
    return this.rows.get(storeKey({ pk, sk }));
  }

  private refuseIfHeld(key: Record<string, unknown>): void {
    if (this.held.has(storeKey(key))) {
      const error = new Error("Transaction is ongoing for the item");
      error.name = "TransactionConflictException";
      throw error;
    }
  }

  private async get(input: GetCommandInput) {
    await yieldToOthers();
    const row = this.rows.get(storeKey(input.Key ?? {}));
    return { Item: row ? structuredClone(row) : undefined };
  }

  private async put(input: PutCommandInput) {
    await yieldToOthers();
    const item = input.Item as Row;
    this.refuseIfHeld(item);
    if (
      input.ConditionExpression &&
      !passes(
        input.ConditionExpression,
        this.rows.get(storeKey(item)),
        input.ExpressionAttributeNames,
        input.ExpressionAttributeValues,
      )
    ) {
      throw conditionFailed();
    }
    this.rows.set(storeKey(item), structuredClone(item));
    return {};
  }

  private async update(input: UpdateCommandInput) {
    await yieldToOthers();
    const key = input.Key as Row;
    this.refuseIfHeld(key);
    const row = this.rows.get(storeKey(key));
    const names = input.ExpressionAttributeNames;
    const values = input.ExpressionAttributeValues;
    if (
      input.ConditionExpression &&
      !passes(input.ConditionExpression, row, names, values)
    ) {
      throw conditionFailed();
    }
    const next = structuredClone(row ?? key);
    applyUpdate(input.UpdateExpression ?? "", next, names, values);
    this.rows.set(storeKey(key), next);
    return { Attributes: structuredClone(next) };
  }

  private async remove(input: DeleteCommandInput) {
    await yieldToOthers();
    this.refuseIfHeld(input.Key ?? {});
    this.rows.delete(storeKey(input.Key ?? {}));
    return {};
  }

  private async query(input: QueryCommandInput) {
    await yieldToOthers();
    const values = input.ExpressionAttributeValues ?? {};
    const prefix = typeof values[":sk"] === "string" ? values[":sk"] : "";
    if (this.failQueriesUnder && prefix.startsWith(this.failQueriesUnder)) {
      throw new Error("Query failed");
    }
    const matching = this.find(String(values[":pk"]), prefix);
    if (input.ScanIndexForward === false) matching.reverse();
    const start = input.ExclusiveStartKey;
    const startIndex = start
      ? matching.findIndex((row) => row.sk === start.sk) + 1
      : 0;
    const limit = input.Limit ?? matching.length;
    const page = matching.slice(startIndex, startIndex + limit);
    const last = page[page.length - 1];
    const more = startIndex + limit < matching.length;
    return {
      Items: structuredClone(page),
      LastEvaluatedKey: more && last ? { pk: last.pk, sk: last.sk } : undefined,
    };
  }

  private async runHooks(items: TransactItems): Promise<void> {
    const pending = this.hooks;
    this.hooks = [];
    for (const hook of pending) {
      if (!(await hook(items))) this.hooks.push(hook);
    }
  }

  private async transact(input: TransactWriteCommandInput) {
    const items = input.TransactItems ?? [];
    if (items.length > MAX_TRANSACTION_ITEMS) throw new Error("Too many transaction items");
    const itemKeys = items.map((item) => storeKey(itemKey(item)));
    if (new Set(itemKeys).size !== itemKeys.length) {
      throw new Error("Transaction touches the same item twice");
    }
    await this.runHooks(items);
    await yieldToOthers();

    if (this.conflictsToForce > 0) {
      this.conflictsToForce -= 1;
      throw cancelled(items.map(() => "TransactionConflict"));
    }
    if (itemKeys.some((key) => this.held.has(key))) {
      throw cancelled(itemKeys.map((key) => (this.held.has(key) ? "TransactionConflict" : "None")));
    }

    itemKeys.forEach((key) => this.held.add(key));
    try {
      await yieldToOthers();
      const codes = items.map((item, index) => {
        const { expression, names, values } = itemCondition(item);
        const row = this.rows.get(itemKeys[index] ?? "");
        return expression && !passes(expression, row, names, values)
          ? "ConditionalCheckFailed"
          : "None";
      });
      if (codes.includes("ConditionalCheckFailed")) throw cancelled(codes);
      items.forEach((item, index) => this.apply(item, itemKeys[index] ?? ""));
      this.afterCommit?.(items);
      return {};
    } finally {
      itemKeys.forEach((key) => this.held.delete(key));
    }
  }

  private apply(item: TransactItem, key: string): void {
    if (item.Put) {
      this.rows.set(key, structuredClone(item.Put.Item as Row));
    } else if (item.Delete) {
      this.rows.delete(key);
    } else if (item.Update) {
      const next = structuredClone(this.rows.get(key) ?? (item.Update.Key as Row));
      applyUpdate(
        item.Update.UpdateExpression ?? "",
        next,
        item.Update.ExpressionAttributeNames,
        item.Update.ExpressionAttributeValues,
      );
      this.rows.set(key, next);
    }
  }

  restore(): void {
    this.client.restore();
  }
}
