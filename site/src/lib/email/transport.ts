/**
 * Email delivery — an owner seam (HANDOFF.md).
 *
 * Two implementations behind one interface. Which one runs is decided by
 * whether `RESEND_API_KEY` is present, so the code path is identical in dev and
 * production and the only difference is a secret that lives in the environment.
 *
 * 🔴 HUMAN-OWNED, not buildable here:
 *   - RESEND_API_KEY, set as a Worker secret (never in the repo, never in
 *     wrangler.jsonc, never pasted into a file)
 *   - the sending domain's SPF and DKIM records
 * Until both exist, the stub runs and logs what it would have sent. Nothing
 * pretends a message was delivered when it was not: `sendEmail` reports which
 * transport handled it, and the caller surfaces that rather than claiming
 * success.
 */
import { env } from "cloudflare:workers";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export type EmailTransport = "resend" | "stub";

export interface SendResult {
  ok: boolean;
  transport: EmailTransport;
  /** Present when the provider rejected the message. */
  error?: string;
}

/** The From address. A real sending domain has to be verified before Resend
 * will accept this; until then the stub path never reads it. */
const FROM = "Texas Home Intelligence <alerts@texashomeintelligence.com>";

function resendKey(): string | undefined {
  return (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
}

export function activeTransport(): EmailTransport {
  return resendKey() ? "resend" : "stub";
}

export async function sendEmail(message: OutboundEmail): Promise<SendResult> {
  const key = resendKey();

  if (!key) {
    // Stub. Logged to the worker console — which is also how the round's
    // end-to-end test retrieves a magic link, rather than the app carrying a
    // "give me the last email" endpoint that would be a real backdoor.
    console.log(
      `[email:stub] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
    return { ok: true, transport: "stub" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("resend rejected message", res.status, detail.slice(0, 300));
      return { ok: false, transport: "resend", error: `HTTP ${res.status}` };
    }
    return { ok: true, transport: "resend" };
  } catch (error) {
    console.error("resend request failed", error);
    return { ok: false, transport: "resend", error: "network" };
  }
}

export function magicLinkEmail(link: string): Pick<OutboundEmail, "subject" | "text"> {
  return {
    subject: "Your Texas Home Intelligence sign-in link",
    text:
      `Open this link to sign in to your home dashboard:\n\n${link}\n\n` +
      `The link works once and expires in 15 minutes.\n\n` +
      `If you didn't ask for this, you can ignore it — nothing was created, and ` +
      `we won't email you again.\n`,
  };
}
