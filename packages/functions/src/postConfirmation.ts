import {
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import type { PostConfirmationTriggerEvent } from "aws-lambda";

let client: CognitoIdentityProviderClient | undefined;

/**
 * A reset usually means someone else may have the password, so every session opened
 * with the old one ends here. The reset itself has already happened: a failure is
 * logged rather than thrown, which would only tell the person it hadn't.
 */
export async function handler(event: PostConfirmationTriggerEvent): Promise<PostConfirmationTriggerEvent> {
  if (event.triggerSource !== "PostConfirmation_ConfirmForgotPassword") return event;
  client ??= new CognitoIdentityProviderClient({});
  try {
    await client.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: event.userPoolId, Username: event.userName }),
    );
  } catch (error) {
    console.error("Signing out after a password reset failed", error instanceof Error ? error.name : "unknown");
  }
  return event;
}
