import { Request, Response } from 'express';
import { FileService } from './fileService';
import { logger } from '../../utils/logger';
import { successResponse, errorResponse, badRequestResponse, notFoundResponse } from '../../utils/responseUtils';
import { AuthenticatedRequest } from '../../types/auth';

export class FileController {
  private fileService: FileService;

  constructor() {
    this.fileService = new FileService();
  }

  public uploadFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        badRequestResponse(res, 'No file uploaded');
        return;
      }

      const { category, tags, metadata, resize, compress, generateThumbnail } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        badRequestResponse(res, 'Authentication required');
        return;
      }

      const fileData = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
        uploadedBy: userId,
        category,
        tags: tags ? JSON.parse(tags) : undefined,
        metadata: metadata ? JSON.parse(metadata) : undefined
      };

      const processingOptions = {
        resize: resize ? JSON.parse(resize) : undefined,
        compress: compress === 'true',
        generateThumbnail: generateThumbnail === 'true',
        extractMetadata: true
      };

      const file = await this.fileService.uploadFile(fileData, processingOptions);

      logger.info('File uploaded successfully', {
        component: 'FileController',
        fileId: file.id,
        originalName: file.originalName,
        size: file.size,
        userId
      });

      successResponse(res, file, 'File uploaded successfully', 201);
    } catch (error) {
      logger.error('File upload failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });
      errorResponse(res, error instanceof Error ? error.message : 'Failed to upload file');
    }
  };

  public getFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;

      if (!fileId) {
        badRequestResponse(res, 'File ID is required');
        return;
      }

      const file = await this.fileService.getFile(fileId);

      if (!file) {
        notFoundResponse(res, 'File not found');
        return;
      }

      successResponse(res, file, 'File retrieved successfully');
    } catch (error) {
      logger.error('Get file failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error),
        fileId: req.params.fileId
      });
      errorResponse(res, 'Failed to retrieve file');
    }
  };

  public downloadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;

      if (!fileId) {
        badRequestResponse(res, 'File ID is required');
        return;
      }

      const result = await this.fileService.getFileStream(fileId);

      if (!result.stream) {
        notFoundResponse(res, 'File not found or not accessible');
        return;
      }

      res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

      result.stream.pipe(res);
    } catch (error) {
      logger.error('Download file failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error),
        fileId: req.params.fileId
      });
      errorResponse(res, 'Failed to download file');
    }
  };

  public searchFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        category, mimeType, uploadedBy, tags,
        dateFrom, dateTo, sizeMin, sizeMax,
        limit, offset, sortBy, sortOrder
      } = req.query;

      const filters = {
        category: category as string,
        mimeType: mimeType as string,
        uploadedBy: uploadedBy as string,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        sizeMin: sizeMin ? parseInt(sizeMin as string) : undefined,
        sizeMax: sizeMax ? parseInt(sizeMax as string) : undefined
      };

      const options = {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc'
      };

      const result = await this.fileService.searchFiles(filters, options);

      successResponse(res, result, 'Files searched successfully');
    } catch (error) {
      logger.error('Search files failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to search files');
    }
  };

  public deleteFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;
      const userId = req.user?.id;

      if (!fileId) {
        badRequestResponse(res, 'File ID is required');
        return;
      }

      if (!userId) {
        badRequestResponse(res, 'Authentication required');
        return;
      }

      const result = await this.fileService.deleteFile(fileId, userId);

      if (result.success) {
        successResponse(res, {}, 'File deleted successfully');
      } else {
        notFoundResponse(res, 'File not found or access denied');
      }
    } catch (error) {
      logger.error('Delete file failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error),
        fileId: req.params.fileId,
        userId: req.user?.id
      });
      errorResponse(res, 'Failed to delete file');
    }
  };

  public generateSignedUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { fileName, mimeType, expiresIn } = req.body;
      const userId = req.user?.id;

      if (!fileName || !mimeType) {
        badRequestResponse(res, 'fileName and mimeType are required');
        return;
      }

      if (!userId) {
        badRequestResponse(res, 'Authentication required');
        return;
      }

      const result = await this.fileService.generateSignedUploadUrl(
        fileName,
        mimeType,
        userId,
        expiresIn ? parseInt(expiresIn) : undefined
      );

      successResponse(res, result, 'Signed upload URL generated successfully', 201);
    } catch (error) {
      logger.error('Generate signed URL failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });
      errorResponse(res, 'Failed to generate signed upload URL');
    }
  };

  public getStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.fileService.getFileStatistics();

      successResponse(res, stats, 'File statistics retrieved successfully');
    } catch (error) {
      logger.error('Get file statistics failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to retrieve file statistics');
    }
  };

  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.fileService.healthCheck();

      if (health.status === 'healthy') {
        successResponse(res, health, 'File service is healthy');
      } else {
        errorResponse(res, 'File service is unhealthy', 503, health);
      }
    } catch (error) {
      logger.error('File service health check failed', {
        component: 'FileController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'File service is unhealthy', 503);
    }
  };
}

export default FileController;

