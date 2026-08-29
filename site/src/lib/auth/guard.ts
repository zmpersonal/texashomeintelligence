/**
 * The one place a request becomes an authenticated caller.
 *
 * Every protected route and page goes through this, so there is a single
 * definition of "signed in" rather than each handler re-reading cookies and
 * getting one of them subtly wrong.
 */
import { getAccount, getHomeForAccount, type Account, type HomeProfile } from "../account/db";
import { readSession, sessionIdFromRequest } from "./session";

export interface AuthedContext {
  sessionId: string;
  account: Account;
  home: HomeProfile | null;
}

export async function authenticate(request: Request): Promise<AuthedContext | null> {
  const sid = sessionIdFromRequest(request);
  const session = await readSession(sid);
  if (!session || !sid) return null;
  const account = await getAccount(session.accountId);
  // A live session for a deleted account must not authenticate — this is what
  // makes the deletion path effective against an already-open tab.
  if (!account) return null;
  return { sessionId: sid, account, home: await getHomeForAccount(account.id) };
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export const UNAUTHORIZED = () => json({ error: "Sign in to do that." }, 401);
