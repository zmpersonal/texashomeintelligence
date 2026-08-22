import { z } from "astro/zod";

// Name + email ONLY — CLAUDE.md: step 1 creates the project_id + return
// token immediately, before service is even chosen. No phone, ever, at
// this step.
export const startIntakeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  email: z.email("A valid email is required").trim(),
});

// Bulk merge of answered fields as the homeowner progresses through /start/.
// Keys are validated against the service's known field ids by the caller
// (the API route), not here — this schema only checks shape.
export const patchIntakeSchema = z.object({
  token: z.string().min(1),
  patch: z.record(z.string(), z.string().max(4000)),
});

export const completeIntakeSchema = z.object({
  token: z.string().min(1),
});

export const contractorRequestSchema = z.object({
  token: z.string().min(1),
  requestedCount: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  phone: z.string().trim().max(20).optional(),
});
