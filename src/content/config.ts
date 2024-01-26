
import { defineCollection, z } from "astro:content";
const directory = defineCollection({
  schema: z.object({
    pubDate: z.date(),
    visitUrl: z.string(),
    websiteName: z.string(),
    description: z.string(),
    category: z.array(z.string()),
    typography: z.array(z.string()),
    thumbnail: z.object({
      url: z.string(),
      alt: z.string(),
    }),
    images: z.array(
      z.object({
        url: z.string(),
        alt: z.string(),
      })
    ),
  }),
});
const infopages = defineCollection({
  schema: z.object({
    page: z.string(),
  }),
});
const postsCollection = defineCollection({

  schema: z.object({

    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    author: z.string(),
    image: z.object({
      url: z.string(),
      alt: z.string(),
    }),
    tags: z.array(z.string()),
  }),
});
export const collections = {
  posts: postsCollection,
  infopages: infopages,
  directory: directory,
};
