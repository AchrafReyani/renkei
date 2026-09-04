// The whole function. renkei boots once per isolate from the function's
// secrets (`supabase secrets set`, or --env-file locally) and stores in your
// project's Postgres (SUPABASE_DB_URL, or DATABASE_URL — e.g. the pooler).
//
// To build storage yourself or inject a logger:
//
//   import { createEdgeFunction } from 'npm:renkei-server@^0.5.0/supabase';
//   Deno.serve(createEdgeFunction({ storage: (env) => … }).fetch);
import { serve } from 'npm:renkei-server@^0.5.0/supabase';

serve();
