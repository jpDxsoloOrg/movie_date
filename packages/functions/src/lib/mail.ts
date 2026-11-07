import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

const SEND_TIMEOUT_MS = 5_000;

let client: SESv2Client | undefined;

export async function sendPlexLinkCode(to: string, code: string, validMinutes: number): Promise<void> {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM is not set");
  client ??= new SESv2Client({});
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: "Your Movie Date code" },
          Body: {
            Text: {
              Data: `Your code to link Plex Request to Movie Date is ${code}. It works for ${validMinutes} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
            },
          },
        },
      },
    }),
    { abortSignal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
  );
}
