import type { StoredPost } from "./types.js";

export interface CompactPost {
  postId: string;
  authorHandle: string;
  authorDisplayName: string | null;
  createdAt: string | null;
  detectedAt: string;
  text: string;
  lang: string | null;
  insertedAt: string;
}

export function toCompactPost(post: StoredPost): CompactPost {
  return {
    postId: post.postId,
    authorHandle: post.authorHandle,
    authorDisplayName: post.authorDisplayName,
    createdAt: post.createdAt,
    detectedAt: post.detectedAt,
    text: post.text,
    lang: post.lang,
    insertedAt: post.insertedAt
  };
}
