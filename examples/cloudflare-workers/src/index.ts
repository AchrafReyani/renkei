// The whole Worker. renkei boots once per isolate from `env` (vars + secrets)
// and stores in the D1 binding named `DB`.
//
// To change the binding name, plug in Postgres over Hyperdrive, or inject a
// logger, build the Worker yourself instead:
//
//   import { createWorker } from 'renkei-server/workers';
//   export default createWorker({ d1Binding: 'RENKEI_DB' });
export { default } from 'renkei-server/workers';
