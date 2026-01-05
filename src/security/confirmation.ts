import { CONFIRMATION_REQUIRED_OPERATIONS } from './config.js';

export interface ConfirmationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if an operation requires confirmation and if it was provided.
 */
export function checkConfirmation(
  operation: string,
  confirmFlag: boolean | undefined,
  requireConfirmation: boolean
): ConfirmationResult {
  // If confirmation is not required globally, allow all
  if (!requireConfirmation) {
    return { allowed: true };
  }

  // Check if this operation requires confirmation
  if (!CONFIRMATION_REQUIRED_OPERATIONS.has(operation)) {
    return { allowed: true };
  }

  // Operation requires confirmation
  if (confirmFlag !== true) {
    return {
      allowed: false,
      reason: `Operation '${operation}' requires explicit confirmation. Set 'confirm: true' to proceed.`,
    };
  }

  return { allowed: true };
}

/**
 * Validate that sensitive data is not being bulk exported.
 */
export function validateQueryLimits(
  requestedLimit: number,
  maxAllowed: number,
  resourceType: string
): { limit: number; truncated: boolean } {
  if (requestedLimit > maxAllowed) {
    return {
      limit: maxAllowed,
      truncated: true,
    };
  }
  return {
    limit: requestedLimit,
    truncated: false,
  };
}
