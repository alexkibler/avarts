import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pb } from '$lib/pb';
import { createJob, getActiveJobCount, canAcceptNewJob, startJob } from '$lib/jobTracker';
import { generateNodes } from '$lib/nodeGeneration';

/**
 * POST /api/nodes/generate
 *
 * Starts a new node generation job.
 *
 * Request body:
 * {
 *   "centerLat": number,
 *   "centerLon": number,
 *   "radius": number,
 *   "checkCount": number,
 *   "seedName": string,
 *   "serverUrl": string,
 *   "slotName": string
 * }
 *
 * Response (202 Accepted):
 * {
 *   "jobId": "uuid",
 *   "status": "pending",
 *   "message": "Node generation job queued"
 * }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Verify user is authenticated
    if (!locals.user) {
      return json(
        { error: 'unauthorized', message: 'Must be logged in' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { centerLat, centerLon, radius, checkCount, seedName, serverUrl, slotName } = body;

    // Validate required fields
    const validation = validateGenerateRequest({
      centerLat,
      centerLon,
      radius,
      checkCount,
      seedName,
      serverUrl,
      slotName,
    });

    if (!validation.valid) {
      return json(
        {
          error: 'validation_error',
          message: validation.error,
          details: validation.details,
        },
        { status: 400 }
      );
    }

    // Check queue capacity
    if (!canAcceptNewJob()) {
      const active = getActiveJobCount();
      return json(
        {
          error: 'queue_full',
          message: `Server is busy processing ${active} jobs. Please try again in a moment.`,
        },
        { status: 503 }
      );
    }

    // Create job
    const job = createJob(locals.user.id);

    console.log(`[API] New generation job created: ${job.jobId}`);
    console.log(`[API] Active jobs: ${getActiveJobCount()}`);

    // Start job processing asynchronously (don't await - return immediately)
    generateNodes(job.jobId, {
      centerLat,
      centerLon,
      radius,
      checkCount,
      seedName,
      serverUrl,
      slotName,
      userId: locals.user.id,
    }).catch((error) => {
      console.error(`[API] Background job error: ${error}`);
    });

    return json(
      {
        jobId: job.jobId,
        status: 'pending',
        message: 'Node generation job queued',
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[API] Error starting generation job:', error);
    return json(
      {
        error: 'server_error',
        message: 'Failed to start node generation job',
      },
      { status: 500 }
    );
  }
};

/**
 * Validates the generate request parameters.
 */
function validateGenerateRequest(body: any): {
  valid: boolean;
  error?: string;
  details?: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (typeof body.centerLat !== 'number' || body.centerLat < -90 || body.centerLat > 90) {
    errors.centerLat = 'Invalid latitude (-90 to 90)';
  }

  if (typeof body.centerLon !== 'number' || body.centerLon < -180 || body.centerLon > 180) {
    errors.centerLon = 'Invalid longitude (-180 to 180)';
  }

  if (typeof body.radius !== 'number' || body.radius < 100 || body.radius > 50000) {
    errors.radius = 'Radius must be between 100m and 50km';
  }

  if (typeof body.checkCount !== 'number' || body.checkCount < 1 || body.checkCount > 2000) {
    errors.checkCount = 'Check count must be between 1 and 2000';
  }

  if (!body.seedName || typeof body.seedName !== 'string') {
    errors.seedName = 'Seed name is required';
  }

  if (!body.serverUrl || typeof body.serverUrl !== 'string') {
    errors.serverUrl = 'Server URL is required';
  }

  if (!body.slotName || typeof body.slotName !== 'string') {
    errors.slotName = 'Slot name is required';
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      error: 'Validation failed',
      details: errors,
    };
  }

  return { valid: true };
}
