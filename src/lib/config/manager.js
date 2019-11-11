const generator = require('dockerfile-generator/lib/dockerGenerator')
const {fullPathToConfig} = require('../../lib/config/loader')
const VoilaError = require('../error/voila-error')
const errorMessages = require('../error/messages')

const Validator = require('jsonschema').Validator
const {parseArgsStringToArgv} = require('string-argv')

module.exports = class Manager {
  constructor(configFile) {
    Manager.validate(configFile)

    this.id = configFile.id
    this.allStacks = Manager.parseStacks(configFile.stacks)
  }

  static parseStacks(stacks) {
    return stacks.map(stack => {
      const globalEnv = stack.env
      const buildEnv = stack.stages.build.env
      const buildStage = stack.stages.build
      const runStage = stack.stages.run
      const volumes = []
      const ports = []
      const dockerfileData = []

      buildStage.images.forEach(i => dockerfileData.push({
        from: i
      }))

      if (buildEnv && buildEnv.length > 0) dockerfileData.push({ args: [] })
      if (globalEnv && globalEnv.length > 0) dockerfileData.push({ env: {} })

      const [hostWorkdir, stackWorkdir] = (() => {
        switch (typeof stack.workdir) {
          case 'string':
            dockerfileData.push({ working_dir: stack.workdir })

            return [
              fullPathToConfig(),
              stack.workdir
            ]
          case 'object':
            dockerfileData.push({ working_dir: Object.values(stack.workdir)[0] })

            return [
              Object.keys(stack.workdir)[0],
              Object.values(stack.workdir)[0]
            ]
          default:
        }
      })()

      if (globalEnv) {
        globalEnv.forEach((c) => {
          const index = dockerfileData.findIndex((e) => Object.keys(e)[0] === 'env')

          dockerfileData[index]['env'][Object.keys(c)[0]] = Object.values(c)[0]
        })
      }

      if (buildEnv) {
        buildEnv.forEach(env => {
          const index = dockerfileData.findIndex((e) => Object.keys(e)[0] === 'args')

          dockerfileData[index]['args'].push(`${[Object.keys(env)[0]]}=${Object.values(env)[0]}`)
        })
      }

      if (buildStage.actions) {
        buildStage.actions.forEach(action => {
          switch (Object.keys(action)[0]) {
            case "execute":
              dockerfileData.push({ run: ["bash", "-c", action.execute] })
              break
            default:
          }
        })
      }

      if (runStage && runStage.command) {
        dockerfileData.push({ entrypoint: ["bash", "-c", runStage.command] })
      }

      if (stack.volumes) {
        stack.volumes.forEach(volume => {
            switch (typeof volume) {
              case 'string':
                volumes.push(`${volume}:${volume}`)
                break
              case 'object':
                volumes.push(`${Object.keys(volume)[0]}:${Object.values(volume)[0]}`)
                break
              default:
            }
        })
      }

      volumes.push(`${hostWorkdir}:${stackWorkdir}`)

      if (stack.ports) stack.ports.forEach(p => ports.push(p))

      return {
        name: stack.name,
        hostDir: hostWorkdir,
        volumes: volumes,
        ports: ports,
        dockerfileData: dockerfileData,
        shouldStartAttached: () => {
          return !!(runStage && runStage.command)
        }
      }
    })
  }

  static validate(config) {
    const validator = new Validator()
    const {schema} = require('./schema')

    validator.validate(config, schema, { throwError: true })

    return config
  }

  getStack(stackName) {
    const stack = this.allStacks.find((c) => c.name === stackName)

    if (stack) {
      return stack
    } else {
      throw new VoilaError(errorMessages.STACK_NOT_FOUND)
    }
  }

  findInDockerfileData(stackName, key) {
    const obj = this.allStacks
      .find((c) => c.name === stackName)
      .dockerfileData
      .find((e) => Object.keys(e)[0] === key)

    return obj ? obj[key]: null
  }

  toDockerfile(stackName) {
    return generator.generateDockerFileFromArray(
      this.allStacks.find((c) => c.name === stackName).dockerfileData
    )
  }
}
