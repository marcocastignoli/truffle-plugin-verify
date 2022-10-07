const axios = require('axios')
const cliLogger = require('cli-logger')
const fs = require('fs')
const path = require('path')
const { API_URL } = require('./constants')
const { enforce, enforceOrThrow, normaliseContractPath, getNetwork } = require('./util')
const { version } = require('./package.json')

const logger = cliLogger({ level: 'info' })

module.exports = async (config) => {
  // Set debug logging
  if (config.debug) logger.level('debug')
  logger.debug('DEBUG logging is turned ON')
  logger.debug(`Running truffle-plugin-sourcify v${version}`)

  const options = await parseConfig(config)

  // Verify each contract
  const contractNameAddressPairs = config._.slice(1)

  // Track which contracts failed verification
  const failedContracts = []
  for (const contractNameAddressPair of contractNameAddressPairs) {
    logger.info(`Verifying ${contractNameAddressPair}`)
    try {
      const [contractName, contractAddress] = contractNameAddressPair.split('@')

      const artifact = getArtifact(contractName, options)

      enforceOrThrow(
        artifact.networks && artifact.networks[`${options.networkId}`],
        `No instance of contract ${artifact.contractName} found for network id ${options.networkId}`
      )

      let response = await sendVerifyRequest(artifact, options)

      logResponse(response, contractName)

      if (response.status !== 200) {
        failedContracts.push(`${contractNameAddressPair}`)
      }
    } catch (error) {
      logger.error(error.message)
      failedContracts.push(contractNameAddressPair)
    }
    logger.info()
  }

  enforce(
    failedContracts.length === 0,
    `Failed to verify ${failedContracts.length} contract(s): ${failedContracts.join(', ')}`,
    logger
  )

  logger.info(`Successfully verified ${contractNameAddressPairs.length} contract(s).`)
}

const logResponse = (response, contractName) => {
  try {
    const result = response.data.result
    result.forEach(contract => {
      if (contract.storageTimestamp) {
        logger.info(` Contract ${contractName} is already verified, verification date: ${contract.storageTimestamp}`)
      } else {
        logger.info(` Contract ${contractName} verified succesfully`)
      }
      logger.info(`   ${contract.address}: ${contract.status}_match`)
      logger.info(`   Sourcify url: https://sourcify.dev/#/lookup/${contract.address}`)
    })
  } catch (e) {
    throw new Error(`${JSON.stringify(response.data)}`)
  }
}

const parseConfig = async (config) => {
  const provider = config.provider
  const networkConfig = config.networks && config.networks[config.network]
  const { chainId, networkId } = await getNetwork(config, logger)

  let apiUrl = API_URL

  enforce(config._.length > 1, 'No contract name(s) specified', logger)

  const projectDir = config.working_directory
  const contractsBuildDir = config.contracts_build_directory
  const contractsDir = config.contracts_directory

  return {
    apiUrl,
    chainId,
    networkId,
    provider,
    projectDir,
    contractsBuildDir,
    contractsDir,
  }
}

const getArtifact = (contractName, options) => {
  const artifactPath = path.resolve(options.contractsBuildDir, `${contractName}.json`)

  logger.debug(`Reading artifact file at ${artifactPath}`)
  enforceOrThrow(fs.existsSync(artifactPath), `Could not find ${contractName} artifact at ${artifactPath}`)

  // Stringify + parse to make a deep copy (to avoid bugs with PR #19)
  return JSON.parse(JSON.stringify(require(artifactPath)))
}

const sendVerifyRequest = async (artifact, options) => {
  const compilerVersion = extractCompilerVersion(artifact)
  const metadata = artifact.metadata
  const inputJSON = getInputJSON(artifact, options)

  const files = {}
  Object.keys(inputJSON.sources).forEach(path => {
    files[path.replace(/^.*[\\\/]/, '')] = inputJSON.sources[path].content
  })
  files['metadata.json'] = JSON.stringify(JSON.parse(metadata))

  const postQueries = {
    "address": artifact.networks[`${options.networkId}`].address,
    "chain": `${options.chainId}`,
    "files": files
  }

  logger.debug('Sending verify request with POST arguments:')
  logger.debug(JSON.stringify(postQueries, null, 2))
  try {
    return await axios.post(options.apiUrl, postQueries)
  } catch (error) {
    throw new Error(error.response.data.message)
  }
}

const extractCompilerVersion = (artifact) => {
  const metadata = JSON.parse(artifact.metadata)

  const compilerVersion = `v${metadata.compiler.version}`

  return compilerVersion
}

const getInputJSON = (artifact, options) => {
  const metadata = JSON.parse(artifact.metadata)
  const libraries = getLibraries(artifact, options)

  // Sort the source files so that the "main" contract is on top
  const orderedSources = Object.keys(metadata.sources)
    .reverse()
    .sort((a, b) => {
      if (a === artifact.ast.absolutePath) return -1
      if (b === artifact.ast.absolutePath) return 1
      return 0
    })

  const sources = {}
  for (const contractPath of orderedSources) {
    // If we're on Windows we need to de-Unixify the path so that Windows can read the file
    // We also need to replace the 'project:' prefix so that the file can be read
    const normalisedContractPath = normaliseContractPath(contractPath, options)
    const absolutePath = require.resolve(normalisedContractPath)
    const content = fs.readFileSync(absolutePath, 'utf8')

    // Remove the 'project:' prefix that was added in Truffle v5.3.14
    const relativeContractPath = contractPath.replace('project:', '')

    sources[relativeContractPath] = { content }
  }

  const inputJSON = {
    language: metadata.language,
    sources,
    settings: {
      remappings: metadata.settings.remappings,
      optimizer: metadata.settings.optimizer,
      evmVersion: metadata.settings.evmVersion,
      libraries
    }
  }

  return inputJSON
}

const getLibraries = (artifact, options) => {
  const libraries = {
    // Example data structure of libraries object in Standard Input JSON
    // 'ConvertLib.sol': {
    //   'ConvertLib': '0x...',
    //   'OtherLibInSameSourceFile': '0x...'
    // }
  }

  const links = artifact.networks[`${options.networkId}`].links || {}

  for (const libraryName in links) {
    // Retrieve the source path for this library
    const libraryArtifact = getArtifact(libraryName, options)

    // Remove the 'project:' prefix that was added in Truffle v5.3.14
    const librarySourceFile = libraryArtifact.ast.absolutePath.replace('project:', '')

    // Add the library to the object of libraries for this source path
    const librariesForSourceFile = libraries[librarySourceFile] || {}
    librariesForSourceFile[libraryName] = links[libraryName]
    libraries[librarySourceFile] = librariesForSourceFile
  }

  return libraries
}
