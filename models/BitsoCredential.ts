import { initDB, createModel } from 'lyzr-architect';

let _model: any = null;

export default async function getBitsoCredentialModel() {
  if (!_model) {
    await initDB();
    _model = createModel('BitsoCredential', {
      api_key: { type: String, required: true },
      api_secret: { type: String, required: true },
      is_active: { type: Boolean, default: true },
    });
  }
  return _model;
}
