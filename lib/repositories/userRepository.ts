import getUserModel from '@/models/User';

export async function findUserByEmail(email: string) {
  const User = await getUserModel();
  return User.findOne({ email });
}

export async function findUserById(userId: string) {
  const User = await getUserModel();
  return User.findById(userId).select('_id email name');
}

export async function createUser(input: { email: string; password_hash: string; name?: string }) {
  const User = await getUserModel();
  return User.create(input);
}
