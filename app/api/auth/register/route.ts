import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookie, createSessionToken, hashPassword } from '../../../../lib/auth';
import { migrateAndSeedCollections } from '../../../../lib/seed';
import { createUser, findUserByEmail } from '../../../../lib/repositories/userRepository';
import { parseOrThrow } from '../../../../lib/validation/trading';
import { registerRequestSchema } from '../../../../lib/contracts/apiContracts';

const registerRouteDependencies = {
  findUserByEmail,
  createUser,
  migrateAndSeedCollections,
};

export function __setRegisterRouteTestDependencies(overrides: Partial<typeof registerRouteDependencies>) {
  Object.assign(registerRouteDependencies, overrides);
}

export function __resetRegisterRouteTestDependencies() {
  registerRouteDependencies.findUserByEmail = findUserByEmail;
  registerRouteDependencies.createUser = createUser;
  registerRouteDependencies.migrateAndSeedCollections = migrateAndSeedCollections;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = parseOrThrow(registerRequestSchema, body);

    const exists = await registerRouteDependencies.findUserByEmail(email);
    if (exists) {
      return NextResponse.json({ success: false, error: 'User already exists' }, { status: 409 });
    }

    const user = await registerRouteDependencies.createUser({
      email,
      name,
      password_hash: hashPassword(password),
    });

    await registerRouteDependencies.migrateAndSeedCollections(String(user._id));

    const res = NextResponse.json({
      success: true,
      data: { user: { _id: String(user._id), email: user.email, name: user.name || '' } },
    });
    applySessionCookie(res, createSessionToken(String(user._id), user.email));
    return res;
  } catch (error: any) {
    const status = error?.message?.includes('Validation failed') ? 400 : 500;
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status });
  }
}
