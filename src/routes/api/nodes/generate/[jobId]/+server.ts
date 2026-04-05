import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getJob, updateJob } from '$lib/jobTracker';

/**
 * GET /api/nodes/generate/[jobId]
 *
 * Polls the status of a node generation job.
 *
 * Response (200 OK):
 * {
 *   "jobId": "uuid",
 *   "status": "pending" | "processing" | "completed" | "failed",
 *   "progress": {
 *     "completed": number,
 *     "total": number,
 *     "percentage": number
 *   },
 *   "sessionId": "pocketbase-id" | null,
 *   "error": string | null
 * }
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user) {
			return json({ error: 'unauthorized', message: 'Must be logged in' }, { status: 401 });
		}

		const { jobId } = params;

		// Validate jobId format (basic UUID check)
		if (!jobId || typeof jobId !== 'string') {
			return json(
				{
					error: 'invalid_job_id',
					message: 'Job ID is required and must be a string'
				},
				{ status: 400 }
			);
		}

		// Get job state
		const job = await getJob(jobId);

		if (!job || job.userId !== locals.user.id) {
			return json(
				{
					error: 'job_not_found',
					message: `Job ${jobId} not found`
				},
				{ status: 404 }
			);
		}

		// Calculate percentage
		const percentage =
			job.progress.total > 0 ? Math.round((job.progress.completed / job.progress.total) * 100) : 0;

		return json({
			jobId: job.jobId,
			status: job.status,
			progress: {
				completed: job.progress.completed,
				total: job.progress.total,
				percentage
			},
			sessionId: job.sessionId || null,
			error: job.error
		});
	} catch (error) {
		console.error('[API] Error polling job status:', error);
		return json(
			{
				error: 'server_error',
				message: 'Failed to get job status'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/nodes/generate/[jobId]
 *
 * Cancels a pending or processing node generation job.
 * Note: Cannot cancel jobs that are already completed or failed.
 *
 * Response (200 OK):
 * {
 *   "jobId": "uuid",
 *   "status": "cancelled",
 *   "message": "Job cancelled successfully"
 * }
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user) {
			return json({ error: 'unauthorized', message: 'Must be logged in' }, { status: 401 });
		}

		const { jobId } = params;

		const job = await getJob(jobId);

		if (!job || job.userId !== locals.user.id) {
			return json(
				{
					error: 'job_not_found',
					message: `Job ${jobId} not found`
				},
				{ status: 404 }
			);
		}

		// Can only cancel pending or processing jobs
		if (job.status !== 'pending' && job.status !== 'processing') {
			return json(
				{
					error: 'invalid_operation',
					message: `Cannot cancel job with status '${job.status}'`
				},
				{ status: 400 }
			);
		}

		// Mark as cancelled
		await updateJob(jobId, { status: 'cancelled' }, true);

		console.log(`[API] Job cancelled: ${jobId}`);

		return json({
			jobId,
			status: 'cancelled',
			message: 'Job cancelled successfully'
		});
	} catch (error) {
		console.error('[API] Error cancelling job:', error);
		return json(
			{
				error: 'server_error',
				message: 'Failed to cancel job'
			},
			{ status: 500 }
		);
	}
};
