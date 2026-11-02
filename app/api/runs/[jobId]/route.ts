import { connection } from "next/server";
import { getJob } from "@/lib/jobs";

/** Progress and, once finished, the report of one job. */
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[jobId]">): Promise<Response> {
  await connection();
  const { jobId } = await ctx.params;
  const job = getJob(jobId);
  if (!job) {
    return Response.json(
      { message: "この実行は見つかりません", nextStep: "サーバを起動し直した場合は、もう一度実行してください" },
      { status: 404 },
    );
  }
  return Response.json(job);
}
