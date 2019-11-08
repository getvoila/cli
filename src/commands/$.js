const {Command, flags} = require('@oclif/command')
const chalk = require('chalk')

const {loadConfig, parseConfig, executeModuleAction} = require('../lib/tasks')
const {relativeModulePath, moduleHostPath, doesPathIncludeCurrentPath} = require('../lib/paths')
const runTask = require('../lib/run-task')
const dockerUtils = require('../lib/docker-utils')
const VoilaError = require('../lib/error/voila-error')
const errorMessages = require('../lib/error/messages')
const logger = require('../lib/logger')

class $Command extends Command {
  async run() {
    const {argv, flags} = this.parse($Command)

    const tasks = [
      {
        action: ctx => loadConfig(ctx, false)
      },
      {
        action: ctx => parseConfig(ctx, false)
      },
      {
        action: ctx => {
          executeModuleAction(ctx, flags, argv, (ctx, module) => {
            this.processCommand(ctx, argv, module.name, flags['detach-command'], flags['module-path'])
          })
        }
      }
    ]

    await runTask(tasks)
  }

  processCommand(ctx, argv, moduleName, shouldDetach, executeIn) {
    const containerName = dockerUtils.containerName(ctx.config.id, moduleName)

    if (dockerUtils.isContainerRunning(containerName)) {
      const module = ctx.config.getModule(moduleName)
      const commandFromConfig = ctx.config.findInDockerfileData(moduleName, 'cmd')

      const command = (argv.length === 0 && !commandFromConfig) ?
        '' :
        (argv.length === 0) ? commandFromConfig : argv.join(' ')

      if (executeIn || doesPathIncludeCurrentPath(moduleHostPath(module))) {
        const workdir = (executeIn) ? executeIn : relativeModulePath(module).join('/')

        if (command === '') {
          throw new VoilaError(errorMessages.SPECIFY_COMMAND)
        } else if (shouldDetach) {
          $Command.log(moduleName, workdir, command, true)

          dockerUtils.runCommandAsync(containerName, workdir, command)
        } else {
          $Command.log(moduleName, workdir, command, false)

          const subProcess = dockerUtils.runCommand(containerName, workdir, command)

          subProcess.on('exit', code => {
            if (code === 1) logger.error(errorMessages.EXEC_INTERRUPTED)
          })

          subProcess.on('error', code => {
            logger.error(errorMessages.containerError(containerName, code, command))
          })
        }
      } else {
        throw new VoilaError(errorMessages.wrongModuleHostDirError(moduleHostPath(module).join('/')))
      }
    } else {
      throw new VoilaError(errorMessages.moduleNotRunningError(moduleName))
    }
  }

  static log(moduleName, workdir, command, isAsync) {
    if (isAsync) {
      logger.dimInfo(`Asynchronously executing "${command}" in ${moduleName}:${workdir}`)
    } else {
      logger.dimInfo(`Executing "${command}" in ${moduleName}:${workdir}`)
    }
  }
}

$Command.description = `Run a shell command inside of a running module.`

$Command.usage = `$ [ARGS...]`

$Command.strict = false

$Command.flags = {
  'module-name': flags.string({
    description: `Specify module name.`
  }),
  'module-path': flags.string({
    description: `Specify an absolute path inside the container that you'd like your command to be executed in.`
  }),
  'detach-command': flags.boolean({
    description: `Run command asynchronously.`,
    default: false
  })
}

module.exports = $Command
