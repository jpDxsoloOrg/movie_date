import { InvokeCommand, LambdaClient, type InvokeCommandInput } from "@aws-sdk/client-lambda";
import { mockClient } from "aws-sdk-client-mock";

export type IntegrationCall = Record<string, unknown> & { op: string };
/** Returns the op's data; the fake wraps it in the integration's `{ ok, data }` envelope. */
export type IntegrationRoute = (call: IntegrationCall) => unknown;

/** Stands in for the Plex Request integration Lambda and records every call to it. */
export function fakePlexRequest() {
  const calls: IntegrationCall[] = [];
  const client = mockClient(LambdaClient);
  let route: IntegrationRoute = () => null;
  client.on(InvokeCommand).callsFake(async (input: InvokeCommandInput) => {
    const call = JSON.parse(String(input.Payload)) as IntegrationCall;
    calls.push(call);
    return { StatusCode: 200, Payload: new TextEncoder().encode(JSON.stringify({ ok: true, data: route(call) })) as never };
  });
  return {
    calls,
    answer(next: IntegrationRoute) {
      route = next;
    },
    callsTo(op: string) {
      return calls.filter((call) => call.op === op);
    },
    /** Every invocation fails, as it does while the function is down. */
    breakIt() {
      route = () => {
        throw Object.assign(new Error("user@example.com is unreachable"), { name: "ServiceException" });
      };
    },
    reset() {
      calls.length = 0;
      route = () => null;
    },
    restore() {
      client.restore();
    },
  };
}
