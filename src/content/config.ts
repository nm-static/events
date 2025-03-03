import { defineCollection, z } from "astro:content";

const infopages = defineCollection({
  schema: z.object({
    page: z.string(),
    pubDate: z.date(),
  }),
});
const store = defineCollection({
  schema: z.object({
    price: z.string(),
    title: z.string(),
    preview: z.string(),
    checkout: z.string(),
    license: z.string(),
    highlights: z.array(z.string()),
    description: z.string(),
    features: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
      })
    ),
    image: z.object({
      url: z.string(),
      alt: z.string(),
    }),
    
  }),
});

const sites = defineCollection({
  schema: z.object({
    live: z.string(),
    title: z.string(),
    tagline: z.string(),
    description: z.string(),
    details: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      )
      .optional(),
    logo: z.object({
      url: z.string(),
      alt: z.string(),
    }), 
    thumbnail: z.object({
      url: z.string(),
      alt: z.string(),
    }),
    tags: z.array(z.string().optional()).optional(),
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
    avatar: z.object({
      url: z.string(),
      alt: z.string(),
    }),
    tags: z.array(z.string()),
  }),
});
export const collections = {
  store: store,
  sites: sites,
  posts: postsCollection,
  infopages: infopages,
};
