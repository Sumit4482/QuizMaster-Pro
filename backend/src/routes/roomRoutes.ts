import { Router } from 'express';
import { roomController } from '../controllers/roomController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All room routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/rooms/create:
 *   post:
 *     summary: Create a new multiplayer room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Room name
 *                 example: "Friday Night Quiz"
 *               description:
 *                 type: string
 *                 description: Room description
 *                 example: "Weekly trivia contest"
 *               maxPlayers:
 *                 type: integer
 *                 minimum: 2
 *                 maximum: 20
 *                 default: 6
 *                 description: Maximum number of players
 *               isPrivate:
 *                 type: boolean
 *                 default: false
 *                 description: Whether room is private
 *               password:
 *                 type: string
 *                 description: Password for private rooms
 *               quizConfig:
 *                 type: object
 *                 properties:
 *                   totalQuestions:
 *                     type: integer
 *                     default: 10
 *                   timePerQuestion:
 *                     type: integer
 *                     default: 30
 *                   categories:
 *                     type: array
 *                     items:
 *                       type: string
 *                     default: ["general"]
 *               gameMode:
 *                 type: string
 *                 enum: [CLASSIC, SPEED, ELIMINATION, TEAM]
 *                 default: CLASSIC
 *               category:
 *                 type: string
 *                 enum: [TRIVIA, EDUCATION, ENTERTAINMENT, SPORTS, CUSTOM]
 *                 default: TRIVIA
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Room tags for discovery
 *     responses:
 *       201:
 *         description: Room created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 */
router.post('/create', roomController.createRoom);

/**
 * @swagger
 * /api/rooms/list:
 *   get:
 *     summary: Get list of available rooms
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [TRIVIA, EDUCATION, ENTERTAINMENT, SPORTS, CUSTOM]
 *         description: Filter by category
 *       - in: query
 *         name: gameMode
 *         schema:
 *           type: string
 *           enum: [CLASSIC, SPEED, ELIMINATION, TEAM]
 *         description: Filter by game mode
 *       - in: query
 *         name: hasPassword
 *         schema:
 *           type: boolean
 *         description: Filter by password protection
 *       - in: query
 *         name: minPlayers
 *         schema:
 *           type: integer
 *         description: Minimum number of players
 *       - in: query
 *         name: maxPlayers
 *         schema:
 *           type: integer
 *         description: Maximum number of players
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for room name/description
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_desc, created_asc, players_desc, players_asc, name_asc]
 *           default: created_desc
 *         description: Sort order
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: Rooms retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/list', roomController.listRooms);

/**
 * @swagger
 * /api/rooms/my-rooms:
 *   get:
 *     summary: Get user's rooms (created and joined)
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User rooms retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/my-rooms', roomController.getMyRooms);

/**
 * @swagger
 * /api/rooms/{roomId}:
 *   get:
 *     summary: Get room details
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room details retrieved successfully
 *       404:
 *         description: Room not found
 *       401:
 *         description: Authentication required
 */
router.get('/:roomId', roomController.getRoomDetails);

/**
 * @swagger
 * /api/rooms/{roomId}/join:
 *   post:
 *     summary: Join a room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: Password for private rooms
 *     responses:
 *       200:
 *         description: Join request prepared successfully
 *       400:
 *         description: Password required or invalid request
 *       404:
 *         description: Room not found
 *       401:
 *         description: Authentication required
 */
router.post('/:roomId/join', roomController.joinRoom);

export default router;


