import { defineCollection, z } from "astro:content";

const events = defineCollection({
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    date: z.coerce.date(),
    endDate: z.coerce.date(),
    venue: z.string(),
    type: z.enum(["workshop", "school", "event", "conference", "seminar"]),
    role: z.string(),
    status: z.enum(["upcoming", "archived"]),
    tags: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
    externalUrl: z.string().optional(),
    nav: z.string().optional(),
    order: z.number().optional(),
    parentSlug: z.string().optional(),
  }),
});

export const collections = {
  events,
};
