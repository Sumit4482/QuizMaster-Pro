import { Router } from 'express';
import { FileController } from './fileController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, param, query } from 'express-validator';
import multer from 'multer';

const router = Router();
const fileController = new FileController();

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'application/json',
      'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

// Validation rules
const fileIdValidation = [
  param('fileId')
    .notEmpty()
    .withMessage('File ID is required')
];

const searchFilesValidation = [
  query('category')
    .optional()
    .isIn(['images', 'documents', 'audio', 'video', 'other'])
    .withMessage('Invalid category'),
  query('mimeType')
    .optional()
    .isLength({ min: 3 })
    .withMessage('Invalid MIME type'),
  query('uploadedBy')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format for dateFrom'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format for dateTo'),
  query('sizeMin')
    .optional()
    .isInt({ min: 0 })
    .withMessage('sizeMin must be a non-negative integer'),
  query('sizeMax')
    .optional()
    .isInt({ min: 1 })
    .withMessage('sizeMax must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('sortBy')
    .optional()
    .isIn(['uploadedAt', 'size', 'originalName', 'category'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

const generateSignedUrlValidation = [
  body('fileName')
    .notEmpty()
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be between 1 and 255 characters'),
  body('mimeType')
    .notEmpty()
    .matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.-]{0,126}\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.-]{0,126}$/)
    .withMessage('Invalid MIME type format'),
  body('expiresIn')
    .optional()
    .isInt({ min: 60, max: 86400 })
    .withMessage('expiresIn must be between 60 and 86400 seconds')
];

// Public routes
router.get('/health', fileController.healthCheck);

// File download (public access for now - could add auth later)
router.get('/download/:fileId',
  rateLimitMiddleware('lenient'),
  fileIdValidation,
  validationMiddleware,
  fileController.downloadFile
);

// File information and search (authentication required)
router.get('/search',
  rateLimitMiddleware('lenient'),
  searchFilesValidation,
  validationMiddleware,
  authenticateToken,
  fileController.searchFiles
);

router.get('/statistics',
  rateLimitMiddleware('lenient'),
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  fileController.getStatistics
);

router.get('/:fileId',
  rateLimitMiddleware('lenient'),
  fileIdValidation,
  validationMiddleware,
  authenticateToken,
  fileController.getFile
);

// File upload (authenticated users)
router.post('/upload',
  rateLimitMiddleware('strict'), // Strict rate limiting for uploads
  upload.single('file'),
  authenticateToken,
  fileController.uploadFile
);

// Signed URL generation (authenticated users)
router.post('/signed-url',
  rateLimitMiddleware('moderate'),
  generateSignedUrlValidation,
  validationMiddleware,
  authenticateToken,
  fileController.generateSignedUrl
);

// File deletion (file owner or admin)
router.delete('/:fileId',
  rateLimitMiddleware('moderate'),
  fileIdValidation,
  validationMiddleware,
  authenticateToken,
  fileController.deleteFile
);

// Error handling middleware for multer
router.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB',
        timestamp: new Date().toISOString()
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file allowed per upload',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  if (error.message && error.message.includes('not allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }

  next(error);
});

export default router;

