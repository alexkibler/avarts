import { pb } from './database';
import { randomUUID as uuidv4 } from 'crypto';

/**
 * In-memory job state for fast progress updates during generation.
 * Backed by PocketBase for persistence across server restarts.
 */
export interface JobState {
	jobId: string;
	userId: string;
	sessionId?: string; // PocketBase game_sessions ID, set after session created
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	progress: {
		completed: number;
		total: number;
	};
	error: string | null;
	createdAt: number;
	lastUpdate: number;
	startedAt?: number;
	completedAt?: number;
}

/**
 * In-memory store for active node generation jobs.
 * Provides fast read/write during generation without hitting database.
 */
const activeJobs = new Map<string, JobState>();

/**
 * Maximum number of concurrent generation jobs.
 * Set conservatively to avoid overwhelming the server.
 */
const MAX_CONCURRENT_JOBS = 3;

/**
 * How long (ms) before a stalled job is considered failed.
 */
const JOB_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum total duration for a generation job.
 */
const MAX_JOB_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Creates a new node generation job and stores it.
 */
export function createJob(userId: string): JobState {
	const jobId = uuidv4();
	const now = Date.now();

	const job: JobState = {
		jobId,
		userId,
		status: 'pending',
		progress: { completed: 0, total: 0 },
		error: null,
		createdAt: now,
		lastUpdate: now
	};

	activeJobs.set(jobId, job);
	console.log(`[JobTracker] Created job ${jobId} for user ${userId}`);

	return job;
}

/**
 * Retrieves job state from in-memory store or PocketBase.
 * Checks health status (timeout detection).
 */
export async function getJob(jobId: string): Promise<JobState | null> {
	// Try in-memory first (fast path)
	let job = activeJobs.get(jobId);

	if (!job) {
		// Try PocketBase as fallback
		try {
			const record = await pb.collection('generation_jobs').getOne(jobId, { requestKey: null });
			job = recordToJobState(record);
		} catch (e) {
			console.warn(`[JobTracker] Job not found: ${jobId}`);
			return null;
		}
	}

	// Check for timeout
	if (job.status === 'processing') {
		const now = Date.now();
		const idleDuration = now - job.lastUpdate;
		const totalDuration = now - job.createdAt;

		if (idleDuration > JOB_IDLE_TIMEOUT) {
			job.status = 'failed';
			job.error = `Job stalled: no activity for ${Math.round(idleDuration / 1000)}s`;
			activeJobs.set(jobId, job);
			await persistJob(job);
		} else if (totalDuration > MAX_JOB_DURATION) {
			job.status = 'failed';
			job.error = `Job exceeded maximum duration (${Math.round(MAX_JOB_DURATION / 1000)}s)`;
			activeJobs.set(jobId, job);
			await persistJob(job);
		}
	}

	return job;
}

/**
 * Updates job state in both in-memory store and PocketBase.
 * Debounced: only writes to PocketBase every 5 nodes or on status change.
 */
export async function updateJob(
	jobId: string,
	updates: Partial<JobState>,
	forceDbUpdate = false
): Promise<void> {
	const job = activeJobs.get(jobId);
	if (!job) {
		console.warn(`[JobTracker] Attempted to update non-existent job: ${jobId}`);
		return;
	}

	// Update in-memory
	Object.assign(job, updates, { lastUpdate: Date.now() });
	activeJobs.set(jobId, job);

	// Persist to PocketBase periodically or on important changes
	if (
		forceDbUpdate ||
		updates.status ||
		(updates.progress && updates.progress.completed % 5 === 0)
	) {
		await persistJob(job);
	}
}

/**
 * Marks a job as complete and persists final state.
 */
export async function completeJob(jobId: string, sessionId: string): Promise<void> {
	const job = activeJobs.get(jobId);
	if (!job) return;

	job.status = 'completed';
	job.completedAt = Date.now();
	job.sessionId = sessionId;

	activeJobs.set(jobId, job);
	await persistJob(job);

	console.log(
		`[JobTracker] Job completed: ${jobId} → session ${sessionId}, ${job.progress.completed}/${job.progress.total} nodes`
	);
}

/**
 * Marks a job as failed with error message.
 */
export async function failJob(jobId: string, error: string): Promise<void> {
	const job = activeJobs.get(jobId);
	if (!job) return;

	job.status = 'failed';
	job.error = error;
	job.completedAt = Date.now();

	activeJobs.set(jobId, job);
	await persistJob(job);

	console.error(`[JobTracker] Job failed: ${jobId} - ${error}`);
}

/**
 * Checks if we can accept a new job (under concurrency limit).
 */
export function canAcceptNewJob(): boolean {
	const processingCount = Array.from(activeJobs.values()).filter(
		(j) => j.status === 'processing' || j.status === 'pending'
	).length;

	return processingCount < MAX_CONCURRENT_JOBS;
}

/**
 * Gets count of active jobs.
 */
export function getActiveJobCount(): number {
	return Array.from(activeJobs.values()).filter(
		(j) => j.status === 'processing' || j.status === 'pending'
	).length;
}

/**
 * Starts processing a job (should be called when moving from pending → processing).
 */
export async function startJob(jobId: string): Promise<void> {
	const job = activeJobs.get(jobId);
	if (!job) return;

	job.status = 'processing';
	job.startedAt = Date.now();
	activeJobs.set(jobId, job);
	await persistJob(job);

	console.log(`[JobTracker] Job started: ${jobId}`);
}

/**
 * Persists job state to PocketBase.
 * Creates collection if it doesn't exist (first run).
 */
async function persistJob(job: JobState): Promise<void> {
	try {
		const payload = {
			id: job.jobId,
			user: job.userId,
			session_id: job.sessionId || '',
			status: job.status,
			progress_completed: job.progress.completed,
			progress_total: job.progress.total,
			error_message: job.error || '',
			created_at: new Date(job.createdAt).toISOString(),
			started_at: job.startedAt ? new Date(job.startedAt).toISOString() : '',
			completed_at: job.completedAt ? new Date(job.completedAt).toISOString() : ''
		};

		const existing = await pb
			.collection('generation_jobs')
			.getOne(job.jobId, { requestKey: null })
			.catch(() => null);
		if (existing) {
			await pb.collection('generation_jobs').update(job.jobId, payload, { requestKey: null });
		} else {
			await pb.collection('generation_jobs').create(payload, { requestKey: null });
		}
	} catch (error) {
		console.error('[JobTracker] Failed to persist job:', error);
		// Don't throw - in-memory state is still valid
	}
}

/**
 * Converts PocketBase record to JobState.
 */
function recordToJobState(record: any): JobState {
	return {
		jobId: record.id,
		userId: record.user,
		sessionId: record.session_id || undefined,
		status: record.status,
		progress: {
			completed: record.progress_completed || 0,
			total: record.progress_total || 0
		},
		error: record.error_message || null,
		createdAt: new Date(record.created_at).getTime(),
		lastUpdate: new Date(record.updated_at).getTime(),
		startedAt: record.started_at ? new Date(record.started_at).getTime() : undefined,
		completedAt: record.completed_at ? new Date(record.completed_at).getTime() : undefined
	};
}

/**
 * Cleans up old completed/failed jobs from in-memory store (optional).
 * Called periodically to prevent memory leaks.
 */
export function cleanupOldJobs(): void {
	const now = Date.now();
	const ONE_HOUR = 60 * 60 * 1000;

	let cleaned = 0;
	for (const [jobId, job] of activeJobs.entries()) {
		if (
			(job.status === 'completed' || job.status === 'failed') &&
			now - job.completedAt! > ONE_HOUR
		) {
			activeJobs.delete(jobId);
			cleaned++;
		}
	}

	if (cleaned > 0) {
		console.log(`[JobTracker] Cleaned up ${cleaned} old jobs`);
	}
}
