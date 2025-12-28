import { defineCollection, z } from "astro:content";

const legal = defineCollection({
  schema: z.object({
    page: z.string(),
    pubDate: z.date(),
  }),
});

const store = defineCollection({
  schema: ({ image }) =>
    z.object({
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
        url: image(),
        alt: z.string(),
      }),
      gallery: z
        .array(
          z.object({
            url: image(),
            alt: z.string(),
          })
        )
        .optional(),
    }),
});


const sites = defineCollection({
  schema: ({ image }) =>
    z.object({
      live: z.string(),
      title: z.string(),
      tagline: z.string(),
      description: z.string(),
      isNew: z.boolean().optional(),
      details: z
        .array(
          z.object({
            label: z.string(),
            value: z.string(),
          })
        )
        .optional(),
      thumbnail: z.object({
        url: image(), 
        alt: z.string(),
      }),
      tags: z.array(z.string().optional()).optional(),
    }),
});

const posts = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.date(),
      description: z.string(),

      image: z.object({
        url: image(), 
        alt: z.string(),
      }),
     
      tags: z.array(z.string()),
    }),
});

export const collections = {
  store,
  sites,
  posts,
  legal,
};
