import { waitUntil } from '@vercel/functions';

export type RetainBackground = (work: Promise<unknown>) => void;

// Register before sending 202: Vercel may suspend work that is not attached to
// the request. This extends its lifetime, but does not replace a durable queue.
export const retainBackground: RetainBackground = work => {
  if (process.env.VERCEL === '1') waitUntil(work);
};
