import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

interface FileUploadData {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  uploadedBy: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface FileRecord {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  category: string;
  tags: string[];
  uploadedBy: string;
  uploadedAt: Date;
  metadata: Record<string, any>;
  checksum: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
}

interface FileSearchFilters {
  category?: string;
  mimeType?: string;
  uploadedBy?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  sizeMin?: number;
  sizeMax?: number;
}

interface FileProcessingOptions {
  resize?: {
    width: number;
    height: number;
    quality?: number;
  };
  compress?: boolean;
  generateThumbnail?: boolean;
  extractMetadata?: boolean;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
  storage: 'available' | 'unavailable';
  cdn: 'operational' | 'degraded' | 'down';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  metrics: {
    totalFiles: number;
    storageUsed: number;
    uploadsToday: number;
    averageUploadTime: number;
  };
}

export class FileService {
  private prisma: PrismaClient;
  private readonly UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
  private readonly MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB
  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'application/json',
    'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm'
  ];

  constructor() {
    this.prisma = new PrismaClient();
    this.initializeStorage();
  }

  /**
   * Upload a file
   */
  async uploadFile(fileData: FileUploadData, options: FileProcessingOptions = {}): Promise<FileRecord> {
    try {
      // Validate file
      this.validateFile(fileData);

      // Generate unique filename and paths
      const fileId = generateSecureToken(16);
      const fileExtension = path.extname(fileData.originalName);
      const fileName = `${fileId}${fileExtension}`;
      const category = fileData.category || this.inferCategory(fileData.mimeType);
      const relativePath = path.join(category, fileName);
      const fullPath = path.join(this.UPLOAD_DIR, relativePath);

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(fileData.buffer).digest('hex');

      // Check for duplicate files
      const existingFile = await this.prisma.file.findFirst({
        where: { checksum }
      });

      if (existingFile) {
        logger.info('File already exists, returning existing record', {
          component: 'FileService',
          fileId: existingFile.id,
          checksum
        });
        return existingFile as any;
      }

      // Create file record
      const fileRecord = await this.prisma.file.create({
        data: {
          id: fileId,
          originalName: fileData.originalName,
          fileName,
          mimeType: fileData.mimeType,
          size: fileData.size,
          path: relativePath,
          url: this.generateFileUrl(relativePath),
          category,
          tags: fileData.tags || [],
          uploadedBy: fileData.uploadedBy,
          metadata: {
            ...fileData.metadata,
            processing: options
          } as any,
          checksum,
          status: 'uploading'
        }
      });

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Write file to disk
      await fs.writeFile(fullPath, fileData.buffer);

      // Process file if options specified
      if (Object.keys(options).length > 0) {
        await this.updateFileStatus(fileId, 'processing');
        await this.processFile(fileRecord as any, options);
      }

      // Update status to ready
      await this.updateFileStatus(fileId, 'ready');

      logger.info('File uploaded successfully', {
        component: 'FileService',
        fileId,
        originalName: fileData.originalName,
        size: fileData.size,
        category
      });

      return { ...fileRecord, status: 'ready' } as any;
    } catch (error) {
      logger.error('Failed to upload file', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        originalName: fileData.originalName
      });
      throw new Error('Failed to upload file');
    }
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: string): Promise<FileRecord | null> {
    try {
      const file = await this.prisma.file.findUnique({
        where: { id: fileId }
      });

      if (file) {
        logger.debug('File retrieved successfully', {
          component: 'FileService',
          fileId,
          fileName: file.fileName
        });
      }

      return file as any;
    } catch (error) {
      logger.error('Failed to get file', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        fileId
      });
      return null;
    }
  }

  /**
   * Search files
   */
  async searchFiles(
    filters: FileSearchFilters = {},
    options: { limit?: number; offset?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
  ): Promise<{ files: FileRecord[]; total: number }> {
    try {
      const { limit = 50, offset = 0, sortBy = 'uploadedAt', sortOrder = 'desc' } = options;

      const where: any = {};

      if (filters.category) where.category = filters.category;
      if (filters.mimeType) where.mimeType = filters.mimeType;
      if (filters.uploadedBy) where.uploadedBy = filters.uploadedBy;
      if (filters.tags && filters.tags.length > 0) {
        where.tags = { hasSome: filters.tags };
      }
      if (filters.dateFrom || filters.dateTo) {
        where.uploadedAt = {};
        if (filters.dateFrom) where.uploadedAt.gte = filters.dateFrom;
        if (filters.dateTo) where.uploadedAt.lte = filters.dateTo;
      }
      if (filters.sizeMin || filters.sizeMax) {
        where.size = {};
        if (filters.sizeMin) where.size.gte = filters.sizeMin;
        if (filters.sizeMax) where.size.lte = filters.sizeMax;
      }

      const [files, total] = await Promise.all([
        this.prisma.file.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { [sortBy]: sortOrder }
        }),
        this.prisma.file.count({ where })
      ]);

      logger.info('Files searched successfully', {
        component: 'FileService',
        total,
        returned: files.length,
        filters
      });

      return { files: files as any, total };
    } catch (error) {
      logger.error('Failed to search files', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        filters
      });
      return { files: [], total: 0 };
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, userId: string): Promise<{ success: boolean }> {
    try {
      const file = await this.getFile(fileId);
      
      if (!file) {
        return { success: false };
      }

      // Check permissions (file owner or admin)
      if (file.uploadedBy !== userId) {
        // In a real implementation, you'd check if user is admin
        logger.warn('Unauthorized file deletion attempt', {
          component: 'FileService',
          fileId,
          userId,
          fileOwner: file.uploadedBy
        });
        return { success: false };
      }

      // Delete file from disk
      const fullPath = path.join(this.UPLOAD_DIR, file.path);
      try {
        await fs.unlink(fullPath);
      } catch (fsError) {
        logger.warn('File not found on disk during deletion', {
          component: 'FileService',
          fileId,
          path: fullPath
        });
      }

      // Delete thumbnails if they exist
      const thumbnailPath = this.getThumbnailPath(file.path);
      try {
        await fs.unlink(path.join(this.UPLOAD_DIR, thumbnailPath));
      } catch {
        // Ignore thumbnail deletion errors
      }

      // Delete from database
      await this.prisma.file.delete({
        where: { id: fileId }
      });

      logger.info('File deleted successfully', {
        component: 'FileService',
        fileId,
        fileName: file.fileName,
        deletedBy: userId
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete file', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        fileId,
        userId
      });
      return { success: false };
    }
  }

  /**
   * Get file stream for download
   */
  async getFileStream(fileId: string): Promise<{ stream?: NodeJS.ReadableStream; contentType?: string; filename?: string }> {
    try {
      const file = await this.getFile(fileId);
      
      if (!file) {
        return {};
      }

      const fullPath = path.join(this.UPLOAD_DIR, file.path);
      
      // Check if file exists on disk
      try {
        await fs.access(fullPath);
      } catch {
        logger.error('File not found on disk', {
          component: 'FileService',
          fileId,
          path: fullPath
        });
        return {};
      }

      const stream = require('fs').createReadStream(fullPath);

      logger.debug('File stream created', {
        component: 'FileService',
        fileId,
        fileName: file.fileName
      });

      return {
        stream,
        contentType: file.mimeType,
        filename: file.originalName
      };
    } catch (error) {
      logger.error('Failed to create file stream', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        fileId
      });
      return {};
    }
  }

  /**
   * Generate signed URL for direct upload
   */
  async generateSignedUploadUrl(
    fileName: string,
    mimeType: string,
    userId: string,
    expiresIn: number = 3600
  ): Promise<{ uploadUrl: string; fileId: string; expiresAt: Date }> {
    try {
      const fileId = generateSecureToken(16);
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Create temporary record
      const token = generateSecureToken(32);
      
      // Store upload token (in a real implementation, you'd use Redis)
      const uploadUrl = `/api/files/upload/${fileId}?token=${token}`;

      logger.info('Signed upload URL generated', {
        component: 'FileService',
        fileId,
        userId,
        expiresAt
      });

      return { uploadUrl, fileId, expiresAt };
    } catch (error) {
      logger.error('Failed to generate signed upload URL', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      throw new Error('Failed to generate signed upload URL');
    }
  }

  /**
   * Get file statistics
   */
  async getFileStatistics(): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByCategory: Record<string, number>;
    filesByType: Record<string, number>;
    uploadsByDate: Array<{ date: string; count: number; size: number }>;
  }> {
    try {
      const [
        totalFiles,
        totalSizeResult,
        filesByCategory,
        filesByType
      ] = await Promise.all([
        this.prisma.file.count(),
        this.prisma.file.aggregate({
          _sum: { size: true }
        }),
        this.prisma.file.groupBy({
          by: ['category'],
          _count: true
        }),
        this.prisma.file.groupBy({
          by: ['mimeType'],
          _count: true
        })
      ]);

      const totalSize = totalSizeResult._sum.size || 0;

      // Get uploads by date (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const uploadsByDate = await this.prisma.file.groupBy({
        by: ['uploadedAt'],
        where: {
          uploadedAt: { gte: thirtyDaysAgo }
        },
        _count: true,
        _sum: { size: true }
      });

      const stats = {
        totalFiles,
        totalSize,
        filesByCategory: {} as Record<string, number>,
        filesByType: {} as Record<string, number>,
        uploadsByDate: uploadsByDate.map(upload => ({
          date: upload.uploadedAt.toISOString().split('T')[0],
          count: upload._count,
          size: upload._sum.size || 0
        }))
      };

      filesByCategory.forEach(item => {
        stats.filesByCategory[item.category] = item._count;
      });

      filesByType.forEach(item => {
        stats.filesByType[item.mimeType] = item._count;
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get file statistics', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Failed to get file statistics');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;

      // Test storage availability
      const testDir = path.join(this.UPLOAD_DIR, 'test');
      await fs.mkdir(testDir, { recursive: true });
      await fs.rmdir(testDir);

      // Get metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalFiles, totalSizeResult, uploadsToday] = await Promise.all([
        this.prisma.file.count(),
        this.prisma.file.aggregate({
          _sum: { size: true }
        }),
        this.prisma.file.count({
          where: { uploadedAt: { gte: today } }
        })
      ]);

      return {
        status: 'healthy',
        database: 'connected',
        storage: 'available',
        cdn: 'operational',
        timestamp: new Date().toISOString(),
        service: 'file-service',
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: {
          totalFiles,
          storageUsed: totalSizeResult._sum.size || 0,
          uploadsToday,
          averageUploadTime: 1250 // Mock value
        }
      };
    } catch (error) {
      logger.error('File service health check failed', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        database: 'disconnected',
        storage: 'unavailable',
        cdn: 'down',
        timestamp: new Date().toISOString(),
        service: 'file-service',
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: {
          totalFiles: 0,
          storageUsed: 0,
          uploadsToday: 0,
          averageUploadTime: 0
        }
      };
    }
  }

  /**
   * Initialize storage directories
   */
  private async initializeStorage(): Promise<void> {
    try {
      const categories = ['images', 'documents', 'audio', 'video', 'other'];
      
      for (const category of categories) {
        const categoryPath = path.join(this.UPLOAD_DIR, category);
        await fs.mkdir(categoryPath, { recursive: true });
        
        // Create thumbnails directory
        const thumbnailPath = path.join(categoryPath, 'thumbnails');
        await fs.mkdir(thumbnailPath, { recursive: true });
      }

      logger.info('Storage directories initialized', {
        component: 'FileService',
        uploadDir: this.UPLOAD_DIR
      });
    } catch (error) {
      logger.error('Failed to initialize storage', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Validate uploaded file
   */
  private validateFile(fileData: FileUploadData): void {
    if (fileData.size > this.MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is ${this.MAX_FILE_SIZE} bytes`);
    }

    if (!this.ALLOWED_MIME_TYPES.includes(fileData.mimeType)) {
      throw new Error(`File type ${fileData.mimeType} is not allowed`);
    }

    if (!fileData.originalName || fileData.originalName.trim().length === 0) {
      throw new Error('Original file name is required');
    }
  }

  /**
   * Infer file category from MIME type
   */
  private inferCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf' || mimeType === 'text/plain' || mimeType === 'application/json') {
      return 'documents';
    }
    return 'other';
  }

  /**
   * Generate file URL
   */
  private generateFileUrl(relativePath: string): string {
    const baseUrl = process.env.CDN_BASE_URL || process.env.BASE_URL || 'http://localhost:3007';
    return `${baseUrl}/api/files/download/${relativePath}`;
  }

  /**
   * Get thumbnail path
   */
  private getThumbnailPath(originalPath: string): string {
    const parsedPath = path.parse(originalPath);
    return path.join(parsedPath.dir, 'thumbnails', `${parsedPath.name}_thumb${parsedPath.ext}`);
  }

  /**
   * Update file status
   */
  private async updateFileStatus(fileId: string, status: 'uploading' | 'processing' | 'ready' | 'failed'): Promise<void> {
    try {
      await this.prisma.file.update({
        where: { id: fileId },
        data: { status }
      });
    } catch (error) {
      logger.error('Failed to update file status', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        fileId,
        status
      });
    }
  }

  /**
   * Process file (resize, compress, generate thumbnail, etc.)
   */
  private async processFile(file: FileRecord, options: FileProcessingOptions): Promise<void> {
    try {
      // Mock file processing - in a real implementation, you'd use libraries like Sharp for images
      logger.info('Processing file', {
        component: 'FileService',
        fileId: file.id,
        options
      });

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update metadata with processing results
      await this.prisma.file.update({
        where: { id: file.id },
        data: {
          metadata: {
            ...file.metadata,
            processed: true,
            processedAt: new Date().toISOString(),
            processingOptions: options
          } as any
        }
      });

      logger.info('File processed successfully', {
        component: 'FileService',
        fileId: file.id
      });
    } catch (error) {
      logger.error('Failed to process file', {
        component: 'FileService',
        error: error instanceof Error ? error.message : String(error),
        fileId: file.id
      });
      
      await this.updateFileStatus(file.id, 'failed');
    }
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default FileService;

