import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    name: { type: String, default: '' },
  },
  { collection: 'users', timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ createdAt: -1 });

export default async function getUserModel() {
  await connectToDatabase();
  return models.User || model('User', UserSchema);
}
