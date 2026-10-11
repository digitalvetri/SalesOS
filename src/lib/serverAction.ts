// Standard Server Action shape per spec §8:
// parse (zod) → getSession → assertCan → service → revalidatePath → {ok} | {ok:false, error}
import { ZodError, type ZodType } from "zod";
import { revalidatePath } from "next/cache";
import { AppError, isAppError } from "@/lib/errors";
import { getSession, type Session } from "@/server/auth/session";
import { assertCan, type Action, type OwnershipCtx } from "@/server/auth/permissions";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; ref?: string; meta?: Record<string, unknown> } };

export type ServerActionDef<Input, Output> = {
  input: ZodType<Input>;
  action: Action;
  requireAuth?: boolean; // default true
  resolveOwnership?: (parsed: Input, session: Session | null) => OwnershipCtx | Promise<OwnershipCtx> | undefined;
  revalidate?: string | string[];
  run: (parsed: Input, session: Session | null) => Promise<Output>;
};

export function makeServerAction<Input, Output>(def: ServerActionDef<Input, Output>) {
  return async function serverAction(raw: unknown): Promise<ActionResult<Output>> {
    const ref = cryptoRef();
    try {
      const parsed = def.input.parse(raw);
      const session =
        def.requireAuth === false ? await getSession() : await requireSessionLocal();

      if (session !== null) {
        const ctx = def.resolveOwnership ? await def.resolveOwnership(parsed, session) : undefined;
        assertCan(session.role, def.action, ctx);
      }

      const data = await def.run(parsed, session);

      if (def.revalidate) {
        const paths = Array.isArray(def.revalidate) ? def.revalidate : [def.revalidate];
        for (const p of paths) revalidatePath(p);
      }
      return { ok: true, data };
    } catch (e) {
      if (e instanceof ZodError) {
        return {
          ok: false,
          error: {
            code: "VALIDATION",
            message: "Please check the form and try again.",
            meta: { issues: e.issues },
          },
        };
      }
      if (isAppError(e)) {
        return { ok: false, error: { code: e.code, message: e.userMessage, meta: e.meta } };
      }
      console.error(`[serverAction ${def.action}] ref=${ref}`, e);
      return {
        ok: false,
        error: {
          code: "INTERNAL",
          message: `Something went wrong — reference #${ref}`,
          ref,
        },
      };
    }
  };
}

async function requireSessionLocal(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
  return s;
}

function cryptoRef(): string {
  // 10-char reference id for log correlation.
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
