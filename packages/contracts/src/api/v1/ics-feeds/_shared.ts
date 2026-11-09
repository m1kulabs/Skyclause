import { z } from '@hono/zod-openapi'

// #143 uploads the original bytes as text; #139 owns calendar parsing and validation.
export const IcsFeedBody = z.union([
  z.object({ url: z.url() }).strict(),
  z
    .object({
      file: z
        .object({
          name: z.string().min(1).max(255),
          content: z
            .string()
            .min(1)
            .max(5 * 1024 * 1024)
        })
        .strict()
    })
    .strict()
])
