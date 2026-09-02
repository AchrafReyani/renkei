import { renkei } from '@/renkei';

// Next 16: proxy.ts (Next ≤ 15: name this file middleware.ts — same code).
// Anonymous requests under /account are sent to the login with return_to set.
export default renkei.proxy({ protect: ['/account'] });

export const config = { matcher: ['/account/:path*'] };
