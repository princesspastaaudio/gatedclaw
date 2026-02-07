import { z } from "zod";

const ChatClassSchema = z.union([z.literal("admin"), z.literal("public")]);

const GatingPolicyRoleSchema = z
  .object({
    chatClasses: z.array(ChatClassSchema).optional(),
    users: z.array(z.string()).optional(),
  })
  .strict();

const ResourceScopeSchema = z
  .string()
  .regex(/^[a-z0-9_*]+:[a-zA-Z0-9*._-]+$/, "Resource scope must be type:id");

export const GatingPolicySchema = z
  .object({
    resource: ResourceScopeSchema,
    request: GatingPolicyRoleSchema.optional(),
    approve: GatingPolicyRoleSchema.optional(),
  })
  .strict();

export const GatingSchema = z
  .object({
    enabled: z.boolean().optional(),
    adminChats: z.array(z.union([z.string(), z.number()])).optional(),
    publicChats: z.array(z.union([z.string(), z.number()])).optional(),
    policies: z.array(GatingPolicySchema).optional(),
    allowPublicViewForCronProposals: z.boolean().optional(),
  })
  .strict()
  .optional();
