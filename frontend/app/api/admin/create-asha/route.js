import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { requireAdmin } from "@/app/lib/auth/requireAdmin";
import { buildLocation } from "@/app/lib/location-utils";
import { hashPassword } from "@/app/lib/auth/password-utils";
import { parseJsonBody, normalizeEmail, normalizeRequiredString } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";
import { createAshaUser } from "@/app/lib/auth/worker-id";

export async function POST(request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const { body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const name = normalizeRequiredString(body?.name);
    const email = normalizeEmail(body?.email);
    const password = normalizeRequiredString(body?.password);
    const { location } = body || {};

    if (!name || !email || !password) {
      return Response.json(
        { message: "name, email, and password are required" },
        { status: 400 }
      );
    }

    const { location: normalizedLocation, error: locationError } = buildLocation(location);
    if (locationError) {
      return Response.json({ message: locationError }, { status: 400 });
    }

    await dbConnect();

    const existingUser = await User.findOne({ email }).select("_id");

    if (existingUser) {
      return Response.json({ message: "Email already exists" }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password, 10);

    // Admin-created workers are trusted immediately; self-registered ones wait
    // for approval (see app/api/asha/register).
    const user = await createAshaUser({
      name,
      email,
      password: hashedPassword,
      location: normalizedLocation,
      status: "APPROVED",
      createdBy: session.user.id,
    });

    return Response.json(
      {
        message: "ASHA worker created",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          workerId: user.workerId,
          location: user.location,
          status: user.status,
          createdBy: user.createdBy,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/admin/create-asha", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to create ASHA worker", error: reason },
      { status: 500 }
    );
  }
}
