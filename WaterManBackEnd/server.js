require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");
const vendorRoutes = require("./routes/vendor");
const deliveryRoutes = require("./routes/delivery");
const pool = require("./db/pool");

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5174";

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      )
        return cb(null, true);
      if (origin === allowedOrigin) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── Swagger (dev/staging only) ────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use('/swagger', (_req, res) => res.status(404).json({ error: 'not_found' }));
}

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "WaterMan API",
      version: "1.0.0",
      description: "API for WaterMan",
    },
    servers: [{ url: process.env.SERVER_URL || `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "UUID",
        },
      },
    },
  },
  apis: ["./server.js", "./routes/*.js"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ────────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is running
 */
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/public", publicRoutes);
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/admin", adminRoutes);
app.use("/vendor", vendorRoutes);
app.use("/delivery", deliveryRoutes.main);
app.use("/delivery", deliveryRoutes.statusRouter);

// ── DB test (dev/staging only) ────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get("/api/db-test", async (_req, res) => {
    try {
      const result = await pool.query("SELECT NOW()");
      res.json({ success: true, message: "Database connection successful", timestamp: result.rows[0] });
    } catch (error) {
      console.error("Database connection error:", error);
      res.status(500).json({ success: false, error: "Database connection failed" });
    }
  });
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Endpoint not found" }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(500).json({ error: "server_error", message });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigin, credentials: true },
});

const { initSocketManager } = require("./utils/socketManager");
initSocketManager(io);

server.listen(PORT, () => {
  console.log(`WaterMan API running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/swagger`);
});
