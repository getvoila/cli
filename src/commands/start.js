const {Command, flags} = require('@oclif/command')

const ConfigManager = require('../lib/config/manager')
const {loadConfig, fullPathToConfig} = require('../lib/config/loader')
const runTask = require('../lib/run-task')
const dockerUtils = require('../lib/docker-utils')
const VoilaError = require('../lib/error/voila-error')

class StartCommand extends Command {
  async run() {
    const cmd = this
    const {flags} = this.parse(StartCommand)

    const tasks = [
      {
        title: 'Loading config',
        action: ctx => {
          const [message, config] = loadConfig()

          ctx.config = config

          if (message) cmd.warn(message)
        }
      },
      {
        title: 'Parsing and validating config',
        action: ctx => {
          ctx.config = new ConfigManager(ctx.config)
        }
      },
      {
        title: 'Downloading dependencies and building images',
        action: ctx => {
          ctx.config.modules.forEach((c) => {
            const imageName = dockerUtils.imageName(ctx.config.id, c.name)
            const dockerfile = ctx.config.toDockerfile(c.name)

            dockerUtils.buildImage(imageName, dockerfile, flags['no-cache'], flags['pull'])
          })
        }
      },
      {
        title: 'Starting modules',
        action: ctx => {
          return ctx.config.modules.map((c) => {
            const imageName = dockerUtils.imageName(ctx.config.id, c.name)
            const containerName = dockerUtils.containerName(ctx.config.id, c.name)

            if (dockerUtils.isContainerRunning(containerName)) {
              return `Container ${containerName} is already running`
            } else {
              const result = dockerUtils.startContainer(c.volumes, c.ports, containerName, imageName)

              if (result.stderr.length > 0) {
                throw new VoilaError(result.stderr)
              } else {
                return `Started container ${containerName}`
              }
            }
          })
        }
      }
    ]

    await runTask(tasks, cmd)
  }
}

StartCommand.description = `Start containers locally.`

StartCommand.flags = {
  'no-cache': flags.boolean({
    description: `Don't use cache when building the image.`,
    default: false
  }),
  'pull': flags.boolean({
    description: `Always attempt to pull a newer version of the image.`,
    default: false
  })
}

module.exports = StartCommand
