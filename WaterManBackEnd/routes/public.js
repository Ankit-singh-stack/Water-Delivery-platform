const router = require('express').Router()
const pool   = require('../db/pool')

/**
 * @openapi
 * /public/states:
 *   get:
 *     tags: [Public]
 *     summary: List all active states
 *     responses:
 *       200:
 *         description: Array of states
 */
router.get('/states', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, state_code, country_code
       FROM states WHERE is_active = TRUE ORDER BY name`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

/**
 * @openapi
 * /public/cities:
 *   get:
 *     tags: [Public]
 *     summary: List active cities, optionally filtered by state
 *     parameters:
 *       - in: query
 *         name: stateId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter cities by state UUID
 *     responses:
 *       200:
 *         description: Array of cities with state info
 */
router.get('/cities', async (req, res, next) => {
  try {
    const { stateId } = req.query

    const { rows } = stateId
      ? await pool.query(
          `SELECT c.id, c.name, s.id AS state_id, s.name AS state_name, s.state_code
           FROM cities c JOIN states s ON s.id = c.state_id
           WHERE c.state_id = $1 AND c.is_active = TRUE ORDER BY c.name`,
          [stateId]
        )
      : await pool.query(
          `SELECT c.id, c.name, s.id AS state_id, s.name AS state_name, s.state_code
           FROM cities c JOIN states s ON s.id = c.state_id
           WHERE c.is_active = TRUE ORDER BY s.name, c.name`
        )

    res.json(rows)
  } catch (err) { next(err) }
})

/**
 * @openapi
 * /public/tanker-types:
 *   get:
 *     tags: [Public]
 *     summary: List active tanker types with pricing
 *     responses:
 *       200:
 *         description: Array of tanker types ordered by display_order
 */
router.get('/tanker-types', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, capacity_litres, base_price, display_order, image_url
       FROM tanker_types WHERE is_active = TRUE ORDER BY display_order`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

module.exports = router
