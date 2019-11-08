const ValidationError = require('jsonschema').ValidationError
const VoilaError = require('./error/voila-error')
const logger = require('../lib/logger')

const runTask = async (tasks, ctx = {}) => {
  ctx.output = []

  try {
    for (const task of tasks) {
      if (task.skip && task.skip(ctx)) {
        continue
      } else {
        await task.action(ctx)
      }
    }

    return ctx.output
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error(`YAML config validation failed: ${error.stack.replace(/instance/g, 'root')}`)
    } else if (error instanceof VoilaError) {
      logger.error(error.message)
    } else {
      logger.error(error.stack)
    }
  }
}

module.exports = runTask
