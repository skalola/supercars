import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  meetActions: read("app/actions/meets.ts"),
  adminMeetActions: read("app/actions/admin-meets.ts"),
  meetPage: read("app/meets/[slug]/page.tsx"),
  meetData: read("app/meets/meet-data.ts"),
  garageMeetSummary: read("app/garage/garage-meets.ts"),
  schema: read("prisma/schema.prisma"),
  rateLimit: read("lib/security/action-rate-limit.ts"),
};

const checks: Array<[string, boolean]> = [
  ["Meet actions require session auth", count(files.meetActions, "redirect(\"/login\")") >= 6],
  ["Meet creation is rate limited", includesAll(files.meetActions, ["action: \"MEET_CREATE\"", "limit: 3"])],
  ["RSVP changes are rate limited per meet", includesAll(files.meetActions, ["action: \"MEET_RSVP\"", "bucketKey: meetId"])],
  ["Host edits are host-owned and rate limited", includesAll(files.meetActions, ["action: \"MEET_HOST_EDIT\"", "hostId: userId", "Only the host can edit"])],
  ["Attendee management is host-only and rate limited", includesAll(files.meetActions, ["action: \"MEET_ATTENDEE_MANAGE\"", "rsvp.meet.hostId !== userId"])],
  ["Meet cancellation is host-only and rate limited", includesAll(files.meetActions, ["action: \"MEET_CANCEL\"", "Only the host can cancel"])],
  ["Photo upload is completed-only and rate limited", includesAll(files.meetActions, ["action: \"MEET_PHOTO_ADD\"", "meet.status !== \"COMPLETED\""])],
  ["Photo upload requires host or active RSVP", includesAll(files.meetActions, ["meet.hostId === userId", "rsvp.status !== \"CANCELLED\""])],
  ["RSVP vehicle ownership is enforced", includesAll(files.meetActions, ["ownerId: userId", "status: \"CLAIMED\""])],
  ["Capacity full/open sync exists", includesAll(files.meetActions, ["syncMeetCapacityStatus", "goingCount >= meet.capacity ? \"FULL\" : \"PUBLISHED\""])],
  ["Waitlist promotion exists", includesAll(files.meetActions, ["promoteWaitlistIfSpace", "status: \"WAITLISTED\"", "data: { status: \"GOING\" }"])],
  ["Admin meet actions require admin auth", count(files.adminMeetActions, "await assertAdmin()") >= 3],
  ["Admin can delete meet photos without deleting meet", includesAll(files.adminMeetActions, ["deleteMeetPhotoAction", "prisma.meetPhoto.delete"])],
  ["Admin photo delete revalidates meet, garage, and vehicle", includesAll(files.adminMeetActions, ["revalidatePath(`/meets/${photo.meet.slug}`)", "revalidatePath(\"/garage\")", "revalidatePath(`/vehicle/${photo.vehicle.vin}`)"])],
  ["Meet detail has exact-address privacy logic", includesAll(files.meetPage, ["canViewExactAddress", "Exact address unlocks after RSVP approval", "privateMeetContext.hostId === viewerUserId"])],
  ["Host console exposes edit and attendee management", includesAll(files.meetPage, ["updateHostedMeetAction", "manageMeetRsvpAction", "Export Roster"])],
  ["Meet serializer includes photos with vehicle links", includesAll(files.meetData, ["photos:", "vehicleHref", "createdAt: photo.createdAt.toISOString()"])],
  ["Garage meet summary includes live stats and photos", includesAll(files.garageMeetSummary, ["stats:", "upcoming:", "completed:", "prisma.meetPhoto.count"])],
  ["Rate-limit helper stores rolling-window counters", includesAll(files.rateLimit, ["actionRateLimit.upsert", "count: { increment: 1 }", "row.count > limit"])],
  ["Schema contains rate-limit and meet history models", includesAll(files.schema, ["model ActionRateLimit", "model MeetPhoto", "exactAddress", "@@unique([actorKey, action, bucketKey, windowStart])"])],
];

const failed = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} meet regression check${failed.length === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} meet regression checks passed.`);

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function includesAll(value: string, needles: string[]) {
  return needles.every((needle) => value.includes(needle));
}

function count(value: string, needle: string) {
  return value.split(needle).length - 1;
}
