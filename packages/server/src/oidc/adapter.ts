import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { PayloadRecord, PayloadStore } from 'renkei-core';

/**
 * `oidc-provider` adapter backed by renkei's PayloadStore. One instance per
 * model name (`AccessToken`, `Session`, `Interaction`, `Grant`, ...).
 */
export class PayloadStoreAdapter implements Adapter {
  constructor(
    private readonly model: string,
    private readonly store: PayloadStore,
  ) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
    await this.store.upsert(this.model, id, payload as PayloadRecord, expiresIn);
  }
  async find(id: string) {
    return (await this.store.find(this.model, id)) as AdapterPayload | undefined;
  }
  async findByUserCode(userCode: string) {
    return (await this.store.findByUserCode(this.model, userCode)) as AdapterPayload | undefined;
  }
  async findByUid(uid: string) {
    return (await this.store.findByUid(this.model, uid)) as AdapterPayload | undefined;
  }
  async consume(id: string) {
    await this.store.consume(this.model, id);
  }
  async destroy(id: string) {
    await this.store.destroy(this.model, id);
  }
  async revokeByGrantId(grantId: string) {
    await this.store.revokeByGrantId(this.model, grantId);
  }
}

/** Factory in the shape oidc-provider's `adapter` option accepts. */
export function adapterFactory(store: PayloadStore) {
  return (name: string) => new PayloadStoreAdapter(name, store);
}
