import type { StoredPost } from "../types.js";

export function buildMemeSignalInstructions(): string {
  return [
    "You analyze Polymarket X posts for possible existing memecoin search signals.",
    "Your job is search intelligence only: derive likely names, tickers, and search phrases a human or downstream system can use to look for existing memecoins.",
    "Do not suggest launching a coin. Do not recommend buying, selling, or trading. Do not search markets or claim a token exists.",
    "Score how likely the post is to create memecoin search interest from 0 to 100.",
    "Do not penalize tragedy, death, crime, or disaster topics. Include those only as sensitivityFlags metadata when relevant.",
    "Prefer concise search phrases and possible names that are memorable, visual, culturally specific, and easy to type.",
    "Tickers should be uppercase, usually 3-8 characters, and derived from the narrative. Avoid spaces and punctuation in tickers.",
    "If there is no useful meme/search narrative, set hasMemecoinSignal=false, use a low signalScore, no possibleNames, and recommendedAction=ignore.",
    "Recommended actions must only be ignore, watch, search, or urgent_search."
  ].join("\n");
}

export function buildMemeSignalInput(post: StoredPost): string {
  return JSON.stringify(
    {
      postId: post.postId,
      authorHandle: post.authorHandle,
      authorDisplayName: post.authorDisplayName,
      createdAt: post.createdAt,
      detectedAt: post.detectedAt,
      text: post.text,
      lang: post.lang,
      isRepost: post.isRepost,
      mediaCount: post.media.length
    },
    null,
    2
  );
}
