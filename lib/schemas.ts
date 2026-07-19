import { z } from "zod";

// Schemas are shared between client (React Hook Form resolver) and server (Route Handler validation),
// so the same rules apply in both places and field errors map cleanly back to the form.

/**
 * A syntactically valid http(s) media URL.
 *
 * Rules: must parse as a URL, must be http/https, and must carry a real path (a bare host like
 * `https://cdn.com` or `https://cdn.com/` is rejected). We deliberately do NOT require a file
 * extension — plenty of real media URLs are extensionless (signed/CDN URLs, `/master`, etc.), so
 * demanding one would reject valid input. (Noted in the README.)
 */
export const sourceUrlSchema = z
  .string()
  .trim()
  .min(1, "Source URL is required")
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid URL, e.g. https://cdn.example.com/videos/clip.mp4",
      });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "Must be an http or https URL" });
      return;
    }
    // Strip trailing slashes: "https://cdn.com/" has pathname "/", which is not a real path.
    if (url.pathname.replace(/\/+$/, "") === "") {
      ctx.addIssue({
        code: "custom",
        message: "URL must include a path to the media file, not just a domain",
      });
    }
  });

export const createJobSchema = z.object({
  sourceUrl: sourceUrlSchema,
  title: z
    .string()
    .trim()
    .max(80, "Keep the title under 80 characters")
    .optional()
    .or(z.literal("")),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const startRunSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
});
