import type { PreSignUpTriggerEvent } from "aws-lambda";

/** Sign-up logs straight in, while a verified email keeps forgot-password working. */
export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
}
