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
  /**
   * Extra RFC 5322 headers. Added for the weekly email's `List-Unsubscribe`
   * pair (RFC 8058), which has to be a real header — a link in the body is not
   * what a mail client's own unsubscribe button reads.
   *
   * Optional, and absent for the magic link and the alerts, so those payloads
   * are byte-for-byte what they were: `JSON.stringify` omits an undefined key.
   */
  headers?: Record<string, string>;
}

export type EmailTransport = "resend" | "stub";

export interface SendResult {
  ok: boolean;
  transport: EmailTransport;
  /** Present when the provider rejected the message. */
  error?: string;
}

/**
 * The From address. Must be on a THI domain the owner has verified with SPF and
 * DKIM — never a resend.dev sandbox address, which would put a third party's
 * domain on mail that signs people into their own account.
 *
 * Overridable with the EMAIL_FROM var so the exact mailbox can change without a
 * code change and a redeploy; the default is the mailbox the owner named.
 */
const DEFAULT_FROM = "Texas Home Intelligence <accounts@texashomeintelligence.com>";

function envVar(name: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name];
}

/** Read at call time, not module load, so `wrangler secret put RESEND_API_KEY`
 * takes effect on the next request without any other change. The secret is
 * never read into a constant, logged, or returned in a response. */
function resendKey(): string | undefined {
  return envVar("RESEND_API_KEY");
}

function fromAddress(): string {
  return envVar("EMAIL_FROM") ?? DEFAULT_FROM;
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
    const headerLines = Object.entries(message.headers ?? {})
      .map(([k, v]) => `[email:stub] header ${k}: ${v}`)
      .join("\n");
    console.log(
      `[email:stub] to=${message.to} subject=${JSON.stringify(message.subject)}` +
        (headerLines ? `\n${headerLines}` : "") +
        `\n${message.text}`,
    );
    return { ok: true, transport: "stub" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Exactly one recipient: the person the message is about. No bcc, no
      // reply-to redirect, no copy to an operator inbox. A magic link is a
      // credential and an alert is about someone's home; neither belongs
      // anywhere but their own inbox. Lead notification, if it ever exists,
      // must be a separate path that never sees this payload.
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        headers: message.headers,
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
