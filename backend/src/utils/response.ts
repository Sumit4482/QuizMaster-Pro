import { Response } from 'express';
import { ApiResponse, ApiError, HttpStatus, ErrorCode } from '@/types/common';
import { config } from '@/config/environment';

// Success response helper
export function successResponse<T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode: number = HttpStatus.OK,
  correlationId?: string
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    correlationId,
  };

  return res.status(statusCode).json(response);
}

// Error response helper
export function errorResponse(
  res: Response,
  error: ApiError,
  statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
  correlationId?: string
): Response {
  const response: ApiResponse = {
    success: false,
    error: {
      ...error,
      // Only include stack trace in development
      stack: config.NODE_ENV === 'development' ? error.stack : undefined,
    },
    timestamp: new Date().toISOString(),
    correlationId,
  };

  return res.status(statusCode).json(response);
}

// Validation error response
export function validationErrorResponse(
  res: Response,
  errors: Array<{ field: string; message: string; value?: any }>,
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      details: { errors },
    },
    HttpStatus.UNPROCESSABLE_ENTITY,
    correlationId
  );
}

// Authentication error responses
export function unauthorizedResponse(
  res: Response,
  message: string = 'Authentication required',
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.UNAUTHORIZED,
      message,
    },
    HttpStatus.UNAUTHORIZED,
    correlationId
  );
}

export function forbiddenResponse(
  res: Response,
  message: string = 'Access forbidden',
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.FORBIDDEN,
      message,
    },
    HttpStatus.FORBIDDEN,
    correlationId
  );
}

// Resource error responses
export function notFoundResponse(
  res: Response,
  resource: string = 'Resource',
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: `${resource} not found`,
    },
    HttpStatus.NOT_FOUND,
    correlationId
  );
}

export function conflictResponse(
  res: Response,
  message: string,
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.RESOURCE_ALREADY_EXISTS,
      message,
    },
    HttpStatus.CONFLICT,
    correlationId
  );
}

// Rate limiting error response
export function rateLimitResponse(
  res: Response,
  resetTime?: Date,
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Rate limit exceeded. Please try again later.',
      details: resetTime ? { resetTime: resetTime.toISOString() } : undefined,
    },
    HttpStatus.TOO_MANY_REQUESTS,
    correlationId
  );
}

// Internal server error response
export function internalServerErrorResponse(
  res: Response,
  error?: Error,
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      stack: config.NODE_ENV === 'development' ? error?.stack : undefined,
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
    correlationId
  );
}

// Database error response
export function databaseErrorResponse(
  res: Response,
  error?: Error,
  correlationId?: string
): Response {
  return errorResponse(
    res,
    {
      code: ErrorCode.DATABASE_ERROR,
      message: 'Database operation failed',
      stack: config.NODE_ENV === 'development' ? error?.stack : undefined,
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
    correlationId
  );
}

// Paginated response helper
export function paginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  correlationId?: string
): Response {
  const totalPages = Math.ceil(total / limit);
  
  return successResponse(
    res,
    {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    undefined,
    HttpStatus.OK,
    correlationId
  );
}

// Simple wrapper functions for easier use in controllers
export function sendSuccessResponse<T>(
  res: Response,
  statusCode: number,
  data: T,
  message?: string,
  correlationId?: string
): Response {
  return successResponse(res, data, message, statusCode, correlationId);
}

export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  correlationId?: string
): Response {
  return errorResponse(
    res,
    { code, message },
    statusCode,
    correlationId
  );
}
