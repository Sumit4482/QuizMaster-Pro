import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { CDNService } from '../infrastructure/cdn/cdnService';
import { CacheService } from '../infrastructure/cache/cacheService';

export interface AssetOptimizationConfig {
  inputDirectory: string;
  outputDirectory: string;
  publicPath: string;
  enableCompression: boolean;
  enableMinification: boolean;
  enableImageOptimization: boolean;
  enableBundling: boolean;
  enableCodeSplitting: boolean;
  enableTreeShaking: boolean;
  enableLazyLoading: boolean;
  cacheMaxAge: number;
  compressionLevel: number;
  imageQuality: number;
  supportedFormats: string[];
  excludePatterns: string[];
}

export interface OptimizedAsset {
  originalPath: string;
  optimizedPath: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  hash: string;
  mimeType: string;
  optimizations: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface BundleConfig {
  name: string;
  entryPoints: string[];
  outputPath: string;
  splitChunks: boolean;
  externals?: Record<string, string>;
  plugins?: string[];
}

export interface LazyLoadingManifest {
  routes: Record<string, {
    chunks: string[];
    preload: string[];
    prefetch: string[];
  }>;
  components: Record<string, {
    chunk: string;
    dependencies: string[];
  }>;
}

export interface AssetManifest {
  version: string;
  timestamp: Date;
  assets: Record<string, OptimizedAsset>;
  bundles: Record<string, {
    files: string[];
    hash: string;
    size: number;
  }>;
  lazyLoading: LazyLoadingManifest;
}

export class AssetOptimization {
  private config: AssetOptimizationConfig;
  private cacheService: CacheService;
  private cdnService?: CDNService;
  private assetManifest: AssetManifest;
  private optimizedAssets: Map<string, OptimizedAsset> = new Map();

  constructor(
    config: AssetOptimizationConfig,
    cacheService: CacheService,
    cdnService?: CDNService
  ) {
    this.config = config;
    this.cacheService = cacheService;
    this.cdnService = cdnService;

    this.assetManifest = {
      version: '1.0.0',
      timestamp: new Date(),
      assets: {},
      bundles: {},
      lazyLoading: {
        routes: {},
        components: {}
      }
    };

    this.ensureDirectories();

    logger.info('Asset Optimization service initialized', {
      component: 'AssetOptimization',
      config: {
        inputDirectory: config.inputDirectory,
        outputDirectory: config.outputDirectory,
        enableCompression: config.enableCompression,
        enableMinification: config.enableMinification,
        enableImageOptimization: config.enableImageOptimization
      }
    });
  }

  /**
   * Ensure output directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.config.outputDirectory, { recursive: true });
      await fs.mkdir(path.join(this.config.outputDirectory, 'images'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputDirectory, 'js'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputDirectory, 'css'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputDirectory, 'fonts'), { recursive: true });
    } catch (error) {
      logger.error('Failed to create output directories', {
        component: 'AssetOptimization',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Optimize all assets in the input directory
   */
  async optimizeAll(): Promise<AssetManifest> {
    try {
      logger.info('Starting asset optimization', { component: 'AssetOptimization' });

      // Clear previous optimizations
      this.optimizedAssets.clear();
      this.assetManifest.assets = {};

      // Find all assets
      const assets = await this.findAssets(this.config.inputDirectory);

      // Optimize assets by type
      const imageAssets = assets.filter(asset => this.isImageFile(asset));
      const jsAssets = assets.filter(asset => this.isJavaScriptFile(asset));
      const cssAssets = assets.filter(asset => this.isCSSFile(asset));
      const fontAssets = assets.filter(asset => this.isFontFile(asset));
      const otherAssets = assets.filter(asset => 
        !this.isImageFile(asset) && 
        !this.isJavaScriptFile(asset) && 
        !this.isCSSFile(asset) && 
        !this.isFontFile(asset)
      );

      // Process different asset types
      await Promise.all([
        this.optimizeImages(imageAssets),
        this.optimizeJavaScript(jsAssets),
        this.optimizeCSS(cssAssets),
        this.optimizeFonts(fontAssets),
        this.optimizeOtherAssets(otherAssets)
      ]);

      // Create bundles if enabled
      if (this.config.enableBundling) {
        await this.createBundles();
      }

      // Generate lazy loading manifest
      if (this.config.enableLazyLoading) {
        await this.generateLazyLoadingManifest();
      }

      // Update manifest
      this.assetManifest.timestamp = new Date();
      this.assetManifest.assets = Object.fromEntries(this.optimizedAssets);

      // Save manifest
      await this.saveManifest();

      // Upload to CDN if configured
      if (this.cdnService) {
        await this.uploadToCDN();
      }

      logger.info('Asset optimization completed', {
        component: 'AssetOptimization',
        totalAssets: assets.length,
        optimizedAssets: this.optimizedAssets.size,
        totalSizeBefore: this.calculateTotalOriginalSize(),
        totalSizeAfter: this.calculateTotalOptimizedSize(),
        compressionRatio: this.calculateOverallCompressionRatio()
      });

      return this.assetManifest;
    } catch (error) {
      logger.error('Asset optimization failed', {
        component: 'AssetOptimization',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Find all assets in directory
   */
  private async findAssets(directory: string): Promise<string[]> {
    const assets: string[] = [];
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively find assets in subdirectories
          const subAssets = await this.findAssets(fullPath);
          assets.push(...subAssets);
        } else if (entry.isFile()) {
          // Check if file should be excluded
          const relativePath = path.relative(this.config.inputDirectory, fullPath);
          if (!this.shouldExcludeFile(relativePath)) {
            assets.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to find assets in directory', {
        component: 'AssetOptimization',
        directory,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return assets;
  }

  /**
   * Check if file should be excluded
   */
  private shouldExcludeFile(filePath: string): boolean {
    return this.config.excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filePath);
    });
  }

  /**
   * Optimize image files
   */
  private async optimizeImages(imagePaths: string[]): Promise<void> {
    if (!this.config.enableImageOptimization || imagePaths.length === 0) return;

    logger.info('Optimizing images', { 
      component: 'AssetOptimization', 
      count: imagePaths.length 
    });

    const promises = imagePaths.map(async (imagePath) => {
      try {
        const optimized = await this.optimizeImage(imagePath);
        if (optimized) {
          this.optimizedAssets.set(optimized.originalPath, optimized);
        }
      } catch (error) {
        logger.error('Failed to optimize image', {
          component: 'AssetOptimization',
          imagePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Optimize a single image
   */
  private async optimizeImage(imagePath: string): Promise<OptimizedAsset | null> {
    try {
      const stats = await fs.stat(imagePath);
      const originalSize = stats.size;
      
      // Read original file
      const originalBuffer = await fs.readFile(imagePath);
      
      // Generate hash
      const hash = crypto.createHash('md5').update(originalBuffer).digest('hex');
      
      // Check cache
      const cacheKey = `optimized_image:${hash}`;
      const cached = await this.cacheService.get<OptimizedAsset>(cacheKey);
      if (cached) {
        return cached;
      }

      const relativePath = path.relative(this.config.inputDirectory, imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const basename = path.basename(imagePath, ext);
      const dirname = path.dirname(relativePath);
      
      // Create output path with hash
      const outputFileName = `${basename}-${hash.substring(0, 8)}${ext}`;
      const outputPath = path.join(this.config.outputDirectory, 'images', dirname, outputFileName);
      
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Optimize based on file type
      let optimizedBuffer: Buffer;
      let optimizations: string[] = [];

      switch (ext) {
        case '.jpg':
        case '.jpeg':
          optimizedBuffer = await this.optimizeJPEG(originalBuffer);
          optimizations.push('JPEG compression');
          break;
        case '.png':
          optimizedBuffer = await this.optimizePNG(originalBuffer);
          optimizations.push('PNG compression');
          break;
        case '.webp':
          optimizedBuffer = originalBuffer; // Already optimized format
          optimizations.push('WebP format');
          break;
        case '.svg':
          optimizedBuffer = await this.optimizeSVG(originalBuffer);
          optimizations.push('SVG minification');
          break;
        default:
          optimizedBuffer = originalBuffer;
      }

      // Write optimized file
      await fs.writeFile(outputPath, optimizedBuffer);

      const optimizedSize = optimizedBuffer.length;
      const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

      const optimizedAsset: OptimizedAsset = {
        originalPath: imagePath,
        optimizedPath: outputPath,
        originalSize,
        optimizedSize,
        compressionRatio,
        hash,
        mimeType: this.getMimeType(ext),
        optimizations,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.cacheMaxAge * 1000)
      };

      // Cache result
      await this.cacheService.set(cacheKey, optimizedAsset, { 
        ttl: this.config.cacheMaxAge 
      });

      return optimizedAsset;
    } catch (error) {
      logger.error('Image optimization failed', {
        component: 'AssetOptimization',
        imagePath,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Optimize JPEG images (mock implementation)
   */
  private async optimizeJPEG(buffer: Buffer): Promise<Buffer> {
    // In a real implementation, this would use libraries like sharp, jimp, or imagemin
    // For now, return original buffer with simulated optimization
    logger.debug('JPEG optimization (mock)', { 
      component: 'AssetOptimization',
      originalSize: buffer.length 
    });
    return buffer;
  }

  /**
   * Optimize PNG images (mock implementation)
   */
  private async optimizePNG(buffer: Buffer): Promise<Buffer> {
    // In a real implementation, this would use libraries like pngquant, optipng
    logger.debug('PNG optimization (mock)', { 
      component: 'AssetOptimization',
      originalSize: buffer.length 
    });
    return buffer;
  }

  /**
   * Optimize SVG images
   */
  private async optimizeSVG(buffer: Buffer): Promise<Buffer> {
    try {
      // Basic SVG optimization (remove comments, extra whitespace)
      let svgContent = buffer.toString('utf8');
      
      // Remove comments
      svgContent = svgContent.replace(/<!--[\s\S]*?-->/g, '');
      
      // Remove extra whitespace
      svgContent = svgContent.replace(/\s+/g, ' ').trim();
      
      // Remove unnecessary attributes (simplified)
      svgContent = svgContent.replace(/\s(xmlns:[\w\d]+="[^"]*")/g, '');
      
      return Buffer.from(svgContent, 'utf8');
    } catch (error) {
      logger.error('SVG optimization failed', {
        component: 'AssetOptimization',
        error: error instanceof Error ? error.message : String(error)
      });
      return buffer;
    }
  }

  /**
   * Optimize JavaScript files
   */
  private async optimizeJavaScript(jsPaths: string[]): Promise<void> {
    if (!this.config.enableMinification || jsPaths.length === 0) return;

    logger.info('Optimizing JavaScript', { 
      component: 'AssetOptimization', 
      count: jsPaths.length 
    });

    const promises = jsPaths.map(async (jsPath) => {
      try {
        const optimized = await this.optimizeJSFile(jsPath);
        if (optimized) {
          this.optimizedAssets.set(optimized.originalPath, optimized);
        }
      } catch (error) {
        logger.error('Failed to optimize JavaScript file', {
          component: 'AssetOptimization',
          jsPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Optimize a single JavaScript file
   */
  private async optimizeJSFile(jsPath: string): Promise<OptimizedAsset | null> {
    try {
      const originalContent = await fs.readFile(jsPath, 'utf8');
      const originalSize = Buffer.byteLength(originalContent, 'utf8');
      
      const hash = crypto.createHash('md5').update(originalContent).digest('hex');
      
      // Check cache
      const cacheKey = `optimized_js:${hash}`;
      const cached = await this.cacheService.get<OptimizedAsset>(cacheKey);
      if (cached) {
        return cached;
      }

      const relativePath = path.relative(this.config.inputDirectory, jsPath);
      const ext = path.extname(jsPath);
      const basename = path.basename(jsPath, ext);
      const dirname = path.dirname(relativePath);
      
      const outputFileName = `${basename}-${hash.substring(0, 8)}.min${ext}`;
      const outputPath = path.join(this.config.outputDirectory, 'js', dirname, outputFileName);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Minify JavaScript (basic implementation)
      let optimizedContent = originalContent;
      let optimizations: string[] = [];

      if (this.config.enableMinification) {
        optimizedContent = await this.minifyJavaScript(optimizedContent);
        optimizations.push('Minification');
      }

      if (this.config.enableTreeShaking) {
        optimizedContent = await this.treeShakeJavaScript(optimizedContent);
        optimizations.push('Tree shaking');
      }

      // Compress if enabled
      if (this.config.enableCompression) {
        // Compression would typically be handled by the server (gzip)
        optimizations.push('Compression ready');
      }

      await fs.writeFile(outputPath, optimizedContent, 'utf8');

      const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');
      const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

      const optimizedAsset: OptimizedAsset = {
        originalPath: jsPath,
        optimizedPath: outputPath,
        originalSize,
        optimizedSize,
        compressionRatio,
        hash,
        mimeType: 'application/javascript',
        optimizations,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.cacheMaxAge * 1000)
      };

      await this.cacheService.set(cacheKey, optimizedAsset, { 
        ttl: this.config.cacheMaxAge 
      });

      return optimizedAsset;
    } catch (error) {
      logger.error('JavaScript optimization failed', {
        component: 'AssetOptimization',
        jsPath,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Minify JavaScript (basic implementation)
   */
  private async minifyJavaScript(content: string): Promise<string> {
    // Basic minification (in production, use tools like Terser or UglifyJS)
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/;\s*}/g, '}') // Remove semicolons before closing braces
      .trim();
  }

  /**
   * Tree shake JavaScript (mock implementation)
   */
  private async treeShakeJavaScript(content: string): Promise<string> {
    // Mock tree shaking - in production, use tools like Rollup or Webpack
    logger.debug('Tree shaking JavaScript (mock)', { component: 'AssetOptimization' });
    return content;
  }

  /**
   * Optimize CSS files
   */
  private async optimizeCSS(cssPaths: string[]): Promise<void> {
    if (!this.config.enableMinification || cssPaths.length === 0) return;

    logger.info('Optimizing CSS', { 
      component: 'AssetOptimization', 
      count: cssPaths.length 
    });

    const promises = cssPaths.map(async (cssPath) => {
      try {
        const optimized = await this.optimizeCSSFile(cssPath);
        if (optimized) {
          this.optimizedAssets.set(optimized.originalPath, optimized);
        }
      } catch (error) {
        logger.error('Failed to optimize CSS file', {
          component: 'AssetOptimization',
          cssPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Optimize a single CSS file
   */
  private async optimizeCSSFile(cssPath: string): Promise<OptimizedAsset | null> {
    try {
      const originalContent = await fs.readFile(cssPath, 'utf8');
      const originalSize = Buffer.byteLength(originalContent, 'utf8');
      
      const hash = crypto.createHash('md5').update(originalContent).digest('hex');
      
      // Check cache
      const cacheKey = `optimized_css:${hash}`;
      const cached = await this.cacheService.get<OptimizedAsset>(cacheKey);
      if (cached) {
        return cached;
      }

      const relativePath = path.relative(this.config.inputDirectory, cssPath);
      const ext = path.extname(cssPath);
      const basename = path.basename(cssPath, ext);
      const dirname = path.dirname(relativePath);
      
      const outputFileName = `${basename}-${hash.substring(0, 8)}.min${ext}`;
      const outputPath = path.join(this.config.outputDirectory, 'css', dirname, outputFileName);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Minify CSS
      let optimizedContent = this.minifyCSS(originalContent);
      const optimizations = ['Minification'];

      await fs.writeFile(outputPath, optimizedContent, 'utf8');

      const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');
      const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

      const optimizedAsset: OptimizedAsset = {
        originalPath: cssPath,
        optimizedPath: outputPath,
        originalSize,
        optimizedSize,
        compressionRatio,
        hash,
        mimeType: 'text/css',
        optimizations,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.cacheMaxAge * 1000)
      };

      await this.cacheService.set(cacheKey, optimizedAsset, { 
        ttl: this.config.cacheMaxAge 
      });

      return optimizedAsset;
    } catch (error) {
      logger.error('CSS optimization failed', {
        component: 'AssetOptimization',
        cssPath,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Minify CSS
   */
  private minifyCSS(content: string): string {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/;\s*}/g, '}') // Remove semicolons before closing braces
      .replace(/\s*{\s*/g, '{') // Remove whitespace around opening braces
      .replace(/;\s*/g, ';') // Remove whitespace after semicolons
      .replace(/:\s*/g, ':') // Remove whitespace after colons
      .trim();
  }

  /**
   * Optimize font files
   */
  private async optimizeFonts(fontPaths: string[]): Promise<void> {
    if (fontPaths.length === 0) return;

    logger.info('Processing fonts', { 
      component: 'AssetOptimization', 
      count: fontPaths.length 
    });

    // For fonts, mainly copy with hash-based naming
    const promises = fontPaths.map(async (fontPath) => {
      try {
        const optimized = await this.processFontFile(fontPath);
        if (optimized) {
          this.optimizedAssets.set(optimized.originalPath, optimized);
        }
      } catch (error) {
        logger.error('Failed to process font file', {
          component: 'AssetOptimization',
          fontPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Process a single font file
   */
  private async processFontFile(fontPath: string): Promise<OptimizedAsset | null> {
    try {
      const buffer = await fs.readFile(fontPath);
      const originalSize = buffer.length;
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      
      const relativePath = path.relative(this.config.inputDirectory, fontPath);
      const ext = path.extname(fontPath);
      const basename = path.basename(fontPath, ext);
      const dirname = path.dirname(relativePath);
      
      const outputFileName = `${basename}-${hash.substring(0, 8)}${ext}`;
      const outputPath = path.join(this.config.outputDirectory, 'fonts', dirname, outputFileName);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, buffer);

      const optimizedAsset: OptimizedAsset = {
        originalPath: fontPath,
        optimizedPath: outputPath,
        originalSize,
        optimizedSize: originalSize,
        compressionRatio: 0,
        hash,
        mimeType: this.getMimeType(ext),
        optimizations: ['Cache-friendly naming'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.cacheMaxAge * 1000)
      };

      return optimizedAsset;
    } catch (error) {
      logger.error('Font processing failed', {
        component: 'AssetOptimization',
        fontPath,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Optimize other asset files
   */
  private async optimizeOtherAssets(otherPaths: string[]): Promise<void> {
    if (otherPaths.length === 0) return;

    logger.info('Processing other assets', { 
      component: 'AssetOptimization', 
      count: otherPaths.length 
    });

    const promises = otherPaths.map(async (assetPath) => {
      try {
        const optimized = await this.processOtherAsset(assetPath);
        if (optimized) {
          this.optimizedAssets.set(optimized.originalPath, optimized);
        }
      } catch (error) {
        logger.error('Failed to process asset file', {
          component: 'AssetOptimization',
          assetPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Process other asset types
   */
  private async processOtherAsset(assetPath: string): Promise<OptimizedAsset | null> {
    try {
      const buffer = await fs.readFile(assetPath);
      const originalSize = buffer.length;
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      
      const relativePath = path.relative(this.config.inputDirectory, assetPath);
      const ext = path.extname(assetPath);
      const basename = path.basename(assetPath, ext);
      const dirname = path.dirname(relativePath);
      
      const outputFileName = `${basename}-${hash.substring(0, 8)}${ext}`;
      const outputPath = path.join(this.config.outputDirectory, dirname, outputFileName);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, buffer);

      const optimizedAsset: OptimizedAsset = {
        originalPath: assetPath,
        optimizedPath: outputPath,
        originalSize,
        optimizedSize: originalSize,
        compressionRatio: 0,
        hash,
        mimeType: this.getMimeType(ext),
        optimizations: ['Cache-friendly naming'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.cacheMaxAge * 1000)
      };

      return optimizedAsset;
    } catch (error) {
      logger.error('Asset processing failed', {
        component: 'AssetOptimization',
        assetPath,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Create asset bundles
   */
  private async createBundles(): Promise<void> {
    if (!this.config.enableBundling) return;

    logger.info('Creating asset bundles', { component: 'AssetOptimization' });

    // Default bundle configurations
    const defaultBundles: BundleConfig[] = [
      {
        name: 'vendor',
        entryPoints: ['node_modules/**/*.js'],
        outputPath: 'js/vendor.bundle.js',
        splitChunks: true,
        externals: {
          'react': 'React',
          'react-dom': 'ReactDOM'
        }
      },
      {
        name: 'main',
        entryPoints: ['src/**/*.js', 'src/**/*.ts'],
        outputPath: 'js/main.bundle.js',
        splitChunks: true
      }
    ];

    for (const bundleConfig of defaultBundles) {
      try {
        await this.createBundle(bundleConfig);
      } catch (error) {
        logger.error('Failed to create bundle', {
          component: 'AssetOptimization',
          bundleName: bundleConfig.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Create a single bundle
   */
  private async createBundle(config: BundleConfig): Promise<void> {
    // Mock bundle creation - in production, use Webpack, Rollup, or similar
    logger.info('Creating bundle (mock)', {
      component: 'AssetOptimization',
      bundleName: config.name,
      entryPoints: config.entryPoints
    });

    // Create mock bundle entry
    const bundleContent = `// Bundle: ${config.name}\n// Generated: ${new Date().toISOString()}\n`;
    const bundleHash = crypto.createHash('md5').update(bundleContent).digest('hex');
    
    this.assetManifest.bundles[config.name] = {
      files: [config.outputPath],
      hash: bundleHash,
      size: Buffer.byteLength(bundleContent, 'utf8')
    };
  }

  /**
   * Generate lazy loading manifest
   */
  private async generateLazyLoadingManifest(): Promise<void> {
    if (!this.config.enableLazyLoading) return;

    logger.info('Generating lazy loading manifest', { component: 'AssetOptimization' });

    // Mock lazy loading configuration
    this.assetManifest.lazyLoading = {
      routes: {
        '/': { chunks: ['main'], preload: ['vendor'], prefetch: [] },
        '/dashboard': { chunks: ['dashboard'], preload: ['main'], prefetch: ['charts'] },
        '/quiz': { chunks: ['quiz'], preload: ['main'], prefetch: ['questions'] },
        '/admin': { chunks: ['admin'], preload: ['main'], prefetch: ['users'] }
      },
      components: {
        'LazyQuizComponent': { chunk: 'quiz', dependencies: ['questions'] },
        'LazyDashboard': { chunk: 'dashboard', dependencies: ['charts'] },
        'LazyAdminPanel': { chunk: 'admin', dependencies: ['users'] }
      }
    };
  }

  /**
   * Save asset manifest
   */
  private async saveManifest(): Promise<void> {
    try {
      const manifestPath = path.join(this.config.outputDirectory, 'asset-manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(this.assetManifest, null, 2), 'utf8');
      
      logger.info('Asset manifest saved', {
        component: 'AssetOptimization',
        manifestPath,
        assetsCount: Object.keys(this.assetManifest.assets).length
      });
    } catch (error) {
      logger.error('Failed to save asset manifest', {
        component: 'AssetOptimization',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Upload optimized assets to CDN
   */
  private async uploadToCDN(): Promise<void> {
    if (!this.cdnService) return;

    logger.info('Uploading assets to CDN', { 
      component: 'AssetOptimization',
      assetsCount: this.optimizedAssets.size
    });

    const uploadPromises = Array.from(this.optimizedAssets.values()).map(async (asset) => {
      try {
        const buffer = await fs.readFile(asset.optimizedPath);
        const relativePath = path.relative(this.config.outputDirectory, asset.optimizedPath);
        
        await this.cdnService.uploadAsset(
          relativePath,
          buffer,
          asset.mimeType,
          {
            cacheControl: `public, max-age=${this.config.cacheMaxAge}`,
            metadata: {
              originalPath: asset.originalPath,
              hash: asset.hash,
              optimizations: asset.optimizations.join(', ')
            },
            compress: this.config.enableCompression,
            optimize: true
          }
        );
      } catch (error) {
        logger.error('Failed to upload asset to CDN', {
          component: 'AssetOptimization',
          assetPath: asset.originalPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(uploadPromises);

    logger.info('CDN upload completed', {
      component: 'AssetOptimization',
      uploadedAssets: this.optimizedAssets.size
    });
  }

  /**
   * Get file type checking methods
   */
  private isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'].includes(ext);
  }

  private isJavaScriptFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.ts', '.jsx', '.tsx'].includes(ext);
  }

  private isCSSFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.css', '.scss', '.sass', '.less'].includes(ext);
  }

  private isFontFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext);
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.js': 'application/javascript',
      '.ts': 'application/javascript',
      '.jsx': 'application/javascript',
      '.tsx': 'application/javascript',
      '.css': 'text/css',
      '.scss': 'text/css',
      '.sass': 'text/css',
      '.less': 'text/css',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'font/otf',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.txt': 'text/plain'
    };

    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Calculate metrics
   */
  private calculateTotalOriginalSize(): number {
    return Array.from(this.optimizedAssets.values())
      .reduce((sum, asset) => sum + asset.originalSize, 0);
  }

  private calculateTotalOptimizedSize(): number {
    return Array.from(this.optimizedAssets.values())
      .reduce((sum, asset) => sum + asset.optimizedSize, 0);
  }

  private calculateOverallCompressionRatio(): number {
    const originalSize = this.calculateTotalOriginalSize();
    const optimizedSize = this.calculateTotalOptimizedSize();
    
    return originalSize > 0 ? ((originalSize - optimizedSize) / originalSize) * 100 : 0;
  }

  /**
   * Get optimization report
   */
  getOptimizationReport(): {
    totalAssets: number;
    totalOriginalSize: number;
    totalOptimizedSize: number;
    overallCompressionRatio: number;
    optimizationsByType: Record<string, number>;
    largestSavings: OptimizedAsset[];
  } {
    const assets = Array.from(this.optimizedAssets.values());
    const optimizationsByType: Record<string, number> = {};

    assets.forEach(asset => {
      asset.optimizations.forEach(optimization => {
        optimizationsByType[optimization] = (optimizationsByType[optimization] || 0) + 1;
      });
    });

    const largestSavings = assets
      .filter(asset => asset.compressionRatio > 0)
      .sort((a, b) => b.compressionRatio - a.compressionRatio)
      .slice(0, 10);

    return {
      totalAssets: assets.length,
      totalOriginalSize: this.calculateTotalOriginalSize(),
      totalOptimizedSize: this.calculateTotalOptimizedSize(),
      overallCompressionRatio: this.calculateOverallCompressionRatio(),
      optimizationsByType,
      largestSavings
    };
  }

  /**
   * Get asset manifest
   */
  getManifest(): AssetManifest {
    return this.assetManifest;
  }

  /**
   * Clear optimization cache
   */
  async clearCache(): Promise<void> {
    await this.cacheService.clearNamespace('optimized');
    this.optimizedAssets.clear();
    
    logger.info('Asset optimization cache cleared', {
      component: 'AssetOptimization'
    });
  }
}

export default AssetOptimization;

